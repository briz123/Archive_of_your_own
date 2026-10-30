export const MAX_IMPORT_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_METADATA_ENTRY_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_COVER_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 10_000;

export class MetadataExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetadataExtractionError";
  }
}

export function createMetadata(format, fileName) {
  return {
    format,
    fileName,
    title: null,
    author: null,
    description: null,
    language: null,
    publisher: null,
    publicationDate: null,
    identifier: null,
    subject: null,
    creator: null,
    producer: null,
    creationDate: null,
    modificationDate: null,
    rating: null,
    category: null,
    archiveWarnings: [],
    tags: [],
    coverImage: null,
  };
}

export function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function validateFile(file) {
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string") {
    throw new MetadataExtractionError("Choose an EPUB or PDF file.");
  }
  if (!file.name.toLowerCase().endsWith(".epub") && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new MetadataExtractionError("Only EPUB and PDF files are supported.");
  }
  if (file.size === 0) {
    throw new MetadataExtractionError("The selected file is empty.");
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new MetadataExtractionError("The selected file exceeds the 100 MiB limit.");
  }
}
