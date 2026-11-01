import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  MetadataExtractionError,
  createMetadata,
  normalizeText,
  validateFile,
} from "./types.js";

function pdfDate(value) {
  return normalizeText(value);
}

export async function extractPdfMetadata(file) {
  validateFile(file);

  let fileBytes;
  try {
    fileBytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    throw new MetadataExtractionError("Could not read the selected PDF file.");
  }
  const header = new TextDecoder().decode(fileBytes.subarray(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new MetadataExtractionError("The selected file is not a valid PDF.");
  }

  let loadingTask;
  try {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    loadingTask = getDocument({
      data: fileBytes,
      isEvalSupported: false,
      verbosity: 0,
    });
    const document = await loadingTask.promise;
    const { info } = await document.getMetadata();
    const metadata = createMetadata("PDF", file.name);
    metadata.title = normalizeText(info?.Title);
    metadata.author = normalizeText(info?.Author);
    metadata.subject = normalizeText(info?.Subject);
    metadata.creator = normalizeText(info?.Creator);
    metadata.producer = normalizeText(info?.Producer);
    metadata.creationDate = pdfDate(info?.CreationDate);
    metadata.modificationDate = pdfDate(info?.ModDate);
    return metadata;
  } catch (error) {
    if (error instanceof MetadataExtractionError) {
      throw error;
    }
    throw new MetadataExtractionError(
      "The PDF is malformed, encrypted, or could not be read.",
    );
  } finally {
    if (loadingTask) {
      await loadingTask.destroy();
    }
  }
}
