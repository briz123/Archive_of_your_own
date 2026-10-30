function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedDate(value) {
  const uploadedAt = new Date(value);
  const daysSinceUpload = Math.floor(
    (Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSinceUpload < 1) {
    return "Uploaded today";
  }
  if (daysSinceUpload === 1) {
    return "Uploaded yesterday";
  }
  if (daysSinceUpload < 7) {
    return `Uploaded ${daysSinceUpload} days ago`;
  }
  return `Uploaded ${uploadedAt.toLocaleDateString()}`;
}

function formatDescription(description) {
  const withParagraphSpacing = description
    .replace(/<\/(?:address|article|blockquote|div|li|p)>/gi, " ")
    .replace(/<br\b[^>]*\/?>/gi, " ");
  const parsed = new DOMParser().parseFromString(withParagraphSpacing, "text/html");
  return parsed.body.textContent.replace(/\s+/g, " ").trim();
}

function WorkCard({ work }) {
  return (
    <article className="work-card">
      <div className="work-card-heading">
        <div>
          <h3>{work.title}</h3>
          {work.original_author && (
            <p className="work-author">by {work.original_author}</p>
          )}
        </div>
        <span className="work-format-mark" aria-hidden="true">
          {work.files[0]?.file_format || "BOOK"}
        </span>
      </div>
      {work.description && (
        <p className="work-description">{formatDescription(work.description)}</p>
      )}
      {work.tags?.length > 0 && (
        <div className="work-tags" aria-label="Work tags">
          {["fandom", "relationship", "character", "additional"].map(
            (tagType) => {
              const tags = work.tags.filter((tag) => tag.tag_type === tagType);
              if (tags.length === 0) {
                return null;
              }

              const label = {
                fandom: "Fandoms",
                relationship: "Relationships",
                character: "Characters",
                additional: "Additional tags",
              }[tagType];
              return (
                <div className="work-tag-row" key={tagType}>
                  <strong>{label}</strong>
                  <div className="tag-list">
                    {tags.map((tag) => (
                      <span className="tag-chip" key={tag.id}>{tag.name}</span>
                    ))}
                  </div>
                </div>
              );
            },
          )}
        </div>
      )}
      {work.language && <p className="work-language">{work.language}</p>}

      {work.files.length > 0 && (
        <ul className="work-files" aria-label="Available files">
          {work.files.map((file) => (
            <li key={file.id}>
              <span>
                <strong>{file.file_format}</strong>
                <span className="file-size">{formatFileSize(file.file_size)}</span>
              </span>
              {file.storage_provider === "legacy_server" ? (
                <a
                  className="download-link"
                  href={`/api/works/${work.id}/download`}
                  aria-label={`Download ${file.original_filename}`}
                >
                  Download {file.file_format}
                </a>
              ) : (
                <span className="file-size">
                  On your computer: {file.original_filename}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="work-uploaded">{formatUploadedDate(work.created_at)}</p>
    </article>
  );
}

export default WorkCard;
