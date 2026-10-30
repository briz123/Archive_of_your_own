async function fetchJson(url, label) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Could not load ${label} (HTTP ${response.status}).`);
  }

  return response.json();
}

function getCsrfToken() {
  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith("ayo_csrf="));
  return cookie ? decodeURIComponent(cookie.slice("ayo_csrf=".length)) : "";
}

async function postJson(url, body, label) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCsrfToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const detail = Array.isArray(result?.detail)
      ? result.detail
          .map((item) => item?.msg)
          .filter(Boolean)
          .join(" ")
          .replace(/^Value error, /, "")
      : result?.detail;
    throw new Error(
      typeof detail === "string" && detail
        ? detail
        : `${label} failed (HTTP ${response.status}).`,
    );
  }
  return response.status === 204 ? null : response.json();
}

export async function fetchCurrentUser() {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Could not check your sign-in status (HTTP ${response.status}).`);
  }
  return response.json();
}

export async function registerUser(credentials) {
  const result = await postJson("/api/auth/register", credentials, "Registration");
  if (!result?.user) {
    throw new Error("The registration response was not in the expected format.");
  }
  return result.user;
}

export async function loginUser(credentials) {
  const result = await postJson("/api/auth/login", credentials, "Sign in");
  if (!result?.user) {
    throw new Error("The sign-in response was not in the expected format.");
  }
  return result.user;
}

export async function logoutUser() {
  await postJson("/api/auth/logout", undefined, "Sign out");
}

export async function saveWork(work) {
  return postJson("/api/works", work, "Saving the work");
}

export async function fetchWorks(search = "", filters = {}) {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("search", search.trim());
  }

  const filterParameters = {
    fandom_id: "fandom_id",
    rating: "rating",
    relationship_id: "relationship_id",
    character_id: "character_id",
    additional_tag_id: "additional_tag_id",
    include_warning_id: "warning",
    exclude_warning_id: "exclude_warning",
    include_tag_id: "include_tag_id",
    exclude_tag_id: "exclude_tag_id",
    completion_status: "completion_status",
    language: "language",
    sort: "sort",
  };
  for (const [name, value] of Object.entries(filters)) {
    const parameter = filterParameters[name] || name;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(parameter, String(item)));
    } else if (value) {
      params.set(parameter, String(value));
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
