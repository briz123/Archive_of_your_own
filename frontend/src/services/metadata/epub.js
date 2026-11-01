import { unzip } from "fflate";

import {
  MAX_ARCHIVE_ENTRIES,
  MAX_COVER_IMAGE_SIZE_BYTES,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_METADATA_ENTRY_SIZE_BYTES,
  MetadataExtractionError,
  createMetadata,
  normalizeText,
  validateFile,
} from "./types.js";

const MAX_DIRECTORY_FILES = 10_000;
const MAX_NESTED_ARCHIVE_DEPTH = 2;
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
  ["choose not to use archive warnings", "Creator Chose Not To Use Archive Warnings"],
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

const tagTypePrefixes = new Map([
  ["fandom", "fandom"],
  ["relationship", "relationship"],
  ["character", "character"],
  ["additional tag", "additional"],
  ["additional tags", "additional"],
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

function normalizeArchivePath(path) {
  return path
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/|\/)+/, "")
    .toLowerCase();
}

function readZipEntries(bytes, requestedPaths, maxEntrySize, allowOversized = false) {
  const normalizedRequestedPaths = new Set(
    [...requestedPaths].map(normalizeArchivePath),
  );
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
            if (!normalizedRequestedPaths.has(normalizeArchivePath(entry.name))) {
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
            resolve(
              Object.fromEntries(
                Object.entries(entries).map(([name, data]) => [
                  normalizeArchivePath(name),
                  data,
                ]),
              ),
            );
          }
        },
      );
    } catch (error) {
      reject(new MetadataExtractionError("The selected file is not a valid EPUB."));
    }
  });
}

function readAllZipEntries(bytes) {
  let entryCount = 0;
  let totalSize = 0;
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
            if (entry.name.endsWith("/")) return false;
            if (
              !Number.isSafeInteger(entry.originalSize) ||
              entry.originalSize < 0 ||
              totalSize + entry.originalSize > MAX_IMPORT_FILE_SIZE_BYTES
            ) {
              invalidSize = true;
              return false;
            }
            totalSize += entry.originalSize;
            return true;
          },
        },
        (error, files) => {
          if (error) {
            reject(new MetadataExtractionError("The EPUB archive is damaged."));
          } else if (tooManyEntries) {
            reject(new MetadataExtractionError("The EPUB archive has too many entries."));
          } else if (invalidSize) {
            reject(new MetadataExtractionError("The EPUB contents exceed the 100 MiB limit."));
          } else {
            resolve(
              new Map(
                Object.entries(files).map(([name, data]) => [
                  normalizeArchivePath(name),
                  data,
                ]),
              ),
            );
          }
        },
      );
    } catch (error) {
      reject(new MetadataExtractionError("The selected file is not a valid EPUB."));
    }
  });
}

function listZipEntries(bytes, budget) {
  const entries = new Map();
  let entryCount = 0;
  let totalSize = 0;
  let invalidSize = false;
  let tooManyEntries = false;
  let duplicatePath = false;

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
            if (entry.name.endsWith("/")) {
              return false;
            }
            if (
              !Number.isSafeInteger(entry.originalSize) ||
              entry.originalSize < 0 ||
              totalSize + entry.originalSize > budget.remaining
            ) {
              invalidSize = true;
              return false;
            }
            const path = normalizeArchivePath(entry.name);
            if (!path || entries.has(path)) {
              duplicatePath = true;
              return false;
            }
            totalSize += entry.originalSize;
            entries.set(path, { name: entry.name, size: entry.originalSize });
            return false;
          },
        },
        (error) => {
          if (error) {
            reject(new MetadataExtractionError("The EPUB archive is damaged."));
          } else if (tooManyEntries) {
            reject(new MetadataExtractionError("The EPUB archive has too many entries."));
          } else if (invalidSize) {
            reject(
              new MetadataExtractionError(
                "The EPUB contents exceed the 100 MiB expanded-size limit.",
              ),
            );
          } else if (duplicatePath) {
            reject(
              new MetadataExtractionError(
                "The EPUB archive contains duplicate or invalid file paths.",
              ),
            );
          } else {
            budget.remaining -= totalSize;
            resolve(entries);
          }
        },
      );
    } catch {
      reject(new MetadataExtractionError("The selected file is not a valid EPUB."));
    }
  });
}

function isDirectoryHandle(source) {
  return (
    source?.kind === "directory" &&
    typeof source.getDirectoryHandle === "function" &&
    typeof source.getFileHandle === "function"
  );
}

async function indexDirectory(handle) {
  const entries = new Map();

  async function visit(directory, prefix = "") {
    let children;
    try {
      children = directory.values();
      for await (const child of children) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        if (child.kind === "directory") {
          await visit(child, path);
          continue;
        }
        if (child.kind !== "file") {
          continue;
        }
        const normalizedPath = normalizeArchivePath(path);
        if (entries.has(normalizedPath)) {
          throw new MetadataExtractionError(
            "The EPUB folder contains duplicate file paths.",
          );
        }
        entries.set(normalizedPath, child);
        if (entries.size > MAX_DIRECTORY_FILES) {
          throw new MetadataExtractionError(
            "The selected EPUB folder contains too many files.",
          );
        }
      }
    } catch (error) {
      if (error instanceof MetadataExtractionError) {
        throw error;
      }
      throw new MetadataExtractionError(
        "Could not access the selected folder. Select the unpacked EPUB folder and allow read access.",
      );
    }
  }

  await visit(handle);
  if (entries.size === 0) {
    throw new MetadataExtractionError("The selected EPUB folder is empty.");
  }
  return entries;
}

async function readDirectoryFile(fileHandle, path, maxSize, allowOversized = false) {
  let file;
  try {
    file = await fileHandle.getFile();
  } catch {
    throw new MetadataExtractionError(
      `Could not access "${path}". The file may have moved or is no longer available.`,
    );
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new MetadataExtractionError(`"${path}" has an invalid file size.`);
  }
  if (file.size > maxSize) {
    if (allowOversized) {
      return null;
    }
    throw new MetadataExtractionError(
      "The EPUB metadata file exceeds the allowed size.",
    );
  }
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new MetadataExtractionError(
      `Could not read "${path}". The file may be unavailable or still downloading.`,
    );
  }
}

async function createEpubSource(
  source,
  budget = { remaining: MAX_IMPORT_FILE_SIZE_BYTES },
  nestingDepth = 0,
) {
  if (isDirectoryHandle(source)) {
    const entries = await indexDirectory(source);
    return {
      name: source.name,
      entryPaths: [...entries.keys()],
      async read(path, maxSize, allowOversized = false) {
        const normalizedPath = normalizeArchivePath(path);
        const fileHandle = entries.get(normalizedPath);
        return fileHandle
          ? readDirectoryFile(fileHandle, path, maxSize, allowOversized)
          : null;
      },
      async readAllEntries() {
        const contentEntries = new Map();
        let totalSize = 0;
        for (const [path, fileHandle] of entries) {
          const file = await readDirectoryFile(
            fileHandle,
            path,
            MAX_IMPORT_FILE_SIZE_BYTES,
          );
          totalSize += file.length;
          if (totalSize > MAX_IMPORT_FILE_SIZE_BYTES) {
            throw new MetadataExtractionError(
              "The EPUB contents exceed the 100 MiB limit.",
            );
          }
          contentEntries.set(path, file);
        }
        return { entries: contentEntries, fileSize: totalSize };
      },
      async openNested(path) {
        if (nestingDepth >= MAX_NESTED_ARCHIVE_DEPTH) {
          throw new MetadataExtractionError(
            "The EPUB is nested too deeply to inspect safely.",
          );
        }
        const bytes = await this.read(
          path,
          Math.min(MAX_IMPORT_FILE_SIZE_BYTES, budget.remaining),
        );
        if (!bytes) {
          throw new MetadataExtractionError("The nested EPUB archive is missing.");
        }
        return createZipEpubSource(
          path,
          bytes,
          budget,
          nestingDepth + 1,
        );
      },
    };
  }

  validateFile(source);
  let archiveBytes;
  try {
    archiveBytes = new Uint8Array(await source.arrayBuffer());
  } catch {
    throw new MetadataExtractionError("Could not read the selected EPUB file.");
  }
  if (
    archiveBytes.length < 4 ||
    archiveBytes[0] !== 0x50 ||
    archiveBytes[1] !== 0x4b
  ) {
    throw new MetadataExtractionError("The selected file is not a valid EPUB archive.");
  }
  return createZipEpubSource(source.name, archiveBytes, budget, nestingDepth);
}

async function createZipEpubSource(name, archiveBytes, budget, nestingDepth) {
  if (
    archiveBytes.length < 4 ||
    archiveBytes[0] !== 0x50 ||
    archiveBytes[1] !== 0x4b
  ) {
    throw new MetadataExtractionError("The nested file is not a valid EPUB archive.");
  }
  const entries = await listZipEntries(archiveBytes, budget);
  const source = {
    name,
    entryPaths: [...entries.keys()],
    async read(path, maxSize, allowOversized = false) {
      const entry = entries.get(normalizeArchivePath(path));
      if (!entry) {
        return null;
      }
      if (entry.size > maxSize) {
        if (allowOversized) {
          return null;
        }
        throw new MetadataExtractionError(
          "The EPUB metadata file exceeds the allowed size.",
        );
      }
      const extracted = await readZipEntries(
        archiveBytes,
        new Set([entry.name]),
        maxSize,
        allowOversized,
      );
      return extracted[normalizeArchivePath(entry.name)] ?? null;
    },
    async readAllEntries() {
      return {
        entries: await readAllZipEntries(archiveBytes),
        fileSize: archiveBytes.length,
      };
    },
    async openNested(path) {
      if (nestingDepth >= MAX_NESTED_ARCHIVE_DEPTH) {
        throw new MetadataExtractionError(
          "The EPUB is nested too deeply to inspect safely.",
        );
      }
      const bytes = await this.read(
        path,
        Math.min(MAX_IMPORT_FILE_SIZE_BYTES, budget.remaining),
      );
      if (!bytes) {
        throw new MetadataExtractionError("The nested EPUB archive is missing.");
      }
      return createZipEpubSource(
        path,
        bytes,
        budget,
        nestingDepth + 1,
      );
    },
  };
  return source;
}

async function createEpubFingerprintSource(file) {
  if (isDirectoryHandle(file)) {
    return createEpubSource(file);
  }
  validateFile(file);
  let archiveBytes;
  try {
    archiveBytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new MetadataExtractionError("Could not read the selected EPUB file.");
  }
  if (
    archiveBytes.length < 4 ||
    archiveBytes[0] !== 0x50 ||
    archiveBytes[1] !== 0x4b
  ) {
    throw new MetadataExtractionError("The selected file is not a valid EPUB archive.");
  }
  return {
    async readAllEntries() {
      return {
        entries: await readAllZipEntries(archiveBytes),
        fileSize: file.size,
      };
    },
  };
}

function findContainerPath(source) {
  const rootContainer = source.entryPaths.find(
    (path) => path === "meta-inf/container.xml",
  );
  if (rootContainer) {
    return rootContainer;
  }
  return (
    source.entryPaths
      .filter((path) => path.endsWith("/meta-inf/container.xml"))
      .sort((left, right) => left.split("/").length - right.split("/").length)[0] ??
    null
  );
}

function packageRootFromContainerPath(containerPath) {
  return containerPath.slice(0, -"meta-inf/container.xml".length);
}

function commonEntryRoot(entryPaths) {
  const firstSegments = entryPaths.map((path) => path.split("/", 1)[0]);
  if (
    firstSegments.length === 0 ||
    !firstSegments[0] ||
    firstSegments.some((segment) => segment !== firstSegments[0])
  ) {
    return "";
  }
  return `${firstSegments[0]}/`;
}

function validatePackageDocument(packageDocument) {
  if (
    packageDocument.documentElement.localName !== "package" ||
    !descendantsByLocalName(packageDocument, "metadata").length
  ) {
    throw new MetadataExtractionError("The EPUB package document is incomplete.");
  }
}

async function loadPackageDocument(source, packagePath) {
  if (!packagePath || !packagePath.toLowerCase().endsWith(".opf")) {
    throw new MetadataExtractionError(
      "The EPUB container does not reference a valid OPF package document.",
    );
  }
  const packageBytes = await source.read(
    packagePath,
    MAX_METADATA_ENTRY_SIZE_BYTES,
  );
  if (!packageBytes) {
    throw new MetadataExtractionError("The EPUB package document is missing.");
  }
  const packageDocument = parseXml(decodeXml(packageBytes));
  validatePackageDocument(packageDocument);
  return packageDocument;
}

async function validateMimetype(source, packageRoot, warnings) {
  const expectedPath = normalizeArchivePath(`${packageRoot}mimetype`);
  const mimetypeBytes = await source.read(
    expectedPath,
    MAX_METADATA_ENTRY_SIZE_BYTES,
  );
  if (!mimetypeBytes) {
    const misplaced = source.entryPaths.some(
      (path) => path.endsWith("/mimetype") || path === "mimetype",
    );
    warnings.push(
      misplaced
        ? "The EPUB mimetype entry is outside the package root."
        : "The EPUB mimetype entry is missing.",
    );
    return;
  }
  if (new TextDecoder().decode(mimetypeBytes).trim() !== "application/epub+zip") {
    warnings.push("The EPUB mimetype entry has an unexpected value.");
  }
}

function packagePathFromRootfile(containerDocument) {
  const rootfiles = descendantsByLocalName(containerDocument, "rootfile");
  const rootfile =
    rootfiles.find(
      (element) =>
        findAttribute(element, "media-type") ===
        "application/oebps-package+xml",
    ) ?? rootfiles.find((element) => findAttribute(element, "full-path"));
  const fullPath = rootfile && findAttribute(rootfile, "full-path");
  return fullPath ? resolveArchivePath("", fullPath) : null;
}

async function locatePackage(source, warnings, budget, nestingDepth) {
  const containerPath = findContainerPath(source);
  if (containerPath) {
    const containerBytes = await source.read(
      containerPath,
      MAX_METADATA_ENTRY_SIZE_BYTES,
    );
    if (!containerBytes) {
      throw new MetadataExtractionError("The EPUB container document is missing.");
    }
    const containerDocument = parseXml(decodeXml(containerBytes));
    const packageRelativePath = packagePathFromRootfile(containerDocument);
    if (!packageRelativePath) {
      throw new MetadataExtractionError(
        "The EPUB package document could not be located.",
      );
    }
    const packageRoot = packageRootFromContainerPath(containerPath);
    const packagePath = normalizeArchivePath(
      `${packageRoot}${packageRelativePath}`,
    );
    const packageDocument = await loadPackageDocument(source, packagePath);
    await validateMimetype(source, packageRoot, warnings);
    return { packageDocument, packagePath };
  }

  const nestedArchives = source.entryPaths.filter((path) =>
    path.toLowerCase().endsWith(".epub"),
  );
  if (nestedArchives.length > 1) {
    throw new MetadataExtractionError(
      "The ZIP contains multiple EPUB files. Select the EPUB file directly.",
    );
  }
  if (nestedArchives.length === 1) {
    if (nestingDepth >= MAX_NESTED_ARCHIVE_DEPTH) {
      throw new MetadataExtractionError(
        "The EPUB is nested too deeply to inspect safely.",
      );
    }
    const nestedSource = await source.openNested(nestedArchives[0]);
    return locatePackage(nestedSource, warnings, budget, nestingDepth + 1);
  }

  const packageCandidates = source.entryPaths
    .filter((path) => path.endsWith(".opf"))
    .sort((left, right) => left.split("/").length - right.split("/").length);
  if (packageCandidates.length !== 1) {
    throw new MetadataExtractionError(
      "The EPUB is missing its container metadata and a unique OPF package document could not be identified.",
    );
  }
  const packagePath = packageCandidates[0];
  const packageDocument = await loadPackageDocument(source, packagePath);
  warnings.push(
    "The EPUB container document is missing; metadata was recovered from its OPF package.",
  );
  await validateMimetype(source, commonEntryRoot(source.entryPaths), warnings);
  return { packageDocument, packagePath };
}

async function fingerprintEntries(entries) {
  if (!globalThis.crypto?.subtle) {
    throw new MetadataExtractionError(
      "This browser cannot calculate a file fingerprint. Use a secure browser connection and try again.",
    );
  }
  const sortedEntries = [...entries.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const encoder = new TextEncoder();
  const chunks = [];
  let totalLength = 4;
  for (const [path, data] of sortedEntries) {
    const pathBytes = encoder.encode(path);
    if (pathBytes.length > 0xffffffff || data.length > 0xffffffff) {
      throw new MetadataExtractionError("The EPUB contains an oversized file path.");
    }
    const header = new Uint8Array(8);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, pathBytes.length);
    headerView.setUint32(4, data.length);
    chunks.push(header, pathBytes, data);
    totalLength += header.length + pathBytes.length + data.length;
  }

  const canonicalBytes = new Uint8Array(totalLength);
  new DataView(canonicalBytes.buffer).setUint32(0, sortedEntries.length);
  let offset = 4;
  for (const chunk of chunks) {
    canonicalBytes.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", canonicalBytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
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
  for (const rawSubject of subjects) {
    let subject = rawSubject;
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
    const prefixSeparator = subject.indexOf(":");
    const explicitType =
      prefixSeparator > 0
        ? tagTypePrefixes.get(subject.slice(0, prefixSeparator).trim().toLowerCase())
        : undefined;
    if (explicitType) {
      subject = normalizeText(subject.slice(prefixSeparator + 1));
      if (!subject) {
        continue;
      }
      type = explicitType;
    } else if (type === "fandom" && (subject.includes("/") || subject.includes(" & "))) {
      type = "relationship";
    }
    const tagKey = `${type}:${subject.toLowerCase()}`;
    if (!seenTags.has(tagKey)) {
      seenTags.add(tagKey);
      metadata.tags.push({ name: subject, type });
    }
  }
}

function findTitlePagePath(packageDocument, packagePath) {
  const references = descendantsByLocalName(packageDocument, "reference")
    .filter((element) =>
      ["titlepage", "frontmatter"].includes(
        findAttribute(element, "type")?.toLowerCase().replace(/[^a-z]/g, ""),
      ),
    )
    .map((element) => findAttribute(element, "href"));
  const titlePageItems = descendantsByLocalName(packageDocument, "item")
    .filter((element) => {
      const href = findAttribute(element, "href");
      const id = findAttribute(element, "id")?.toLowerCase() ?? "";
      const fileName = href?.split(/[?#]/, 1)[0].split("/").at(-1).toLowerCase();
      return (
        id.includes("titlepage") ||
        id === "title" ||
        /(?:^|_)split_000\.(?:xhtml|html)$/.test(fileName) ||
        fileName === "titlepage.xhtml" ||
        fileName === "titlepage.html" ||
        fileName === "title-page.xhtml" ||
        fileName === "title-page.html" ||
        fileName === "title.xhtml" ||
        fileName === "title.html"
      );
    })
    .map((element) => findAttribute(element, "href"));

  for (const reference of [...references, ...titlePageItems]) {
    if (reference) {
      const path = resolveArchivePath(packagePath, reference);
      if (path) {
        return path;
      }
    }
  }
  return null;
}

function findNavigationPath(packageDocument, packagePath) {
  const navItem = descendantsByLocalName(packageDocument, "item").find(
    (element) =>
      (findAttribute(element, "properties") || "")
        .split(/\s+/)
        .includes("nav"),
  );
  const href = navItem && findAttribute(navItem, "href");
  return href ? resolveArchivePath(packagePath, href) : null;
}

function titlePageLandmarkPath(document, navigationPath) {
  const anchors = descendantsByLocalName(document, "a");
  for (const anchor of anchors) {
    const epubType =
      anchor.getAttributeNS("http://www.idpf.org/2007/ops", "type") ??
      findAttribute(anchor, "epub:type") ??
      "";
    const typeTokens = epubType.toLowerCase().split(/\s+/);
    const label = normalizeText(anchor.textContent)?.toLowerCase();
    if (
      typeTokens.includes("title-page") ||
      typeTokens.includes("titlepage") ||
      label === "title page"
    ) {
      const href = findAttribute(anchor, "href");
      const path = href && resolveArchivePath(navigationPath, href);
      if (path) {
        return path;
      }
    }
  }
  return null;
}

function parseTitlePageTags(document) {
  const labels = new Map([
    ["fandom", "fandom"],
    ["fandoms", "fandom"],
    ["relationship", "relationship"],
    ["relationships", "relationship"],
    ["character", "character"],
    ["characters", "character"],
    ["additional tag", "additional"],
    ["additional tags", "additional"],
  ]);
  const tags = [];
  const sectionHeaders = new Set([
    ...labels.keys(),
    "rating",
    "archive warning",
    "archive warnings",
    "category",
    "language",
    "collections",
  ]);
  const tagLists = Array.from(document.getElementsByTagName("*")).filter(
    (element) =>
      element.localName.toLowerCase() === "dl" &&
      (element.getAttribute("class") || "").split(/\s+/).includes("tags"),
  );
  const roots = tagLists.length > 0 ? tagLists : [document];
  const labelElements = roots.flatMap((root) =>
    Array.from(root.getElementsByTagName("*")),
  );
  const seen = new Set();
  for (const element of labelElements) {
    const label = normalizeText(element.textContent)
      ?.replace(/:$/, "")
      .toLowerCase();
    const type = labels.get(label);
    if (!type) {
      continue;
    }

    const valueElements = [];
    if (element.localName.toLowerCase() === "dt") {
      const valueElement = element.nextElementSibling;
      if (valueElement?.localName.toLowerCase() === "dd") {
        valueElements.push(valueElement);
      }
    } else if (tagLists.length === 0) {
      const ownAnchors = descendantsByLocalName(element, "a");
      if (ownAnchors.length > 0) {
        valueElements.push(element);
      }
      let sibling = element.nextElementSibling;
      while (sibling) {
        const siblingText = normalizeText(sibling.textContent)
          ?.replace(/:$/, "")
          .toLowerCase();
        if (
          sectionHeaders.has(siblingText) ||
          ["h1", "h2", "h3", "h4", "h5", "h6", "dt"].includes(
            sibling.localName.toLowerCase(),
          )
        ) {
          break;
        }
        valueElements.push(sibling);
        sibling = sibling.nextElementSibling;
      }
    }

    for (const valueElement of valueElements) {
      for (const anchor of descendantsByLocalName(valueElement, "a")) {
        const name = normalizeText(anchor.textContent);
        const key = `${type}:${name?.toLowerCase()}`;
        if (name && !seen.has(key)) {
          seen.add(key);
          tags.push({ name, type });
        }
      }
    }
  }
  return tags;
}

async function readTitlePageTags(source, packageDocument, packagePath) {
  let titlePagePath = findTitlePagePath(packageDocument, packagePath);
  if (!titlePagePath) {
    const navigationPath = findNavigationPath(packageDocument, packagePath);
    if (navigationPath) {
      const navigationBytes = await source.read(
        navigationPath,
        MAX_METADATA_ENTRY_SIZE_BYTES,
      );
      if (navigationBytes) {
        titlePagePath = titlePageLandmarkPath(
          parseXml(decodeXml(navigationBytes)),
          navigationPath,
        );
      }
    }
  }
  if (!titlePagePath) {
    return [];
  }
  const bytes = await source.read(titlePagePath, MAX_METADATA_ENTRY_SIZE_BYTES);
  if (!bytes) {
    return [];
  }
  return parseTitlePageTags(parseXml(decodeXml(bytes)));
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
  const budget = { remaining: MAX_IMPORT_FILE_SIZE_BYTES };
  const source = await createEpubSource(file, budget);
  const fileName = source.name;
  const validationWarnings = [];
  const { packageDocument, packagePath } = await locatePackage(
    source,
    validationWarnings,
    budget,
    0,
  );
  const metadata = createMetadata("EPUB", fileName);
  metadata.validationWarnings = validationWarnings;
  metadata.title = firstText(packageDocument, "title");
  metadata.author = firstText(packageDocument, "creator");
  metadata.description = firstText(packageDocument, "description");
  metadata.language = firstText(packageDocument, "language");
  metadata.publisher = firstText(packageDocument, "publisher");
  metadata.publicationDate = firstText(packageDocument, "date");
  metadata.identifier = firstText(packageDocument, "identifier");
  parseSubjects(packageDocument, metadata);
  const titlePageTags = await readTitlePageTags(
    source,
    packageDocument,
    packagePath,
  );
  if (titlePageTags.length > 0) {
    metadata.tags = titlePageTags.filter(
      (tag, index, tags) =>
        tags.findIndex(
          (candidate) =>
            candidate.type === tag.type &&
            candidate.name.toLowerCase() === tag.name.toLowerCase(),
        ) === index,
    );
  }

  const cover = parseCoverReference(packageDocument);
  if (cover) {
    const coverPath = resolveArchivePath(packagePath, cover.href);
    if (coverPath) {
      const coverData = await source.read(
        coverPath,
        MAX_COVER_IMAGE_SIZE_BYTES,
        true,
      );
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

export async function fingerprintEpub(file) {
  const source = await createEpubFingerprintSource(file);
  const { entries, fileSize } = await source.readAllEntries();
  return {
    checksum: await fingerprintEntries(entries),
    fileSize,
    fingerprintVersion: 2,
  };
}
