export async function fetchWorks() {
  const response = await fetch("/api/works");
  if (!response.ok) {
    throw new Error(`Could not load works (HTTP ${response.status}).`);
  }

  const works = await response.json();
  if (!Array.isArray(works)) {
    throw new Error("The works response was not in the expected format.");
  }
  return works;
}
