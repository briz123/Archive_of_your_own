import { useRef, useState } from "react";

import { uploadWork } from "../services/api.js";

function UploadForm({ onUploaded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef(null);

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
      setSuccess(`“${work.title}” was uploaded successfully.`);
      setFile(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      onUploaded();
    } catch (uploadError) {
      setError(uploadError.message || "The EPUB could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="upload-section" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload a fic</h2>
      <p>Choose an EPUB file to add a work to the archive.</p>
      <form className="upload-form" onSubmit={handleSubmit}>
        <label htmlFor="epub-upload">EPUB file</label>
        <input
          ref={inputRef}
          id="epub-upload"
          type="file"
          accept=".epub,application/epub+zip"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null);
            setError("");
            setSuccess("");
          }}
          disabled={uploading}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Uploading..." : "Upload EPUB"}
        </button>
      </form>
      {error && <p className="upload-error" role="alert">{error}</p>}
      {success && <p className="upload-success" role="status">{success}</p>}
    </section>
  );
}

export default UploadForm;
