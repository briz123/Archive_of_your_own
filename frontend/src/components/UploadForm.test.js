import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { calculateFingerprint, extractMetadata, saveWork } = vi.hoisted(() => ({
  calculateFingerprint: vi.fn(),
  extractMetadata: vi.fn(),
  saveWork: vi.fn(),
}));

vi.mock("../services/api.js", () => ({ saveWork }));
vi.mock("../services/metadata/index.js", () => ({
  calculateFingerprint,
  extractMetadata,
}));

import UploadForm from "./UploadForm.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
let showDirectoryPickerDescriptor;

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount());
  }
  container?.remove();
  container = null;
  root = null;
  if (showDirectoryPickerDescriptor) {
    Object.defineProperty(window, "showDirectoryPicker", showDirectoryPickerDescriptor);
    showDirectoryPickerDescriptor = null;
  } else {
    delete window.showDirectoryPicker;
  }
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

async function selectFile(input, files) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: Array.isArray(files) ? files : [files],
  });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("UploadForm file selection", () => {
  it("uses the shared metadata and fingerprint flow for an unpacked EPUB folder", async () => {
    const directoryHandle = {
      kind: "directory",
      name: "unpacked.epub",
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(),
    };
    showDirectoryPickerDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "showDirectoryPicker",
    );
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: vi.fn().mockResolvedValue(directoryHandle),
    });
    extractMetadata.mockResolvedValue({
      format: "EPUB",
      fileName: "unpacked.epub",
      title: "Unpacked Story",
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
    });
    calculateFingerprint.mockResolvedValue({
      fileSize: 24,
      fingerprintVersion: 2,
      checksum: "a".repeat(64),
    });
    saveWork.mockResolvedValue({});

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(UploadForm)));

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Choose an EPUB folder"))
        .click();
    });
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: "read" });
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenCalledWith(directoryHandle);
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Add to my library"))
        .click();
    });

    expect(calculateFingerprint).toHaveBeenCalledWith(directoryHandle, "EPUB");
    expect(saveWork).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({
          original_filename: "unpacked.epub",
          file_size: 24,
          checksum: "a".repeat(64),
          fingerprint_version: 2,
        }),
      }),
    );
  });

  it("replaces the selected file across consecutive imports", async () => {
    const firstFile = makeFile("first.epub");
    const secondFile = makeFile("second.EPUB");
    const thirdFile = makeFile("third.epub");
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
    calculateFingerprint.mockResolvedValue({
      fileSize: 9,
      fingerprintVersion: 1,
      checksum: "b".repeat(64),
    });
    saveWork.mockResolvedValue({});

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(UploadForm)));

    const input = container.querySelector('input[type="file"]');
    await selectFile(input, firstFile);
    expect(input.value).toBe("");
    expect(container.textContent).toContain("Selected file: first.epub");
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
    expect(container.textContent).toContain("Selected file: second.EPUB");
    expect(container.textContent).not.toContain("Selected file: first.epub");
    expect(container.querySelector('button[type="submit"]').disabled).toBe(false);
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenNthCalledWith(2, secondFile);
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Add to my library"))
        .click();
    });

    await selectFile(input, thirdFile);
    expect(container.textContent).toContain("Selected file: third.epub");
    expect(container.textContent).not.toContain("Selected file: second.EPUB");
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenNthCalledWith(3, thirdFile);
    expect(saveWork).toHaveBeenCalledTimes(2);
  });

  it("extracts and saves multiple selected files in sequence", async () => {
    const firstFile = makeFile("first.epub");
    const secondFile = makeFile("second.pdf");
    extractMetadata.mockImplementation(async (file) => ({
      format: file.name.endsWith(".pdf") ? "PDF" : "EPUB",
      fileName: file.name,
      title: file.name,
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
    }));
    calculateFingerprint.mockResolvedValue({
      fileSize: 9,
      fingerprintVersion: 1,
      checksum: "c".repeat(64),
    });
    saveWork.mockResolvedValue({});

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(createElement(UploadForm)));

    const input = container.querySelector('input[type="file"]');
    expect(input.multiple).toBe(true);
    await selectFile(input, [firstFile, secondFile]);
    expect(container.textContent).toContain("File 1 of 2: first.epub");

    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenNthCalledWith(1, firstFile);
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Add to my library"))
        .click();
    });

    expect(saveWork).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Imported 1 of 2 selected files.");
    expect(container.textContent).toContain("File 2 of 2: second.pdf");
    await act(async () => {
      container.querySelector('button[type="submit"]').click();
    });
    expect(extractMetadata).toHaveBeenNthCalledWith(2, secondFile);
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent.includes("Add to my library"))
        .click();
    });

    expect(saveWork).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Imported all 2 selected files.");
    expect(container.textContent).toContain("second.pdf was added to your library.");
  });
});
