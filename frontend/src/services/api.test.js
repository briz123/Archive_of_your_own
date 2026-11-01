import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCurrentUser, fetchLibraryExport, fetchWorks } from "./api.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchCurrentUser", () => {
  it("returns the current user for an authenticated session", async () => {
    const user = { id: 1, email: "reader@example.com" };
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => user,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCurrentUser()).resolves.toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/me");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("returns null when the user is not signed in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 401, ok: false }),
    );

    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("times out instead of waiting forever for the status endpoint", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const check = fetchCurrentUser();
    const rejectedCheck = expect(check).rejects.toThrow(
      "Checking your sign-in status timed out. Please try again.",
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await rejectedCheck;
  });

  it("does not turn effect cleanup into a timeout error", async () => {
    const caller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    const check = fetchCurrentUser(caller.signal);
    caller.abort();

    await expect(check).rejects.toThrow("Aborted");
  });
});

describe("fetchWorks", () => {
  it("maps advanced tag and warning filters to the works API query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWorks("dragon", {
      fandom_id: ["1"],
      relationship_id: ["2"],
      character_id: ["3"],
      additional_tag_id: ["4"],
      include_tag_id: ["5"],
      exclude_tag_id: ["6"],
      include_warning_id: ["Major Character Death"],
      exclude_warning_id: ["Underage"],
      rating: ["Teen And Up Audiences"],
      sort: "recently_updated",
    });

    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("search")).toBe("dragon");
    expect(url.searchParams.getAll("fandom_id")).toEqual(["1"]);
    expect(url.searchParams.getAll("relationship_id")).toEqual(["2"]);
    expect(url.searchParams.getAll("character_id")).toEqual(["3"]);
    expect(url.searchParams.getAll("additional_tag_id")).toEqual(["4"]);
    expect(url.searchParams.getAll("include_tag_id")).toEqual(["5"]);
    expect(url.searchParams.getAll("exclude_tag_id")).toEqual(["6"]);
    expect(url.searchParams.getAll("warning")).toEqual([
      "Major Character Death",
    ]);
    expect(url.searchParams.getAll("exclude_warning")).toEqual(["Underage"]);
    expect(url.searchParams.getAll("rating")).toEqual([
      "Teen And Up Audiences",
    ]);
    expect(url.searchParams.get("sort")).toBe("recently_updated");
  });
});

describe("fetchLibraryExport", () => {
  it("downloads an authenticated workbook response", async () => {
    const blob = new Blob(["workbook"]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => blob,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLibraryExport()).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/works/export.xlsx");
    expect(fetchMock.mock.calls[0][1]).toEqual({ credentials: "include" });
  });

  it("surfaces API errors when export fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Authentication is required." }),
      }),
    );

    await expect(fetchLibraryExport()).rejects.toThrow(
      "Authentication is required.",
    );
  });
});
