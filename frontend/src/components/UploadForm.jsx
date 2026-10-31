import { useEffect, useRef, useState } from "react";

import { saveWork } from "../services/api.js";
import {
  calculateFingerprint,
  extractMetadata,
} from "../services/metadata/index.js";

function UploadForm({ onSaved }) {
  const [files, setFiles] = useState([]);
  const [fileIndex, setFileIndex] = useState(0);
  const [metadata, setMetadata] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const file = files[fileIndex] ?? null;
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const directorySelectionSupported =
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function";

  useEffect(() => {
    if (!metadata?.coverImage) {
      setCoverPreviewUrl("");
      return undefined;
    }

    const coverUrl = URL.createObjectURL(
      new Blob([metadata.coverImage.data], {
        type: metadata.coverImage.mediaType,
      }),
    );
    setCoverPreviewUrl(coverUrl);
    return () => URL.revokeObjectURL(coverUrl);
  }, [metadata]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || extracting) {
      return;
    }

    setExtracting(true);
    setError("");
    setMetadata(null);
    try {
      setMetadata(await extractMetadata(file));
    } catch (extractionError) {
      setError(extractionError.message || "The file metadata could not be extracted.");
    } finally {
      setExtracting(false);
    }
  }

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setFiles(selectedFiles);
    setFileIndex(0);
    setMetadata(null);
    setSaved(false);
    setCompletedCount(0);
    setBatchTotal(selectedFiles.length);
    setError("");
  }

  async function handleDirectorySelection() {
    try {
      const directory = await window.showDirectoryPicker({ mode: "read" });
      setFiles([directory]);
      setFileIndex(0);
      setMetadata(null);
      setSaved(false);
      setCompletedCount(0);
      setBatchTotal(1);
      setError("");
    } catch (selectionError) {
      if (selectionError.name !== "AbortError") {
        setError(
          "The folder could not be selected. Try Chrome, or choose a standard EPUB file.",
        );
      }
    }
  }

  const metadataFields = metadata
    ? [
        ["Author", metadata.author],
        ["Description", metadata.description],
        ["Language", metadata.language],
        ["Publisher", metadata.publisher],
        ["Publication date", metadata.publicationDate],
        ["Identifier", metadata.identifier],
        ["Subject", metadata.subject],
        ["Creator", metadata.creator],
        ["Producer", metadata.producer],
        ["Creation date", metadata.creationDate],
        ["Modification date", metadata.modificationDate],
        ["Rating", metadata.rating],
        ["Category", metadata.category],
        ["Archive warnings", metadata.archiveWarnings.join(", ") || null],
        [
          "EPUB structure",
          metadata.validationWarnings?.join(" ") || null,
        ],
      ].filter(([, value]) => value)
    : [];

  return (
    <section className="upload-section" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Import books</h2>
      <p>
        Choose one or more EPUB or PDF files, or select an EPUB folder.
        Selected files are processed one at a time for review in your browser.
      </p>
      <p className="prototype-notice">
        The file is read locally. Only its extracted metadata and fingerprint
        are saved; the original is not sent to AYO.
      </p>
      <form className="upload-form" onSubmit={handleSubmit}>
        <label htmlFor="work-upload">Choose one or more EPUB or PDF files</label>
        <input
          ref={inputRef}
          id="work-upload"
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          multiple
          onChange={handleFileChange}
          disabled={extracting || saving}
        />
        {directorySelectionSupported ? (
          <button
            type="button"
            onClick={handleDirectorySelection}
            disabled={extracting || saving}
          >
            Choose an EPUB folder
          </button>
        ) : (
          <p>
            Unpacked EPUB folders can be selected in Chrome. Safari supports
            standard EPUB files.
          </p>
        )}
        {file && (
          <p className="selected-file">
            {file.kind === "directory"
              ? `Selected folder: ${file.name}`
              : files.length > 1
                ? `File ${fileIndex + 1} of ${files.length}: ${file.name}`
                : `Selected file: ${file.name}`}
          </p>
        )}
        {batchTotal > 1 && completedCount > 0 && (
          <p className="upload-success" role="status">
            {completedCount === batchTotal
              ? `Imported all ${batchTotal} selected files.`
              : `Imported ${completedCount} of ${batchTotal} selected files.`}
          </p>
        )}
        <button type="submit" disabled={!file || extracting || saving}>
          {extracting ? "Reading metadata..." : "Extract metadata"}
        </button>
      </form>
      {error && <p className="upload-error" role="alert">{error}</p>}
      {metadata && (
        <section className="metadata-preview" aria-live="polite">
          <p className="upload-success" role="status">
            {saved
              ? `${metadata.fileName} was added to your library. The file remains on your computer.`
              : `Metadata extracted from ${metadata.fileName}. The file remains on your computer.`}
          </p>
          <h3>{metadata.title || "Untitled work"}</h3>
          {coverPreviewUrl && (
            <img className="metadata-cover" src={coverPreviewUrl} alt="EPUB cover" />
          )}
          {metadataFields.length > 0 && (
            <dl>
              {metadataFields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {metadata.tags.length > 0 && (
            <div className="metadata-tags">
              <strong>Tags</strong>
              <ul>
                {metadata.tags.map((tag) => (
                  <li key={`${tag.type}:${tag.name}`}>
                    <span>{tag.type}</span> {tag.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!saved && (
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (!file || saving) {
                  return;
                }
                setSaving(true);
                setError("");
                try {
                  const fingerprint = await calculateFingerprint(
                    file,
                    metadata.format,
                  );
                  await saveWork({
                    title: metadata.title || metadata.fileName.replace(/\.(epub|pdf)$/i, ""),
                    original_author: metadata.author,
                    description: metadata.description,
                    language: metadata.language,
                    publisher: metadata.publisher,
                    identifier: metadata.identifier,
                    subject: metadata.subject,
                    creator: metadata.creator,
                    producer: metadata.producer,
                    publication_date: metadata.publicationDate,
                    creation_date: metadata.creationDate,
                    modification_date: metadata.modificationDate,
                    rating: metadata.rating,
                    category: metadata.category,
                    tags: metadata.tags.map((tag) => ({
                      name: tag.name,
                      tag_type: tag.type,
                    })),
                    warnings: metadata.archiveWarnings,
                    file: {
                      original_filename: metadata.fileName,
                      file_format: metadata.format,
                      file_size: fingerprint.fileSize,
                      checksum: fingerprint.checksum,
                      fingerprint_version: fingerprint.fingerprintVersion,
                      storage_provider: "local",
                    },
                  });
                  const nextCompletedCount = completedCount + 1;
                  const hasNextFile = fileIndex + 1 < files.length;
                  setCompletedCount(nextCompletedCount);
                  setSaved(!hasNextFile);
                  if (hasNextFile) {
                    setFileIndex((currentIndex) => currentIndex + 1);
                    setMetadata(null);
                  } else {
                    setFiles([]);
                    setFileIndex(0);
                    if (inputRef.current) {
                      inputRef.current.value = "";
                    }
                  }
                  onSaved?.();
                } catch (saveError) {
                  setError(saveError.message || "The work could not be saved.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving to library..." : "Add to my library"}
            </button>
          )}
        </section>
      )}
    </section>
  );
}

export default UploadForm;
