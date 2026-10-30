import { useEffect, useState } from "react";

function App() {
  const [connection, setConnection] = useState({
    status: "loading",
    message: "Checking the backend connection...",
  });

  useEffect(() => {
    async function checkBackend() {
      try {
        const response = await fetch("/api/health");
        if (!response.ok) {
          throw new Error(`Backend returned HTTP ${response.status}`);
        }

        const result = await response.json();
        setConnection(result);
      } catch (error) {
        setConnection({
          status: "error",
          message: `Could not connect to the backend: ${error.message}`,
        });
      }
    }

    checkBackend();
  }, []);

  return (
    <main>
      <h1>Archive of Your Own</h1>
      <p>A searchable archive for downloadable fanfiction.</p>
      <section aria-live="polite">
        <h2>Backend connection</h2>
        <p data-status={connection.status}>{connection.message}</p>
      </section>
    </main>
  );
}

export default App;
