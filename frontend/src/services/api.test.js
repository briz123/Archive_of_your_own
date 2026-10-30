import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWorks } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
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
