import { useEffect, useState } from "react";

import { fetchWorks } from "./services/api.js";
import WorkCard from "./components/WorkCard.jsx";

function App() {
  const [works, setWorks] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadWorks() {
      setStatus("loading");
      setError("");
      try {
        const result = await fetchWorks();
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
  }, [retryCount]);

  return (
    <main>
      <h1>Archive of Your Own</h1>
      <p>A searchable archive for downloadable fanfiction.</p>
      <section className="works-section" aria-live="polite" aria-busy={status === "loading"}>
        <h2>Works</h2>
        {status === "loading" && <p role="status">Loading works...</p>}
        {status === "error" && (
          <div className="works-error" role="alert">
            <p>We couldn’t load the archive: {error}</p>
            <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
              Try again
            </button>
          </div>
        )}
        {status === "success" && works.length === 0 && (
          <p>No works have been uploaded yet. Check back soon.</p>
        )}
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
