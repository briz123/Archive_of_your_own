const TAG_CATEGORIES = {
  relationship_id: "Relationship",
  character_id: "Character",
  additional_tag_id: "Additional",
  include_warning_id: "Archive Warning",
  exclude_warning_id: "Archive Warning",
};

const EMPTY_FILTERS = {
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
};

const SORT_OPTIONS = [
  ["recent", "Recently uploaded"],
  ["oldest", "Oldest uploaded"],
  ["title", "Alphabetical title"],
  ["word_count_desc", "Highest word count"],
  ["word_count_asc", "Lowest word count"],
];

function CheckboxGroup({ label, name, options, selected, onChange }) {
  return (
    <details className="filter-group">
      <summary>
        {label}
        {selected.length > 0 && (
          <span className="filter-count"> ({selected.length} selected)</span>
        )}
      </summary>
      {options.length === 0 ? (
        <p className="filter-no-options">No options available yet.</p>
      ) : (
        <div className="filter-options">
          {options.map((option) => {
            const value = String(option.value);
            const checked = selected.includes(value);
            return (
              <label className="filter-option" key={value}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((item) => item !== value)
                      : [...selected, value];
                    onChange(name, next);
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </details>
  );
}

function optionsFromNames(names) {
  return names.map((name) => ({ value: name, label: name }));
}

function tagOptions(tags, category) {
  return tags
    .filter((tag) => !category || tag.category === category)
    .map((tag) => ({ value: tag.id, label: tag.name }));
}

function AdvancedFilters({ filters, options, onChange, onClear, loading }) {
  const groupedTagOptions = (key) =>
    tagOptions(options.tags, TAG_CATEGORIES[key]);
  const allTags = tagOptions(options.tags);

  return (
    <section className="advanced-filters" aria-label="Advanced filters">
      <div className="filter-heading">
        <h3>Filter and sort</h3>
        <button type="button" className="clear-search" onClick={onClear}>
          Clear filters
        </button>
      </div>
      {loading ? (
        <p role="status">Loading filter options...</p>
      ) : (
        <>
          <div className="filter-groups">
            <CheckboxGroup
              label="Fandom"
              name="fandom_id"
              options={tagOptions([], null).concat(
                options.fandoms.map((fandom) => ({
                  value: fandom.id,
                  label: fandom.name,
                })),
              )}
              selected={filters.fandom_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Rating"
              name="rating"
              options={optionsFromNames(options.ratings)}
              selected={filters.rating}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Relationship"
              name="relationship_id"
              options={groupedTagOptions("relationship_id")}
              selected={filters.relationship_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Character"
              name="character_id"
              options={groupedTagOptions("character_id")}
              selected={filters.character_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Additional tags"
              name="additional_tag_id"
              options={groupedTagOptions("additional_tag_id")}
              selected={filters.additional_tag_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Include archive warnings"
              name="include_warning_id"
              options={groupedTagOptions("include_warning_id")}
              selected={filters.include_warning_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Exclude archive warnings"
              name="exclude_warning_id"
              options={groupedTagOptions("exclude_warning_id")}
              selected={filters.exclude_warning_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Include any tag"
              name="include_tag_id"
              options={allTags}
              selected={filters.include_tag_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Exclude tags"
              name="exclude_tag_id"
              options={allTags}
              selected={filters.exclude_tag_id}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Completion"
              name="completion_status"
              options={optionsFromNames(options.completion_statuses)}
              selected={filters.completion_status}
              onChange={onChange}
            />
            <CheckboxGroup
              label="Language"
              name="language"
              options={optionsFromNames(options.languages)}
              selected={filters.language}
              onChange={onChange}
            />
          </div>
          <label className="sort-control">
            Sort by
            <select
              value={filters.sort}
              onChange={(event) => onChange("sort", event.target.value)}
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </section>
  );
}

export { EMPTY_FILTERS };
export default AdvancedFilters;
