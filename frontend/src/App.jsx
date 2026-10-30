import { useEffect, useState } from "react";

import { fetchFilterOptions, fetchWorks } from "./services/api.js";
import AdvancedFilters, { EMPTY_FILTERS } from "./components/AdvancedFilters.jsx";
import SearchBar from "./components/SearchBar.jsx";
import WorkCard from "./components/WorkCard.jsx";

function App() {
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
  const advancedSearchEnabled = filterOptions?.advanced_search_enabled === true;

  useEffect(() => {
    let active = true;

    async function loadFilterOptions() {
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
  }, [filterOptionsRetry]);

  useEffect(() => {
    let active = true;

    async function loadWorks() {
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
  }, [search, filters, retryCount, advancedSearchEnabled]);

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

  const hasActiveFilters = Object.entries(filters).some(
    ([name, value]) =>
      (Array.isArray(value) && value.length > 0) ||
      (name === "sort" && value !== "recent"),
  );

  return (
    <main>
      <h1>Archive of Your Own</h1>
      <p>A searchable archive for downloadable fanfiction.</p>
      <section className="works-section" aria-live="polite" aria-busy={status === "loading"}>
        <h2>Works</h2>
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
              <label htmlFor="fandom-search">Fandoms</label>
              <input
                id="fandom-search"
                type="search"
                value={fandomQuery}
                onChange={(event) => setFandomQuery(event.target.value)}
                placeholder="Find fandoms"
                disabled={!filterOptions}
              />
              {filters.fandom_id.length > 0 && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => updateFilter("fandom_id", [])}
                >
                  Clear fandoms
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
        {status === "loading" && <p role="status">Loading works...</p>}
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
            <p>
              {search
                ? `No works match “${search}” and the selected filters.`
                : "No works match the selected filters."}{" "}
              Try changing your search or filters.
            </p>
          ) : (
            <p>No works have been uploaded yet. Check back soon.</p>
          ))}
        {status === "success" && works.length > 0 && (
          <div className="work-list">
            {works.map((work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
