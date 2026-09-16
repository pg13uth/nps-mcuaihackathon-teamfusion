/**
 * Component tests for DocumentLibraryView (Task 13.3, Requirements 10.2, 10.3,
 * 10.4, 10.7).
 *
 * Verifies the library lists documents, flags an untagged (excluded from
 * grounding) document and a Superseded document with explicit text (not color
 * alone), and surfaces an unavailable S3 diagnostic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { DocumentListEntry, ListDocumentsResponse } from "../api.js";

// Mock the API module so the component fetches deterministic data.
vi.mock("../api.js", async () => {
  const actual = await vi.importActual<typeof import("../api.js")>("../api.js");
  return {
    ...actual,
    listDocuments: vi.fn(),
    tagDocument: vi.fn(),
  };
});

import { listDocuments } from "../api.js";
import { DocumentLibraryView } from "./DocumentLibraryView.js";

const listDocumentsMock = vi.mocked(listDocuments);

function untaggedDoc(): DocumentListEntry {
  return {
    docId: "DOC_UNTAGGED",
    s3Key: "Agents/untagged.pdf",
    fileType: "pdf",
    metadata: null,
    untagged: true,
    usableForGrounding: false,
    flaggedStatus: false,
  };
}

function supersededDoc(): DocumentListEntry {
  return {
    docId: "DOC_SUPERSEDED",
    s3Key: "Agents/old-policy.docx",
    fileType: "docx",
    metadata: {
      Echelon: "Strategic",
      Domain: "Policy",
      Doc_Type: "Directive",
      Status: "Superseded",
      Topic_Tags: ["policy"],
    },
    untagged: false,
    usableForGrounding: true,
    flaggedStatus: true,
  };
}

function response(overrides: Partial<ListDocumentsResponse> = {}): ListDocumentsResponse {
  return {
    documents: [untaggedDoc(), supersededDoc()],
    s3Available: true,
    ...overrides,
  };
}

describe("DocumentLibraryView", () => {
  beforeEach(() => {
    listDocumentsMock.mockReset();
  });

  it("flags an untagged document as excluded from grounding", async () => {
    listDocumentsMock.mockResolvedValue(response());
    render(<DocumentLibraryView />);

    await waitFor(() =>
      expect(screen.getByTestId("documents-table")).toBeInTheDocument(),
    );

    const flag = screen.getByTestId("doc-flag-untagged-DOC_UNTAGGED");
    expect(flag).toHaveTextContent(/Untagged/i);
    expect(flag).toHaveTextContent(/excluded/i);
  });

  it("flags a Superseded document with explicit text", async () => {
    listDocumentsMock.mockResolvedValue(response());
    render(<DocumentLibraryView />);

    await waitFor(() =>
      expect(screen.getByTestId("documents-table")).toBeInTheDocument(),
    );

    const row = screen.getByTestId("doc-row-DOC_SUPERSEDED");
    expect(row).toHaveTextContent(/Superseded/);
  });

  it("surfaces an unavailable S3 diagnostic", async () => {
    listDocumentsMock.mockResolvedValue(
      response({
        documents: [],
        s3Available: false,
        s3Detail: "Credentials expired for us-east-1.",
      }),
    );
    render(<DocumentLibraryView />);

    const banner = await screen.findByTestId("s3-unavailable");
    expect(banner).toHaveTextContent(/unavailable/i);
    expect(banner).toHaveTextContent(/Credentials expired/);
  });
});
