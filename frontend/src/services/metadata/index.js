import { extractEpubMetadata } from "./epub.js";
import { extractPdfMetadata } from "./pdf.js";
import { MetadataExtractionError, validateFile } from "./types.js";

export { MetadataExtractionError } from "./types.js";
export { extractEpubMetadata } from "./epub.js";
export { extractPdfMetadata } from "./pdf.js";

export async function extractMetadata(file) {
  validateFile(file);
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".epub")) {
    return extractEpubMetadata(file);
  }
  if (filename.endsWith(".pdf")) {
    return extractPdfMetadata(file);
  }

  let header;
  try {
    header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  } catch {
    throw new MetadataExtractionError("Could not read the selected file.");
  }
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return extractEpubMetadata(file);
  }
  const headerText = new TextDecoder().decode(header);
  if (headerText.includes("%PDF-")) {
    return extractPdfMetadata(file);
  }

  throw new MetadataExtractionError("Only EPUB and PDF files are supported.");
}
