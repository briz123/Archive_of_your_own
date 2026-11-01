import { unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  getDocument,
  GlobalWorkerOptions: {},
}));

import {
  calculateFingerprint,
  extractEpubMetadata,
  extractMetadata,
  extractPdfMetadata,
  MetadataExtractionError,
} from "./index.js";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "./types.js";

const encode = (value) => new TextEncoder().encode(value);

function makeEpub({
  metadata = `
    <dc:title>  The Sample Story </dc:title>
    <dc:creator>Example Author</dc:creator>
    <dc:description>A story description.</dc:description>
    <dc:language>en</dc:language>
    <dc:publisher>Example Press</dc:publisher>
    <dc:date>2024-01-02</dc:date>
    <dc:identifier>urn:sample:123</dc:identifier>
    <dc:subject>Teen And Up Audiences</dc:subject>
    <dc:subject>Major Character Death</dc:subject>
    <dc:subject>Example Fandom</dc:subject>
    <dc:subject>Example Character/Another Character</dc:subject>
    <dc:subject>Other Relationship Tags to Be Added</dc:subject>
    <dc:subject>Example Character</dc:subject>
    <dc:subject>Other Character Tags to Be Added</dc:subject>
    <dc:subject>Slow Burn</dc:subject>
    <dc:subject>Other Additional Tags to Be Added</dc:subject>
    <dc:subject>F/M</dc:subject>
  `,
  mimetype = "application/epub+zip",
  cover = true,
  compressionLevel = 0,
  includeMimetype = true,
} = {}) {
  const coverManifest = cover
    ? '<item id="cover-id" href="images/cover.jpg" media-type="image/jpeg"/>'
    : "";
  const coverMeta = cover ? '<meta name="cover" content="cover-id"/>' : "";
  const files = {
    "META-INF/container.xml": encode(`
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
        <rootfiles>
          <rootfile full-path="OEBPS/content.opf"
            media-type="application/oebps-package+xml"/>
        </rootfiles>
      </container>
    `),
    "OEBPS/content.opf": encode(`
      <package xmlns="http://www.idpf.org/2007/opf"
        xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata>${metadata}${coverMeta}</metadata>
        <manifest>${coverManifest}</manifest>
      </package>
    `),
  };
  if (includeMimetype) {
    files.mimetype = encode(mimetype);
  }
  if (cover) {
    files["OEBPS/images/cover.jpg"] = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }
  return zipSync(files, { level: compressionLevel });
}

function makeFile(name, bytes, type) {
  return new File([bytes], name, { type });
}

function makeDirectoryHandle(name, contents) {
  function createDirectory(directoryName) {
    const children = new Map();
    return {
      kind: "directory",
      name: directoryName,
      async *values() {
        yield* children.values();
      },
      async getDirectoryHandle(childName) {
        const child = children.get(childName);
        if (child?.kind !== "directory") {
          throw new DOMException("Directory not found", "NotFoundError");
        }
        return child;
      },
      async getFileHandle(childName) {
        const child = children.get(childName);
        if (child?.kind !== "file") {
          throw new DOMException("File not found", "NotFoundError");
        }
        return child;
      },
      children,
    };
  }

  const root = createDirectory(name);
  for (const [path, content] of Object.entries(contents)) {
    const pathParts = path.split("/");
    let current = root;
    for (const segment of pathParts.slice(0, -1)) {
      if (!current.children.has(segment)) {
        current.children.set(segment, createDirectory(segment));
      }
      current = current.children.get(segment);
    }
    const file = new File([content], pathParts.at(-1));
    current.children.set(pathParts.at(-1), {
      kind: "file",
      name: pathParts.at(-1),
      getFile: vi.fn().mockResolvedValue(file),
    });
  }
  return root;
}

describe("EPUB metadata extraction", () => {
  it("extracts standard metadata, typed tags, warnings, and cover bytes", async () => {
    const result = await extractEpubMetadata(
      makeFile("sample.epub", makeEpub(), "application/epub+zip"),
    );

    expect(result).toMatchObject({
      format: "EPUB",
      fileName: "sample.epub",
      title: "The Sample Story",
      author: "Example Author",
      description: "A story description.",
      language: "en",
      publisher: "Example Press",
      publicationDate: "2024-01-02",
      identifier: "urn:sample:123",
      rating: "Teen And Up Audiences",
      category: "F/M",
      archiveWarnings: ["Major Character Death"],
      tags: [
        { name: "Example Fandom", type: "fandom" },
        { name: "Example Character/Another Character", type: "relationship" },
        { name: "Example Character", type: "character" },
        { name: "Slow Burn", type: "additional" },
      ],
    });
    expect(Array.from(result.coverImage.data)).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(result.coverImage.mediaType).toBe("image/jpeg");
  });

  it("extracts an unpacked nested EPUB without reading chapters for metadata", async () => {
    const contents = {
      mimetype: "application/epub+zip",
      "META-INF/container.xml":
        `<container><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
      "OPS/package.opf":
        `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>The Sample Story</dc:title><dc:creator>Example Author</dc:creator></metadata><manifest/></package>`,
      "OPS/chapter.xhtml": "<html><body>Chapter</body></html>",
    };
    const archive = zipSync(
      Object.fromEntries(
        Object.entries(contents).map(([path, content]) => [path, encode(content)]),
      ),
      { level: 0 },
    );
    const archiveFile = makeFile("same-book.epub", archive, "application/octet-stream");
    const archiveMetadata = await extractMetadata(archiveFile);
    expect(archiveMetadata.title).toBe("The Sample Story");
    const directoryHandle = makeDirectoryHandle("unpacked-book", contents);
    const metadata = await extractMetadata(directoryHandle);

    expect(metadata.title).toBe("The Sample Story");
    expect(metadata.fileName).toBe("unpacked-book");
    expect(directoryHandle.children.get("mimetype").getFile).toHaveBeenCalledOnce();
    expect(directoryHandle.children.get("META-INF").children.get("container.xml").getFile)
      .toHaveBeenCalledOnce();
    expect(directoryHandle.children.get("OPS").children.get("chapter.xhtml").getFile)
      .not.toHaveBeenCalled();

    const directoryFingerprint = await calculateFingerprint(directoryHandle, "EPUB");
    const archiveFingerprint = await calculateFingerprint(
      archiveFile,
      "EPUB",
    );
    expect(directoryFingerprint.fingerprintVersion).toBe(2);
    expect(directoryFingerprint.checksum).toBe(archiveFingerprint.checksum);
    expect(directoryHandle.children.get("OPS").children.get("chapter.xhtml").getFile)
      .toHaveBeenCalledOnce();
  });

  it("rejects incomplete unpacked EPUB folders with a clear error", async () => {
    await expect(
      extractMetadata(
        makeDirectoryHandle("incomplete", { mimetype: "application/epub+zip" }),
      ),
    ).rejects.toThrow("missing its container metadata");
  });

  it("returns null metadata and an empty tag list when package fields are absent", async () => {
    const result = await extractEpubMetadata(
      makeFile("empty.epub", makeEpub({ metadata: "", cover: false }), "application/epub+zip"),
    );

    expect(result.title).toBeNull();
    expect(result.author).toBeNull();
    expect(result.publisher).toBeNull();
    expect(result.identifier).toBeNull();
    expect(result.tags).toEqual([]);
    expect(result.coverImage).toBeNull();
    expect(result.archiveWarnings).toEqual([]);
  });

  it("extracts metadata from compressed EPUB entries", async () => {
    const result = await extractEpubMetadata(
      makeFile(
        "compressed.epub",
        makeEpub({ compressionLevel: 6 }),
        "application/epub+zip",
      ),
    );

    expect(result.title).toBe("The Sample Story");
    expect(result.tags).toContainEqual({
      name: "Slow Burn",
      type: "additional",
    });
  });

  it("fingerprints EPUB contents independently of ZIP ordering and compression", async () => {
    const archive = makeEpub({ cover: false });
    const repacked = zipSync(
      Object.fromEntries(Object.entries(unzipSync(archive)).reverse()),
      { level: 6 },
    );
    const first = await calculateFingerprint(makeFile("first.bin", archive, ""), "EPUB");
    const second = await calculateFingerprint(
      makeFile("second.epub", repacked, ""),
      "EPUB",
    );

    expect(second.checksum).toBe(first.checksum);
  });

  it("recognizes an extensionless EPUB with no browser MIME type", async () => {
    const result = await extractMetadata(
      makeFile("book-id", makeEpub({ cover: false }), ""),
    );

    expect(result.format).toBe("EPUB");
    expect(result.fileName).toBe("book-id");
  });

  it("extracts EPUB metadata when the archive mimetype entry is nonstandard", async () => {
    const result = await extractMetadata(
      makeFile(
        "nonstandard-mimetype.epub",
        makeEpub({ mimetype: "application/octet-stream", cover: false }),
        "application/epub+zip",
      ),
    );

    expect(result.format).toBe("EPUB");
    expect(result.title).toBe("The Sample Story");
  });

  it("finds required metadata entries with common path spelling variations", async () => {
    const archive = zipSync({
      mimetype: encode("application/epub+zip"),
      "./meta-inf/CONTAINER.XML": encode(`
        <container><rootfiles>
          <rootfile full-path="./oebps/CONTENT.OPF"
            media-type="application/oebps-package+xml"/>
        </rootfiles></container>
      `),
      "./OEBPS/content.opf": encode(`
        <package xmlns:dc="http://purl.org/dc/elements/1.1/">
          <metadata><dc:title>Path Variation Story</dc:title></metadata>
          <manifest/>
        </package>
      `),
    });

    const result = await extractMetadata(
      makeFile("path-variation.epub", archive, ""),
    );

    expect(result.title).toBe("Path Variation Story");
  });

  it("finds a container below a common enclosing directory", async () => {
    const wrappedEntries = Object.fromEntries(
      Object.entries(unzipSync(makeEpub({ cover: false }))).map(
        ([path, data]) => [`My Export/${path}`, data],
      ),
    );
    const result = await extractMetadata(
      makeFile("wrapped.zip", zipSync(wrappedEntries), "application/zip"),
    );

    expect(result.title).toBe("The Sample Story");
    expect(result.fileName).toBe("wrapped.zip");
    expect(result.validationWarnings).toEqual([]);
  });

  it("records a warning when mimetype is outside the enclosing EPUB directory", async () => {
    const wrappedEntries = Object.fromEntries(
      Object.entries(unzipSync(makeEpub({ cover: false }))).map(
        ([path, data]) => [path === "mimetype" ? path : `Book folder/${path}`, data],
      ),
    );
    const result = await extractMetadata(
      makeFile("misplaced.zip", zipSync(wrappedEntries), "application/zip"),
    );

    expect(result.title).toBe("The Sample Story");
    expect(result.validationWarnings).toContain(
      "The EPUB mimetype entry is outside the package root.",
    );
  });

  it("extracts metadata from an EPUB nested inside a ZIP without reading chapters", async () => {
    const innerArchive = makeEpub({ cover: false });
    const wrapper = zipSync({
      "notes/readme.txt": encode("An unrelated file before the EPUB."),
      "books/nested-story.epub": innerArchive,
    });
    const result = await extractMetadata(
      makeFile("download.zip", wrapper, "application/zip"),
    );

    expect(result.title).toBe("The Sample Story");
    expect(result.fileName).toBe("download.zip");
    expect(result.validationWarnings).toEqual([]);
  });

  it("recovers metadata from a valid OPF when the mimetype and container are absent", async () => {
    const packageFile = encode(`
      <package xmlns:dc="http://purl.org/dc/elements/1.1/">
        <metadata><dc:title>Recovered OPF Story</dc:title></metadata>
      </package>
    `);
    const archive = zipSync({ "OPS/book.opf": packageFile });
    const result = await extractMetadata(
      makeFile("recovered.zip", archive, "application/zip"),
    );

    expect(result.title).toBe("Recovered OPF Story");
    expect(result.validationWarnings).toEqual([
      "The EPUB container document is missing; metadata was recovered from its OPF package.",
      "The EPUB mimetype entry is missing.",
    ]);
  });

  it("does not fail when a valid EPUB is missing its mimetype entry", async () => {
    const result = await extractMetadata(
      makeFile(
        "missing-mimetype.epub",
        makeEpub({ cover: false, includeMimetype: false }),
        "application/epub+zip",
      ),
    );

    expect(result.title).toBe("The Sample Story");
    expect(result.validationWarnings).toContain(
      "The EPUB mimetype entry is missing.",
    );
  });

  it("rejects ZIP files that do not contain a valid EPUB structure", async () => {
    const archive = zipSync({ "notes/readme.txt": encode("Not an EPUB.") });
    await expect(
      extractMetadata(makeFile("unrelated.zip", archive, "application/zip")),
    ).rejects.toThrow("unique OPF package document");
  });

  it("limits the depth of nested EPUB archives", async () => {
    const innerArchive = makeEpub({ cover: false });
    const nestedTwice = zipSync({
      "level-two.epub": zipSync({
        "level-one.epub": innerArchive,
      }),
    });
    const outer = zipSync({ "nested.epub": nestedTwice });

    await expect(
      extractMetadata(makeFile("deep-wrapper.zip", outer, "application/zip")),
    ).rejects.toThrow("nested too deeply");
  });

  it("detects EPUB content when the selected filename has no extension", async () => {
    const result = await extractMetadata(
      makeFile("4DEE880C2-7B71-4AD4-90C9", makeEpub({ cover: false }), ""),
    );

    expect(result.format).toBe("EPUB");
    expect(result.fileName).toBe("4DEE880C2-7B71-4AD4-90C9");
    expect(result.title).toBe("The Sample Story");
  });

  it("uses EPUB content rather than rejecting an unfamiliar extension or MIME type", async () => {
    const result = await extractMetadata(
      makeFile("downloaded-book.bin", makeEpub({ cover: false }), "application/octet-stream"),
    );

    expect(result.format).toBe("EPUB");
    expect(result.title).toBe("The Sample Story");
  });

  it("recognizes EPUB structure without relying on its MIME type", async () => {
    const result = await extractMetadata(
      makeFile("book-id", makeEpub({ cover: false }), "text/plain"),
    );

    expect(result.format).toBe("EPUB");
  });

  it("supports EPUB 3 cover-image properties", async () => {
    const zip = {
      mimetype: encode("application/epub+zip"),
      "META-INF/container.xml": encode(`
        <container><rootfiles>
          <rootfile full-path="book.opf"
            media-type="application/oebps-package+xml"/>
        </rootfiles></container>
      `),
      "book.opf": encode(`
        <package xmlns:dc="http://purl.org/dc/elements/1.1/">
          <metadata><dc:title>Cover Test</dc:title></metadata>
          <manifest>
            <item id="cover" href="cover.png" media-type="image/png"
              properties="cover-image"/>
          </manifest>
        </package>
      `),
      "cover.png": new Uint8Array([1, 2, 3]),
    };
    const result = await extractEpubMetadata(
      makeFile("cover.epub", zipSync(zip, { level: 0 }), "application/epub+zip"),
    );

    expect(result.coverImage.mediaType).toBe("image/png");
    expect(Array.from(result.coverImage.data)).toEqual([1, 2, 3]);
  });

  it("rejects malformed or mislabeled EPUB files with useful errors", async () => {
    await expect(
      extractEpubMetadata(makeFile("broken.epub", encode("not a zip"), "")),
    ).rejects.toThrow("not a valid EPUB archive");
    await expect(
      extractMetadata(makeFile("book.txt", encode("text"), "text/plain")),
    ).rejects.toThrow("Only EPUB and PDF files are supported");
    await expect(
      extractMetadata(
        makeFile("not-an-epub", encode("not a ZIP archive"), "application/epub+zip"),
      ),
    ).rejects.toThrow("Only EPUB and PDF files are supported");
    await expect(
      extractMetadata(
        makeFile("unknown-file", encode("not a supported format"), ""),
      ),
    ).rejects.toThrow('Could not identify "unknown-file"');
  });

  it("rejects invalid XML and oversized files", async () => {
    const invalidXml = makeEpub().slice();
    const invalidPackage = zipSync({
      mimetype: encode("application/epub+zip"),
      "META-INF/container.xml": encode(`
        <container><rootfiles>
          <rootfile full-path="content.opf"
            media-type="application/oebps-package+xml"/>
        </rootfiles></container>
      `),
      "content.opf": encode("<package><metadata>"),
    });
    await expect(
      extractEpubMetadata(makeFile("malformed.epub", invalidPackage, "")),
    ).rejects.toBeInstanceOf(MetadataExtractionError);
    expect(invalidXml.length).toBeGreaterThan(0);

    const tooLarge = {
      name: "large.pdf",
      size: MAX_IMPORT_FILE_SIZE_BYTES + 1,
      arrayBuffer: vi.fn(),
    };
    await expect(extractMetadata(tooLarge)).rejects.toThrow("100 MiB limit");
    expect(tooLarge.arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("PDF metadata extraction", () => {
  beforeEach(() => {
    getDocument.mockReset();
  });

  it("extracts PDF document properties and leaves absent fields null", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getMetadata: () =>
          Promise.resolve({
            info: {
              Title: "PDF Story",
              Author: "PDF Author",
              Subject: "A concise subject",
              Creator: "Writing App",
              Producer: "PDF Producer",
              CreationDate: "D:20250102030405Z",
              ModDate: "D:20250103040506Z",
            },
          }),
      }),
      destroy,
    });
    const result = await extractPdfMetadata(
      makeFile("sample.pdf", encode("%PDF-1.7\n"), "application/pdf"),
    );

    expect(result).toMatchObject({
      format: "PDF",
      title: "PDF Story",
      author: "PDF Author",
      subject: "A concise subject",
      creator: "Writing App",
      producer: "PDF Producer",
      creationDate: "D:20250102030405Z",
      modificationDate: "D:20250103040506Z",
      publisher: null,
      tags: [],
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("handles PDFs with no metadata", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getMetadata: () => Promise.resolve({ info: {} }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    const result = await extractPdfMetadata(
      makeFile("empty.pdf", encode("%PDF-1.7\n"), "application/pdf"),
    );
    expect(result.title).toBeNull();
    expect(result.subject).toBeNull();
    expect(result.modificationDate).toBeNull();
  });

  it("rejects invalid and malformed PDFs", async () => {
    await expect(
      extractPdfMetadata(makeFile("invalid.pdf", encode("not a PDF"), "")),
    ).rejects.toThrow("not a valid PDF");

    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("parse failure")),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      extractPdfMetadata(makeFile("broken.pdf", encode("%PDF-1.7\n"), "")),
    ).rejects.toThrow("malformed, encrypted, or could not be read");
  });
});
