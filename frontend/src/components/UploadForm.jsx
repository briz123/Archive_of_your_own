import { useRef, useState } from "react";

import { uploadWork } from "../services/api.js";

function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef(null);
  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || uploading) {
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const work = await uploadWork(file);
      const conversionMessage = isPdf
        ? " and converted to EPUB"
        : "";
      setSuccess(`“${work.title}” was uploaded${conversionMessage} successfully.`);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onUploaded();
    } catch (uploadError) {
      setError(uploadError.message || "The file could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="upload-section" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Import a fic</h2>
      <p>
        Choose an EPUB or PDF from your computer. PDFs are converted to EPUB in
        this prototype.
      </p>
      <p className="prototype-notice">
        Prototype limitation: importing currently sends the selected file to
        the backend, where it is stored. Local-only, metadata-only import is
        planned; do not continue unless you are comfortable with server storage.
      </p>
      <form className="upload-form" onSubmit={handleSubmit}>
        <label htmlFor="work-upload">Choose an EPUB or PDF file</label>
        <input
          ref={inputRef}
          id="work-upload"
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError("");
            setSuccess("");
          }}
          disabled={uploading}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading
            ? isPdf
              ? "Uploading and converting..."
              : "Uploading..."
            : "Import (prototype upload)"}
        </button>
      </form>
      {error && <p className="upload-error" role="alert">{error}</p>}
      {success && <p className="upload-success" role="status">{success}</p>}
    </section>
  );
}

export default UploadForm;
