import { unzip } from "fflate";

import {
  MAX_ARCHIVE_ENTRIES,
  MAX_COVER_IMAGE_SIZE_BYTES,
  MAX_METADATA_ENTRY_SIZE_BYTES,
  MetadataExtractionError,
  createMetadata,
  normalizeText,
  validateFile,
} from "./types.js";

const decoder = new TextDecoder("utf-8", { fatal: true });

const ratingValues = new Map([
  ["general audiences", "General Audiences"],
  ["teen and up audiences", "Teen And Up Audiences"],
  ["mature", "Mature"],
  ["explicit", "Explicit"],
  ["not rated", "Not Rated"],
]);

const categoryValues = new Map([
  ["f/f", "F/F"],
  ["f/m", "F/M"],
  ["m/m", "M/M"],
  ["gen", "Gen"],
  ["multi", "Multi"],
  ["other", "Other"],
]);

const warningValues = new Map([
  ["graphic depictions of violence", "Graphic Depictions Of Violence"],
  ["major character death", "Major Character Death"],
  ["rape/non-con", "Rape/Non-Con"],
  ["underage", "Underage"],
  ["no archive warnings apply", "No Archive Warnings Apply"],
  [
    "creator chose not to use archive warnings",
    "Creator Chose Not To Use Archive Warnings",
  ],
]);

const tagSections = new Map([
  ["other relationship tags to be added", "character"],
  ["other character tags to be added", "additional"],
  ["other additional tags to be added", "additional"],
]);

function decodeXml(bytes) {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new MetadataExtractionError("The EPUB contains invalid XML text.");
  }
}

function parseXml(xmlText) {
  if (typeof DOMParser === "undefined") {
    throw new MetadataExtractionError("XML parsing is not available in this browser.");
  }
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (
    document.getElementsByTagName("parsererror").length > 0 ||
    !document.documentElement
  ) {
    throw new MetadataExtractionError("The EPUB metadata is malformed.");
  }
  return document;
}

function descendantsByLocalName(element, localName) {
  return Array.from(element.getElementsByTagName("*")).filter(
    (child) => child.localName === localName,
  );
}

function firstText(document, localName) {
  const element = descendantsByLocalName(document, localName)[0];
  return element ? normalizeText(element.textContent) : null;
}

function findAttribute(element, attributeName) {
  return element.getAttribute(attributeName) || null;
}

function readZipEntries(bytes, requestedPaths, maxEntrySize, allowOversized = false) {
  let entryCount = 0;
  let invalidSize = false;
  let tooManyEntries = false;

  return new Promise((resolve, reject) => {
    try {
      unzip(
        bytes,
        {
          filter(entry) {
            entryCount += 1;
            if (entryCount > MAX_ARCHIVE_ENTRIES) {
              tooManyEntries = true;
              return false;
            }
            if (!requestedPaths.has(entry.name)) {
              return false;
            }
            if (
              !Number.isSafeInteger(entry.originalSize) ||
              entry.originalSize < 0 ||
              entry.originalSize > maxEntrySize
            ) {
              invalidSize = true;
              return false;
            }
            return true;
          },
        },
        (error, entries) => {
          if (error) {
            reject(new MetadataExtractionError("The EPUB archive is damaged."));
          } else if (tooManyEntries) {
            reject(new MetadataExtractionError("The EPUB archive has too many entries."));
          } else if (invalidSize && !allowOversized) {
            reject(
              new MetadataExtractionError(
                "The EPUB metadata file exceeds the allowed size.",
              ),
            );
          } else {
            resolve(entries);
          }
        },
      );
    } catch (error) {
      reject(new MetadataExtractionError("The selected file is not a valid EPUB."));
    }
  });
}

function resolveArchivePath(baseFilePath, reference) {
  let decodedReference;
  try {
    decodedReference = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  } catch (error) {
    return null;
  }

  const segments = decodedReference.startsWith("/")
    ? []
    : baseFilePath.split("/").slice(0, -1);
  for (const segment of decodedReference.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function parseSubjects(document, metadata) {
  const subjects = descendantsByLocalName(document, "subject")
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean);

  metadata.subject = subjects.length > 0 ? subjects.join("; ") : null;

  let currentTagType = "fandom";
  const seenTags = new Set();
  for (const subject of subjects) {
    const normalized = subject.toLowerCase();
    if (normalized === "fanworks") {
      continue;
    }
    if (tagSections.has(normalized)) {
      currentTagType = tagSections.get(normalized);
      continue;
    }
    if (ratingValues.has(normalized)) {
      metadata.rating ??= ratingValues.get(normalized);
      continue;
    }
    if (categoryValues.has(normalized)) {
      metadata.category ??= categoryValues.get(normalized);
      continue;
    }
    if (warningValues.has(normalized)) {
      const warning = warningValues.get(normalized);
      if (!metadata.archiveWarnings.includes(warning)) {
        metadata.archiveWarnings.push(warning);
      }
      continue;
    }

    let type = currentTagType;
    if (type === "fandom" && (subject.includes("/") || subject.includes(" & "))) {
      type = "relationship";
    }
    const tagKey = `${type}:${normalized}`;
    if (!seenTags.has(tagKey)) {
      seenTags.add(tagKey);
      metadata.tags.push({ name: subject, type });
    }
  }
}

function parseCoverReference(document) {
  const manifestItems = descendantsByLocalName(document, "item");
  const coverMeta = descendantsByLocalName(document, "meta").find(
    (element) => element.getAttribute("name")?.toLowerCase() === "cover",
  );
  const coverId = coverMeta?.getAttribute("content");
  const coverItem =
    manifestItems.find((item) => item.getAttribute("id") === coverId) ??
    manifestItems.find((item) =>
      (item.getAttribute("properties") || "")
        .split(/\s+/)
        .includes("cover-image"),
    );
  if (!coverItem) {
    return null;
  }
  const href = findAttribute(coverItem, "href");
  const mediaType = findAttribute(coverItem, "media-type");
  return href && mediaType ? { href, mediaType } : null;
}

export async function extractEpubMetadata(file) {
  validateFile(file);
  if (!file.name.toLowerCase().endsWith(".epub")) {
    throw new MetadataExtractionError("The selected file is not an EPUB.");
  }

  let fileBytes;
  try {
    fileBytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    throw new MetadataExtractionError("Could not read the selected EPUB file.");
  }
  if (
    fileBytes.length < 4 ||
    fileBytes[0] !== 0x50 ||
    fileBytes[1] !== 0x4b
  ) {
    throw new MetadataExtractionError("The selected file is not a valid EPUB archive.");
  }

  const initialEntries = await readZipEntries(
    fileBytes,
    new Set(["mimetype", "META-INF/container.xml"]),
    MAX_METADATA_ENTRY_SIZE_BYTES,
  );
  if (decodeXml(initialEntries.mimetype ?? new Uint8Array()).trim() !== "application/epub+zip") {
    throw new MetadataExtractionError("The archive does not have the EPUB mimetype.");
  }
  const containerBytes = initialEntries["META-INF/container.xml"];
  if (!containerBytes) {
    throw new MetadataExtractionError("The EPUB is missing its container metadata.");
  }

  const containerDocument = parseXml(decodeXml(containerBytes));
  const rootfile = descendantsByLocalName(containerDocument, "rootfile").find(
    (element) => findAttribute(element, "media-type") === "application/oebps-package+xml",
  );
  const packagePath = rootfile && findAttribute(rootfile, "full-path");
  const normalizedPackagePath =
    packagePath && resolveArchivePath("", packagePath);
  if (!normalizedPackagePath) {
    throw new MetadataExtractionError("The EPUB package document could not be located.");
  }

  const packageEntries = await readZipEntries(
    fileBytes,
    new Set([normalizedPackagePath]),
    MAX_METADATA_ENTRY_SIZE_BYTES,
  );
  const packageBytes = packageEntries[normalizedPackagePath];
  if (!packageBytes) {
    throw new MetadataExtractionError("The EPUB package document is missing.");
  }
  const packageDocument = parseXml(decodeXml(packageBytes));
  const metadata = createMetadata("EPUB", file.name);
  metadata.title = firstText(packageDocument, "title");
  metadata.author = firstText(packageDocument, "creator");
  metadata.description = firstText(packageDocument, "description");
  metadata.language = firstText(packageDocument, "language");
  metadata.publisher = firstText(packageDocument, "publisher");
  metadata.publicationDate = firstText(packageDocument, "date");
  metadata.identifier = firstText(packageDocument, "identifier");
  parseSubjects(packageDocument, metadata);

  const cover = parseCoverReference(packageDocument);
  if (cover) {
    const coverPath = resolveArchivePath(packagePath, cover.href);
    if (coverPath) {
      const coverEntries = await readZipEntries(
        fileBytes,
        new Set([coverPath]),
        MAX_COVER_IMAGE_SIZE_BYTES,
        true,
      );
      const coverData = coverEntries[coverPath];
      if (coverData) {
        metadata.coverImage = {
          mediaType: cover.mediaType,
          data: coverData,
        };
      }
    }
  }

  return metadata;
}
