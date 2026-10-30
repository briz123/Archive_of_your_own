import { useState } from "react";

function SearchBar({ initialSearch, onSearch, disabled }) {
  const [query, setQuery] = useState(initialSearch);

  function handleSubmit(event) {
    event.preventDefault();
    onSearch(query.trim());
  }

  function handleClear() {
    setQuery("");
    onSearch("");
  }

  return (
    <form className="search-bar" role="search" onSubmit={handleSubmit}>
      <label className="visually-hidden" htmlFor="work-search">
        Search by title or author
      </label>
      <input
        id="work-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by title or author"
      />
      <button type="submit" disabled={disabled}>
        Search
      </button>
      {initialSearch && (
        <button type="button" className="clear-search" onClick={handleClear}>
          Clear search
        </button>
      )}
    </form>
  );
}

export default SearchBar;
