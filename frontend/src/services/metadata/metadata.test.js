import { zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));

vi.mock("pdfjs-dist", () => ({
  getDocument,
  GlobalWorkerOptions: {},
}));

import {
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
  cover = true,
  compressionLevel = 0,
} = {}) {
  const coverManifest = cover
    ? '<item id="cover-id" href="images/cover.jpg" media-type="image/jpeg"/>'
    : "";
  const coverMeta = cover ? '<meta name="cover" content="cover-id"/>' : "";
  const files = {
    mimetype: encode("application/epub+zip"),
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
  if (cover) {
    files["OEBPS/images/cover.jpg"] = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }
  return zipSync(files, { level: compressionLevel });
}

function makeFile(name, bytes, type) {
  return new File([bytes], name, { type });
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

  it("accepts uppercase EPUB extensions when the browser MIME type is missing", async () => {
    const result = await extractMetadata(
      makeFile("UPPERCASE.EPUB", makeEpub({ cover: false }), ""),
    );

    expect(result.format).toBe("EPUB");
    expect(result.fileName).toBe("UPPERCASE.EPUB");
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
