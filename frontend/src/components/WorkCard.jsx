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
      <h2>{work.title}</h2>
      {work.original_author && (
        <p className="work-author">By {work.original_author}</p>
      )}
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
                <p key={tagType}>
                  <strong>{label}:</strong>{" "}
                  {tags.map((tag) => tag.name).join(", ")}
                </p>
              );
            },
          )}
        </div>
      )}
      {work.language && <p className="work-language">Language: {work.language}</p>}

      {work.files.length > 0 && (
        <ul className="work-files" aria-label="Available files">
          {work.files.map((file) => (
            <li key={file.id}>
              <span>
                {file.file_format} · {formatFileSize(file.file_size)}
              </span>
              <a
                className="download-link"
                href={`/api/works/${work.id}/download`}
                aria-label={`Download ${file.original_filename}`}
              >
                Download {file.file_format}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="work-uploaded">{formatUploadedDate(work.created_at)}</p>
    </article>
  );
}

export default WorkCard;
