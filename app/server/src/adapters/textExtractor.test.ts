import { describe, it, expect } from "vitest";
import type { S3ObjectRef } from "@sage/shared";
import { TextExtractorImpl } from "./textExtractor.js";

/**
 * Minimal unit tests for TextExtractor (task 10.3), focused on the not-parsed
 * and partial-extraction flagging paths. Parsers are injected so no real
 * docx/pdf binary fixtures or native deps are exercised.
 */

const docxRef: S3ObjectRef = { key: "a.docx", fileType: "docx" };
const pdfRef: S3ObjectRef = { key: "a.pdf", fileType: "pdf" };

describe("TextExtractor — not-parsed path", () => {
  it("marks a docx as not parsed when the parser throws on a bogus buffer", async () => {
    const extractor = new TextExtractorImpl(
      async () => {
        throw new Error("not a valid docx");
      },
      async () => ({ text: "", totalPages: 0, pagesWithText: 0 }),
    );

    const result = await extractor.extract(docxRef, Buffer.from("not a real docx"));

    expect(result).toEqual({ text: "", partial: false, notParsed: true });
  });

  it("marks a pdf as not parsed when no page text is recovered (image-only)", async () => {
    const extractor = new TextExtractorImpl(
      async () => ({ text: "", partial: false }),
      async () => ({ text: "", totalPages: 3, pagesWithText: 0 }),
    );

    const result = await extractor.extract(pdfRef, Buffer.from("%PDF-bogus"));

    expect(result).toEqual({ text: "", partial: false, notParsed: true });
  });

  it("marks an unsupported file type as not parsed", async () => {
    const extractor = new TextExtractorImpl();
    const result = await extractor.extract(
      { key: "a.txt", fileType: "docx" as unknown as "docx" } as S3ObjectRef,
      Buffer.from(""),
    );
    // Force an unknown fileType at runtime.
    const weird = await extractor.extract(
      { key: "a.pptx", fileType: "pptx" as unknown as "docx" } as unknown as S3ObjectRef,
      Buffer.from("x"),
    );
    expect(weird).toEqual({ text: "", partial: false, notParsed: true });
    // (first call kept to ensure docx path still runs without throwing)
    expect(result.notParsed).toBe(true);
  });
});

describe("TextExtractor — successful extraction and partial flagging", () => {
  it("extracts docx text and is not partial when mammoth reports no errors", async () => {
    const extractor = new TextExtractorImpl(
      async () => ({ text: "full document text", partial: false }),
      async () => ({ text: "", totalPages: 0, pagesWithText: 0 }),
    );
    const result = await extractor.extract(docxRef, Buffer.from("docx"));
    expect(result).toEqual({ text: "full document text", partial: false, notParsed: false });
  });

  it("flags docx extraction as partial when the parser reports partial", async () => {
    const extractor = new TextExtractorImpl(
      async () => ({ text: "some recovered text", partial: true }),
      async () => ({ text: "", totalPages: 0, pagesWithText: 0 }),
    );
    const result = await extractor.extract(docxRef, Buffer.from("docx"));
    expect(result).toEqual({ text: "some recovered text", partial: true, notParsed: false });
  });

  it("flags pdf extraction as partial when only some pages yield text", async () => {
    const extractor = new TextExtractorImpl(
      async () => ({ text: "", partial: false }),
      async () => ({ text: "page one text", totalPages: 3, pagesWithText: 1 }),
    );
    const result = await extractor.extract(pdfRef, Buffer.from("pdf"));
    expect(result).toEqual({ text: "page one text", partial: true, notParsed: false });
  });

  it("does not flag pdf as partial when all pages yield text", async () => {
    const extractor = new TextExtractorImpl(
      async () => ({ text: "", partial: false }),
      async () => ({ text: "all pages text", totalPages: 2, pagesWithText: 2 }),
    );
    const result = await extractor.extract(pdfRef, Buffer.from("pdf"));
    expect(result).toEqual({ text: "all pages text", partial: false, notParsed: false });
  });
});
