async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${label} (HTTP ${response.status}).`);
  }

  return response.json();
}

export async function fetchWorks(search = "", filters = {}) {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("search", search.trim());
  }

  for (const [name, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(name, String(item)));
    } else if (value) {
      params.set(name, String(value));
    }
  }

  const query = params.toString();
  const works = await fetchJson(`/api/works${query ? `?${query}` : ""}`, "works");
  if (!Array.isArray(works)) {
    throw new Error("The works response was not in the expected format.");
  }
  return works;
}

export async function fetchFilterOptions() {
  const options = await fetchJson("/api/works/filters", "filter options");
  const expectedLists = [
    "fandoms",
    "tags",
    "ratings",
    "completion_statuses",
    "languages",
  ];
  if (
    !options ||
    expectedLists.some((key) => !Array.isArray(options[key]))
  ) {
    throw new Error("The filter options response was not in the expected format.");
  }
  return options;
}

export async function uploadWork(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/works/upload", {
    method: "POST",
    body: formData,
  });
  const result = await response.json();

  if (!response.ok) {
    const detail =
      typeof result?.detail === "string"
        ? result.detail
        : `Could not upload the file (HTTP ${response.status}).`;
    throw new Error(detail);
  }
  if (!result || typeof result.title !== "string") {
    throw new Error("The upload response was not in the expected format.");
  }

  return result;
}

export async function downloadWorkBundle(workIds) {
  const response = await fetch("/api/works/download-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ work_ids: workIds }),
  });

  if (!response.ok) {
    const result = await response.json();
    const detail =
      typeof result?.detail === "string"
        ? result.detail
        : `Could not download the selected works (HTTP ${response.status}).`;
    throw new Error(detail);
  }

  return response.blob();
}
