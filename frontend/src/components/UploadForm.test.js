import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { extractMetadata, saveWork } = vi.hoisted(() => ({
  extractMetadata: vi.fn(),
  saveWork: vi.fn(),
}));

vi.mock("../services/api.js", () => ({ saveWork }));
vi.mock("../services/metadata/index.js", () => ({ extractMetadata }));

import UploadForm from "./UploadForm.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function makeFile(name) {
  const file = new File(["book data"], name, { type: "" });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn().mockResolvedValue(new ArrayBuffer(9)),
  });
  return file;
}

async function selectFile(input, file) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("UploadForm file selection", () => {
  it("clears the selection after save and accepts the next file", async () => {
    const firstFile = makeFile("first.epub");
    const secondFile = makeFile("second.EPUB");
    const metadata = {
      format: "EPUB",
      fileName: "first.epub",
      title: "First story",
      author: null,
      description: null,
      language: null,
      publisher: null,
      publicationDate: null,
      identifier: null,
      subject: null,
      creator: null,
      producer: null,
      creationDate: null,
      modificationDate: null,
      rating: null,
      category: null,
      archiveWarnings: [],
      tags: [],
      coverImage: null,
    };
    extractMetadata.mockResolvedValue(metadata);
    saveWork.mockResolvedValue({});
    vi.stubGlobal("crypto", {
      subtle: { digest: vi.fn().mockResolvedValue(new ArrayBuffer(32)) },
    });

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(UploadForm)));

    const input = container.querySelector('input[type="file"]');
    await selectFile(input, firstFile);
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Add to my library"))
        .click();
    });

    expect(saveWork).toHaveBeenCalledOnce();
    expect(input.value).toBe("");
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true);

    await selectFile(input, secondFile);
    expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenNthCalledWith(2, secondFile);
  });
});
