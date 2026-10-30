import { extractEpubMetadata } from "./epub.js";
import { extractPdfMetadata } from "./pdf.js";
import { MetadataExtractionError } from "./types.js";

export { MetadataExtractionError } from "./types.js";
export { extractEpubMetadata } from "./epub.js";
export { extractPdfMetadata } from "./pdf.js";

export async function extractMetadata(file) {
  if (!file || typeof file.name !== "string") {
    throw new MetadataExtractionError("Choose an EPUB or PDF file.");
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "epub") {
    return extractEpubMetadata(file);
  }
  if (extension === "pdf") {
    return extractPdfMetadata(file);
  }
  throw new MetadataExtractionError("Only EPUB and PDF files are supported.");
}
