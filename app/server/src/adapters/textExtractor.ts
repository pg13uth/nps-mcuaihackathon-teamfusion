/**
 * TextExtractor — side-effecting adapter that parses document bytes to text
 * (Requirement 10.2, design "Text Extraction Errors").
 *
 * Contract (see design error-handling section):
 *  - Parses `.docx` via mammoth and `.pdf` via pdf-parse.
 *  - NEVER throws for a parse failure. When a file cannot be parsed at all
 *    (unsupported type, corrupt bytes, image-only PDF with no text) it returns
 *    `{ text: "", partial: false, notParsed: true }` so the object can still be
 *    listed but is marked "not parsed" and excluded from grounding until parsable.
 *  - Sets `partial: true` when only some of the document's text could be
 *    recovered (e.g. mammoth emits error/warning messages, or a PDF yields text
 *    for some but not all pages) so downstream citation grounding treats it
 *    cautiously.
 *
 * The docx/pdf parser functions are injectable via the constructor so tests can
 * exercise the not-parsed path without real binary fixtures or native deps.
 */

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { ExtractedText, S3ObjectRef, TextExtractor } from "@sage/shared";

/** Result of a docx parse: recovered text plus whether extraction was partial. */
export interface DocxParseResult {
  text: string;
  partial: boolean;
}

/** Result of a pdf parse: recovered text, total pages, and pages with text. */
export interface PdfParseResult {
  text: string;
  totalPages: number;
  pagesWithText: number;
}

/** Injectable docx parser (defaults to mammoth). */
export type DocxParser = (bytes: Buffer) => Promise<DocxParseResult>;
/** Injectable pdf parser (defaults to pdf-parse). */
export type PdfParser = (bytes: Buffer) => Promise<PdfParseResult>;

/** Default docx parser backed by mammoth's raw-text extraction. */
export const defaultDocxParser: DocxParser = async (bytes) => {
  const result = await mammoth.extractRawText({ buffer: bytes });
  // mammoth surfaces problems as messages; an "error" message means some content
  // was skipped, so treat the extraction as partial.
  const partial = result.messages.some((m) => m.type === "error");
  return { text: result.value ?? "", partial };
};

/** Default pdf parser backed by pdf-parse (v2 class API). */
export const defaultPdfParser: PdfParser = async (bytes) => {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    const pages = result.pages ?? [];
    const pagesWithText = pages.filter((p) => p.text.trim().length > 0).length;
    return {
      text: result.text ?? "",
      totalPages: result.total ?? pages.length,
      pagesWithText,
    };
  } finally {
    await parser.destroy();
  }
};

/** A fully "not parsed" result — no text recovered, file flagged as unparsable. */
const NOT_PARSED: ExtractedText = { text: "", partial: false, notParsed: true };

export class TextExtractorImpl implements TextExtractor {
  private readonly parseDocx: DocxParser;
  private readonly parsePdf: PdfParser;

  constructor(parseDocx: DocxParser = defaultDocxParser, parsePdf: PdfParser = defaultPdfParser) {
    this.parseDocx = parseDocx;
    this.parsePdf = parsePdf;
  }

  async extract(objectRef: S3ObjectRef, bytes: Buffer): Promise<ExtractedText> {
    if (objectRef.fileType === "docx") {
      return this.extractDocx(bytes);
    }
    if (objectRef.fileType === "pdf") {
      return this.extractPdf(bytes);
    }
    // Unsupported file type: listed but not parsed.
    return NOT_PARSED;
  }

  private async extractDocx(bytes: Buffer): Promise<ExtractedText> {
    try {
      const { text, partial } = await this.parseDocx(bytes);
      if (text.trim().length === 0) {
        // Nothing recovered -> cannot be parsed for grounding.
        return NOT_PARSED;
      }
      return { text, partial, notParsed: false };
    } catch {
      // Corrupt/unreadable docx: flag as not parsed rather than throwing.
      return NOT_PARSED;
    }
  }

  private async extractPdf(bytes: Buffer): Promise<ExtractedText> {
    try {
      const { text, totalPages, pagesWithText } = await this.parsePdf(bytes);
      if (text.trim().length === 0 || pagesWithText === 0) {
        // Image-only or empty PDF: no extractable text.
        return NOT_PARSED;
      }
      // Partial when we recovered text for some, but not all, pages.
      const partial = totalPages > 0 && pagesWithText < totalPages;
      return { text, partial, notParsed: false };
    } catch {
      return NOT_PARSED;
    }
  }
}

/** Default singleton instance for convenient wiring. */
export const textExtractor: TextExtractor = new TextExtractorImpl();
