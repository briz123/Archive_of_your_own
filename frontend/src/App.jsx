import { useEffect, useState } from "react";

import { fetchFilterOptions, fetchWorks } from "./services/api.js";
import AdvancedFilters, { EMPTY_FILTERS } from "./components/AdvancedFilters.jsx";
import SearchBar from "./components/SearchBar.jsx";
import UploadForm from "./components/UploadForm.jsx";
import WorkCard from "./components/WorkCard.jsx";

function App() {
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(
    () => sessionStorage.getItem("ayo-disclaimer-accepted") === "true",
  );
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
  const [searchResetKey, setSearchResetKey] = useState(0);
  const advancedSearchEnabled = filterOptions?.advanced_search_enabled === true;

  useEffect(() => {
    let active = true;

    async function loadFilterOptions() {
      if (!acceptedDisclaimer) {
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
  }, [filterOptionsRetry, acceptedDisclaimer]);

  useEffect(() => {
    let active = true;

    async function loadWorks() {
      if (!acceptedDisclaimer) {
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
  }, [search, filters, retryCount, advancedSearchEnabled, acceptedDisclaimer]);

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
      sort: "recent",
    });
    setFandomQuery("");
  }

  function handleUploaded() {
    setSearch("");
    setSearchResetKey((key) => key + 1);
    clearFilters();
    setRetryCount((count) => count + 1);
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

  const hasActiveFilters = Object.entries(filters).some(
    ([name, value]) =>
      (Array.isArray(value) && value.length > 0) ||
      (name === "sort" && value !== "recent"),
  );

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="site-brand" href="/" aria-label="Archive of Your Own home">
          <span className="brand-mark" aria-hidden="true">AOY</span>
          <span className="brand-name">Archive <span>of Your Own</span></span>
        </a>
        {acceptedDisclaimer && (
          <nav className="site-nav" aria-label="Main navigation">
            <a href="#library">Explore works</a>
            <a href="#upload">Add a work</a>
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
                A searchable archive for downloadable fanfiction, made for
                keeping a personal copy on your own device.
              </p>
            </section>
            <section className="disclaimer-gate" aria-labelledby="disclaimer-heading">
              <p className="eyebrow">A note before you begin</p>
              <h2 id="disclaimer-heading">Before you enter</h2>
              <p>
                This independent archive is intended as a temporary way to download
                fanfiction for your own device, including during outages of the
                original publishing site.
              </p>
              <ul>
                <li>
                  This is not AO3 and is not affiliated with or a replacement for
                  AO3 or the Organization for Transformative Works.
                </li>
                <li>
                  You can download files to your device here; you cannot read,
                  edit, or update works on this site. Visit the original publication
                  for the latest version and to support its author.
                </li>
                <li>
                  Copyright remains with the authors and other rights holders.
                  Uploaders are responsible for having permission or another valid
                  legal basis to share a work. A downloaded copy does not itself
                  grant redistribution rights.
                </li>
                <li>
                  This project is provided as-is and does not guarantee permanent
                  storage or availability. This notice is informational and is not
                  legal advice.
                </li>
              </ul>
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
        ) : (
          <>
            <section className="welcome-hero" aria-labelledby="welcome-heading">
              <p className="eyebrow">A personal library for stories you love</p>
              <h1 id="welcome-heading">Find your next favorite.</h1>
              <p>
                Explore the archive, discover stories by fandom, and keep a
                downloadable copy close at hand.
              </p>
              <a className="hero-link" href="#library">Browse the collection <span aria-hidden="true">↓</span></a>
            </section>

            <div className="content-grid">
              <div className="primary-content">
                <section id="library" className="works-section" aria-live="polite" aria-busy={status === "loading"}>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">The collection</p>
                      <h2>Explore works</h2>
                    </div>
                    {status === "success" && works.length > 0 && (
                      <span className="work-count">
                        {works.length} {works.length === 1 ? "work" : "works"}
                      </span>
                    )}
                  </div>
                  <SearchBar
                    key={searchResetKey}
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
                      <p className="empty-state">No works have been uploaded yet. Check back soon.</p>
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
                <UploadForm onUploaded={handleUploaded} />
                <div className="sidebar-note">
                  <span className="note-icon" aria-hidden="true">✦</span>
                  <h3>Made for your library</h3>
                  <p>Save a personal EPUB copy to your device and revisit it whenever you like.</p>
                </div>
              </aside>
            </div>
          </>
        )}
        <footer className="site-footer">
          <span>Independent archive · For personal use</span>
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
