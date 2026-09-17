/**
 * DocumentLibraryView (Task 13.3) — Requirements 10.2, 10.3, 10.4, 10.7.
 *
 * Lists the document library via `listDocuments()` (docx/pdf objects, 10.2),
 * shows the five required metadata keys (Echelon, Domain, Doc_Type, Status,
 * Topic_Tags — 10.3), visually + textually flags untagged documents that are
 * excluded from grounding (10.4) and Superseded/Draft sources (10.7), and
 * provides a tagging UI that calls `tagDocument(...)` to register the five keys
 * (10.3).
 *
 * When S3 is unavailable the backend still returns `s3Available:false` with a
 * diagnostic detail; this component surfaces that without crashing.
 */

import { useCallback, useEffect, useState } from "react";
import type { DocStatus } from "@sage/shared";
import type { DocumentListEntry, ListDocumentsResponse, TagDocumentRequest } from "../api.js";
import { listDocuments, tagDocument, ApiError } from "../api.js";
import "./task13-3.css";

const DOC_STATUSES: DocStatus[] = ["Active", "Superseded", "Draft"];

export interface DocumentLibraryViewProps {
  /** Optional changing value that forces a reload of the document list. */
  refreshSignal?: unknown;
  /** Called after a successful tag so parents can react (e.g. refresh grounding). */
  onTagged?: (s3Key: string) => void;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; data: ListDocumentsResponse };

export function DocumentLibraryView({ refreshSignal, onTagged }: DocumentLibraryViewProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [tagTarget, setTagTarget] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await listDocuments();
      setState({ kind: "loaded", data });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Failed to load documents.";
      setState({ kind: "error", message });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const handleTagged = useCallback(
    (s3Key: string) => {
      setTagTarget(null);
      onTagged?.(s3Key);
      void load();
    },
    [load, onTagged],
  );

  return (
    <section aria-labelledby="doc-library-heading" className="sage-t3-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id="doc-library-heading">Document Library</h2>
        <button type="button" onClick={() => void load()} data-testid="documents-refresh">
          Refresh
        </button>
      </div>

      {state.kind === "loading" ? (
        <p data-testid="documents-loading">Loading documents…</p>
      ) : null}

      {state.kind === "error" ? (
        <p className="sage-t3-error" role="alert" data-testid="documents-error">
          {state.message}
        </p>
      ) : null}

      {state.kind === "loaded" ? (
        <>
          {!state.data.s3Available ? (
            <p className="sage-t3-error" role="alert" data-testid="s3-unavailable">
              Live S3 library unavailable
              {state.data.s3Detail ? `: ${state.data.s3Detail}` : "."}
            </p>
          ) : null}

          {state.data.documents.length === 0 ? (
            <p data-testid="documents-empty">No documents found.</p>
          ) : (
            <table className="sage-t3-doc-table" data-testid="documents-table">
              <thead>
                <tr>
                  <th>Doc ID</th>
                  <th>Type</th>
                  <th>Echelon</th>
                  <th>Domain</th>
                  <th>Doc Type</th>
                  <th>Status</th>
                  <th>Topic Tags</th>
                  <th>Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.data.documents.map((doc) => (
                  <DocumentRow
                    key={doc.s3Key}
                    doc={doc}
                    isTagging={tagTarget === doc.s3Key}
                    onToggleTag={() =>
                      setTagTarget((prev) => (prev === doc.s3Key ? null : doc.s3Key))
                    }
                    onTagged={handleTagged}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </section>
  );
}

interface DocumentRowProps {
  doc: DocumentListEntry;
  isTagging: boolean;
  onToggleTag: () => void;
  onTagged: (s3Key: string) => void;
}

function DocumentRow({ doc, isTagging, onToggleTag, onTagged }: DocumentRowProps) {
  const meta = doc.metadata;
  const status = meta?.Status;
  return (
    <>
      <tr data-testid={`doc-row-${doc.docId}`}>
        <td>{doc.docId}</td>
        <td>{doc.fileType}</td>
        <td>{meta?.Echelon ?? "—"}</td>
        <td>{meta?.Domain ?? "—"}</td>
        <td>{meta?.Doc_Type ?? "—"}</td>
        <td>{status ?? "—"}</td>
        <td>{meta?.Topic_Tags?.join(", ") ?? "—"}</td>
        <td>
          {doc.untagged ? (
            <span
              className="sage-t3-flag is-untagged"
              data-testid={`doc-flag-untagged-${doc.docId}`}
            >
              Untagged — excluded
            </span>
          ) : null}
          {status === "Superseded" ? (
            <span className="sage-t3-flag is-superseded">Superseded</span>
          ) : null}
          {status === "Draft" ? (
            <span className="sage-t3-flag is-draft">Draft</span>
          ) : null}
          {doc.usableForGrounding ? (
            <span className="sage-t3-flag is-usable">Grounding</span>
          ) : null}
        </td>
        <td>
          <button
            type="button"
            onClick={onToggleTag}
            data-testid={`doc-tag-toggle-${doc.docId}`}
          >
            {isTagging ? "Cancel" : doc.untagged ? "Tag" : "Edit tags"}
          </button>
        </td>
      </tr>
      {isTagging ? (
        <tr>
          <td colSpan={9}>
            <TagForm doc={doc} onTagged={onTagged} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

interface TagFormProps {
  doc: DocumentListEntry;
  onTagged: (s3Key: string) => void;
}

function TagForm({ doc, onTagged }: TagFormProps) {
  const meta = doc.metadata;
  const [echelon, setEchelon] = useState(meta?.Echelon ?? "");
  const [domain, setDomain] = useState(meta?.Domain ?? "");
  const [docType, setDocType] = useState(meta?.Doc_Type ?? "");
  const [statusValue, setStatusValue] = useState<DocStatus>(meta?.Status ?? "Active");
  const [topicTags, setTopicTags] = useState((meta?.Topic_Tags ?? []).join(", "));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: TagDocumentRequest = {
      s3Key: doc.s3Key,
      fileType: doc.fileType,
      docId: doc.docId,
      metadata: {
        Echelon: echelon.trim(),
        Domain: domain.trim(),
        Doc_Type: docType.trim(),
        Status: statusValue,
        Topic_Tags: topicTags
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
      },
    };
    try {
      await tagDocument(payload);
      onTagged(doc.s3Key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to tag document.");
      setSubmitting(false);
    }
  };

  const fieldId = (name: string) => `tag-${doc.docId}-${name}`;

  return (
    <form className="sage-t3-tag-form" onSubmit={onSubmit} data-testid={`tag-form-${doc.docId}`}>
      <label htmlFor={fieldId("echelon")}>Echelon</label>
      <input
        id={fieldId("echelon")}
        value={echelon}
        onChange={(e) => setEchelon(e.target.value)}
        required
      />

      <label htmlFor={fieldId("domain")}>Domain</label>
      <input
        id={fieldId("domain")}
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        required
      />

      <label htmlFor={fieldId("docType")}>Doc Type</label>
      <input
        id={fieldId("docType")}
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        required
      />

      <label htmlFor={fieldId("status")}>Status</label>
      <select
        id={fieldId("status")}
        value={statusValue}
        onChange={(e) => setStatusValue(e.target.value as DocStatus)}
      >
        {DOC_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <label htmlFor={fieldId("tags")}>Topic Tags (comma-separated)</label>
      <input
        id={fieldId("tags")}
        value={topicTags}
        onChange={(e) => setTopicTags(e.target.value)}
      />

      {error ? (
        <p className="sage-t3-error" role="alert" data-testid={`tag-error-${doc.docId}`}>
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} data-testid={`tag-submit-${doc.docId}`}>
        {submitting ? "Saving…" : "Save tags"}
      </button>
    </form>
  );
}
