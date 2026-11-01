import { extractEpubMetadata, fingerprintEpub } from "./epub.js";
import { extractPdfMetadata } from "./pdf.js";
import { MetadataExtractionError, validateFile } from "./types.js";

export { MetadataExtractionError } from "./types.js";
export { extractEpubMetadata } from "./epub.js";
export { extractPdfMetadata } from "./pdf.js";
export { fingerprintEpub } from "./epub.js";

function isDirectoryHandle(source) {
  return (
    source?.kind === "directory" &&
    typeof source.getDirectoryHandle === "function" &&
    typeof source.getFileHandle === "function"
  );
}

export async function extractMetadata(source) {
  // Detect format from file contents so renamed files and incorrect MIME types do not mislead parsing.
  if (isDirectoryHandle(source)) {
    return extractEpubMetadata(source);
  }
  validateFile(source);
  let header;
  try {
    header = new Uint8Array(await source.slice(0, 1024).arrayBuffer());
  } catch {
    throw new MetadataExtractionError("Could not read the selected file.");
  }
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return extractEpubMetadata(source);
  }
  if (new TextDecoder().decode(header).includes("%PDF-")) {
    return extractPdfMetadata(source);
  }

  throw new MetadataExtractionError(
    `Only EPUB and PDF files are supported. Could not identify "${source.name}" from its contents.`,
  );
}

export async function calculateFingerprint(source, format) {
  // Calculate the duplicate-detection fingerprint locally; file contents stay in the browser.
  if (format === "EPUB") {
    return fingerprintEpub(source);
  }
  if (format !== "PDF") {
    throw new MetadataExtractionError("Cannot fingerprint an unsupported file format.");
  }

  validateFile(source);
  if (!globalThis.crypto?.subtle) {
    throw new MetadataExtractionError(
      "This browser cannot calculate a file fingerprint. Use a secure browser connection and try again.",
    );
  }
  let bytes;
  try {
    bytes = await source.arrayBuffer();
  } catch {
    throw new MetadataExtractionError("Could not read the selected PDF file.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return {
    checksum: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    fileSize: source.size,
    fingerprintVersion: 1,
  };
}
