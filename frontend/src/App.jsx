import { useEffect, useState } from "react";

import {
  fetchCurrentUser,
  fetchFilterOptions,
  fetchLibraryExport,
  fetchWorks,
  logoutUser,
} from "./services/api.js";
import AuthForm from "./components/AuthForm.jsx";
import AdvancedFilters, { EMPTY_FILTERS } from "./components/AdvancedFilters.jsx";
import SearchBar from "./components/SearchBar.jsx";
import UploadForm from "./components/UploadForm.jsx";
import WorkCard from "./components/WorkCard.jsx";

function App() {
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(
    () => sessionStorage.getItem("ayo-disclaimer-accepted") === "true",
  );
  const [authUser, setAuthUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("checking");
  const [authCheckRetry, setAuthCheckRetry] = useState(0);
  const [authError, setAuthError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState("");
  const [works, setWorks] = useState([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [fandomQuery, setFandomQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState(null);
  const [filterOptionsError, setFilterOptionsError] = useState("");
  const [filterOptionsRetry, setFilterOptionsRetry] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [exportingLibrary, setExportingLibrary] = useState(false);
  const [libraryExportError, setLibraryExportError] = useState("");
  const advancedSearchEnabled = filterOptions?.advanced_search_enabled === true;

  // Resolve the session cookie before requesting any user-scoped library data.
  useEffect(() => {
    let active = true;
    if (!acceptedDisclaimer) {
      return () => {
        active = false;
      };
    }

    const controller = new AbortController();
    setAuthStatus("checking");
    fetchCurrentUser(controller.signal)
      .then((user) => {
        if (active) {
          setAuthUser(user);
          setAuthStatus(user ? "authenticated" : "unauthenticated");
          setAuthError("");
        }
      })
      .catch((loadError) => {
        if (active) {
          setAuthUser(null);
          setAuthStatus("unauthenticated");
          setAuthError(loadError.message || "Could not check your sign-in status.");
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [acceptedDisclaimer, authCheckRetry]);

  useEffect(() => {
    let active = true;

    async function loadFilterOptions() {
      if (!acceptedDisclaimer || !authUser) {
        return;
      }

      setFilterOptionsError("");
      try {
        const result = await fetchFilterOptions();
        if (active) {
          setFilterOptions(result);
        }
      } catch (loadError) {
        if (active) {
          setFilterOptionsError(
            loadError.message || "An unexpected error occurred.",
          );
        }
      }
    }

    loadFilterOptions();
    return () => {
      active = false;
    };
  }, [filterOptionsRetry, acceptedDisclaimer, authUser]);

  useEffect(() => {
    let active = true;

    async function loadWorks() {
      if (!acceptedDisclaimer || !authUser) {
        return;
      }

      setStatus("loading");
      setError("");
      try {
        const activeFilters = advancedSearchEnabled
          ? filters
          : { fandom_id: filters.fandom_id };
        const result = await fetchWorks(search, activeFilters);
        if (active) {
          setWorks(result);
          setStatus("success");
        }
      } catch (error) {
        if (active) {
          setError(error.message || "An unexpected error occurred.");
          setStatus("error");
        }
      }
    }

    loadWorks();
    return () => {
      active = false;
    };
  }, [search, filters, retryCount, advancedSearchEnabled, acceptedDisclaimer, authUser]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function clearFilters() {
    setFilters({
      fandom_id: [],
      rating: [],
      relationship_id: [],
      character_id: [],
      additional_tag_id: [],
      include_warning_id: [],
      exclude_warning_id: [],
      include_tag_id: [],
      exclude_tag_id: [],
      completion_status: [],
      language: [],
      sort: "recently_added",
    });
    setFandomQuery("");
  }

  async function handleExportLibrary() {
    if (exportingLibrary) {
      return;
    }
    // The exported workbook contains metadata only; the user's book files stay local.
    setExportingLibrary(true);
    setLibraryExportError("");
    try {
      const blob = await fetchLibraryExport();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      const now = new Date();
      const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
      link.download = `AYO_Library_${date}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    } catch (exportError) {
      setLibraryExportError(
        exportError.message || "The library export could not be generated.",
      );
    } finally {
      setExportingLibrary(false);
    }
  }

  function acceptDisclaimer() {
    try {
      sessionStorage.setItem("ayo-disclaimer-accepted", "true");
      setAcceptanceError("");
      setAcceptedDisclaimer(true);
    } catch (storageError) {
      setAcceptanceError(
        `Your browser could not save this session's acceptance: ${storageError.message}`,
      );
    }
  }

  function handleAuthenticated(user) {
    setAuthError("");
    setAuthUser(user);
    setAuthStatus("authenticated");
  }

  async function handleLogout() {
    if (loggingOut) {
      return;
    }
    setLoggingOut(true);
    setAuthError("");
    try {
      await logoutUser();
      setAuthUser(null);
      setAuthStatus("unauthenticated");
      setWorks([]);
      setFilterOptions(null);
      setStatus("loading");
    } catch (logoutError) {
      setAuthError(logoutError.message || "Could not sign out.");
    } finally {
      setLoggingOut(false);
    }
  }

  const hasActiveFilters = Object.entries(filters).some(
    ([name, value]) =>
      (Array.isArray(value) && value.length > 0) ||
      (name === "sort" && value !== "recently_added"),
  );

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="site-brand" href={import.meta.env.BASE_URL} aria-label="Archive of Your Own home">
          <span className="brand-mark" aria-hidden="true">AOY</span>
          <span className="brand-name">Archive <span>of Your Own</span></span>
        </a>
        {acceptedDisclaimer && authUser && (
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#library">My library</a>
            <a href="#upload">Catalog a book</a>
            <button type="button" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Signing out..." : "Sign out"}
            </button>
          </nav>
        )}
      </header>

      <main className="page-content">
        {!acceptedDisclaimer ? (
          <>
            <section className="welcome-hero" aria-labelledby="welcome-heading">
              <p className="eyebrow">A personal library for stories you love</p>
              <h1 id="welcome-heading">Keep your favorite stories close.</h1>
              <p>
                A personal library for organizing your fanfiction collection.
                Keep your books on your computer and your catalog in AYO.
              </p>
            </section>
            <section className="disclaimer-gate" aria-labelledby="disclaimer-heading">
              <p className="eyebrow">A note before you begin</p>
              <h2 id="disclaimer-heading">Before you enter</h2>
              <p>
                AYO is being built as a private library for cataloging EPUB and
                PDF files you already have. Your original books should stay on
                your computer; AYO should save only their metadata.
              </p>
              <ul>
                <li>
                  This is not AO3 and is not affiliated with or a replacement for
                  AO3 or the Organization for Transformative Works.
                </li>
                <li>
                  AYO is not a public archive or a replacement for the communities
                  where stories are published. It will not host or share your books.
                </li>
                <li>
                  Copyright remains with the authors and other rights holders.
                  Respect authors' rights and applicable law. Importing metadata
                  does not grant permission to redistribute a work.
                </li>
                <li>
                  Keep your original files and backups safe. This project is
                  experimental and does not guarantee recovery of your files.
                </li>
              </ul>
              <p className="prototype-notice">
                AYO supports private accounts and reads selected files in your
                browser. Only extracted metadata is saved to your library; the
                original files stay on your computer.
              </p>
              {acceptanceError && (
                <p className="disclaimer-error" role="alert">
                  {acceptanceError}
                </p>
              )}
              <button type="button" onClick={acceptDisclaimer}>
                I understand and accept <span aria-hidden="true">→</span>
              </button>
            </section>
          </>
        ) : authStatus === "checking" ? (
          <section className="auth-panel" aria-live="polite">
            <p role="status">Checking your sign-in status...</p>
          </section>
        ) : !authUser ? (
          <>
            <section className="welcome-hero" aria-labelledby="welcome-heading">
              <p className="eyebrow">A personal library for stories you love</p>
              <h1 id="welcome-heading">Your collection, all in one place.</h1>
              <p>
                Sign in to manage your private catalog of fanfiction works.
              </p>
            </section>
            {authError && (
              <>
                <p className="auth-error" role="alert">{authError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setAuthCheckRetry((count) => count + 1);
                  }}
                >
                  Retry sign-in check
                </button>
              </>
            )}
            <AuthForm onAuthenticated={handleAuthenticated} />
          </>
        ) : (
          <>
            <section className="welcome-hero" aria-labelledby="welcome-heading">
              <p className="eyebrow">A personal library for stories you love</p>
              <h1 id="welcome-heading">Your collection, all in one place.</h1>
              <p>
                Catalog your EPUBs and PDFs, organize them by fandom and tags,
                and keep the original files on your own device.
              </p>
              <a className="hero-link" href="#library">Browse the collection <span aria-hidden="true">↓</span></a>
            </section>

            <div className="content-grid">
              <div className="primary-content">
                <section id="library" className="works-section" aria-live="polite" aria-busy={status === "loading"}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">The collection</p>
                      <h2>My library</h2>
                    </div>
                    <div className="library-actions">
                      {status === "success" && works.length > 0 && (
                        <span className="work-count">
                          {works.length} {works.length === 1 ? "work" : "works"}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleExportLibrary}
                        disabled={status !== "success" || exportingLibrary}
                      >
                        {exportingLibrary
                          ? "Preparing download..."
                          : "Download for Google Sheets"}
                      </button>
                    </div>
                  </div>
                  <p className="export-note">
                    Downloads an .xlsx workbook you can open in Google Sheets.
                  </p>
                  {libraryExportError && (
                    <div className="works-error" role="alert">
                      <p>Library export failed: {libraryExportError}</p>
                    </div>
                  )}
                  <SearchBar
                    initialSearch={search}
                    onSearch={setSearch}
                    disabled={status === "loading"}
                  />
                  {filterOptionsError ? (
                    <div className="works-error" role="alert">
                      <p>Filter options could not be loaded: {filterOptionsError}</p>
                      <button
                        type="button"
                        onClick={() => setFilterOptionsRetry((count) => count + 1)}
                      >
                        Retry filter options
                      </button>
                    </div>
                  ) : (
                    filterOptions?.advanced_search_enabled ? (
                      <AdvancedFilters
                        filters={filters}
                        options={filterOptions}
                        onChange={updateFilter}
                        onClear={clearFilters}
                        loading={!filterOptions}
                      />
                    ) : (
                      <section className="basic-filters" aria-label="Basic filters">
                        <label htmlFor="fandom-search">Browse by fandom</label>
                        <input
                          id="fandom-search"
                          type="search"
                          value={fandomQuery}
                          onChange={(event) => setFandomQuery(event.target.value)}
                          placeholder="Find a fandom"
                          disabled={!filterOptions}
                        />
                        {filters.fandom_id.length > 0 && (
                          <button
                            type="button"
                            className="clear-search"
                            onClick={() => updateFilter("fandom_id", [])}
                          >
                            Clear
                          </button>
                        )}
                        <div className="basic-fandom-options">
                          {(filterOptions?.fandoms || [])
                            .filter((fandom) =>
                              fandom.name
                                .toLocaleLowerCase()
                                .includes(fandomQuery.trim().toLocaleLowerCase()),
                            )
                            .map((fandom) => {
                              const value = String(fandom.id);
                              const checked = filters.fandom_id.includes(value);
                              return (
                                <label key={fandom.id}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      updateFilter(
                                        "fandom_id",
                                        checked
                                          ? filters.fandom_id.filter((id) => id !== value)
                                          : [...filters.fandom_id, value],
                                      )
                                    }
                                  />
                                  {fandom.name}
                                </label>
                              );
                            })}
                        </div>
                      </section>
                    )
                  )}
                  {status === "loading" && <p className="status-message" role="status">Loading works...</p>}
                  {status === "error" && (
                    <div className="works-error" role="alert">
                      <p>We couldn’t load the archive: {error}</p>
                      <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
                        Try again
                      </button>
                    </div>
                  )}
                  {status === "success" &&
                    works.length === 0 &&
                    (search || hasActiveFilters ? (
                      <p className="empty-state">
                        {search
                          ? `No works match “${search}” and the selected filters.`
                          : "No works match the selected filters."}{" "}
                        Try changing your search or filters.
                      </p>
                    ) : (
                      <p className="empty-state">Your library is empty. Choose a book to preview its metadata, then save the catalog details to AYO. The book file stays on your device.</p>
                    ))}
                  {status === "success" && works.length > 0 && (
                    <div className="work-list">
                      {works.map((work) => (
                        <WorkCard key={work.id} work={work} />
                      ))}
                    </div>
                  )}
                </section>
              </div>
              <aside id="upload" className="sidebar">
                <UploadForm onSaved={() => setRetryCount((count) => count + 1)} />
                <div className="sidebar-note">
                  <span className="note-icon" aria-hidden="true">✦</span>
                  <h3>Your library, organized</h3>
                  <p>Save metadata to organize your EPUB and PDF collection. The book files stay on your device.</p>
                </div>
              </aside>
            </div>
            {authError && <p className="auth-error" role="alert">{authError}</p>}
          </>
        )}
        <footer className="site-footer">
          <span>Personal fanfiction library · Local-first by design</span>
          <a
            href="https://github.com/briz123/Archive_of_your_own"
            target="_blank"
            rel="noreferrer"
          >
            View this project on GitHub <span aria-hidden="true">↗</span>
          </a>
        </footer>
      </main>
    </div>
  );
}

export default App;
