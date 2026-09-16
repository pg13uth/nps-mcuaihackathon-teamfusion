/**
 * Document library, running-estimate, and config/health routes (Task 12.4).
 *
 * Wired to the S3 document adapter, the persistence repository, and the pure
 * grounding filter via dependency injection so they are testable with
 * in-memory fakes (no real network / disk / AWS).
 *
 *  - `GET /documents`
 *      Merge the LIVE S3 listing (S3DocumentAdapter.list over the configured
 *      prefix) with the persisted, tagged doc index (Repository.getDocIndex).
 *      Each object is represented with the five metadata keys (Echelon, Domain,
 *      Doc_Type, Status, Topic_Tags). Newly-listed objects that are not yet in
 *      the index appear as UNTAGGED and are flagged + excluded from grounding
 *      (Requirement 10.4). Docs tagged Superseded/Draft are flagged (10.7).
 *      _Requirements: 10.2, 10.3, 10.4, 10.7_
 *
 *  - `POST /documents`
 *      Register/tag a document with the five metadata keys and persist it to
 *      the doc index (Repository.saveDocIndex). All five keys are required; a
 *      request missing any key is rejected (400) and the doc remains untagged
 *      and excluded from grounding (Requirement 10.3, 10.4).
 *
 *  - `GET /estimate`
 *      Return the persisted running estimate (billet balance, funding status,
 *      active CCIR alerts) with its full revision history, plus any detected
 *      resource collisions (Requirement 12.1, 12.3).
 *
 *  - `GET /config/health`
 *      Report service status and AI configured status; when configured, probe
 *      AI endpoint reachability via an injectable, never-throwing probe. The
 *      API key is never included in the response (Requirement 14.3).
 */

import { Router, type Request, type Response } from "express";
import { isAiConfigured } from "../config.js";
import { hasAllFiveKeys } from "../orchestration/groundingFilter.js";
import type {
  AppConfig,
  DocStatus,
  DocumentMetadata,
  Repository,
  ResourceCollision,
  S3DocumentAdapter,
  SourceDocument,
} from "@sage/shared";

/** Result of a lightweight AI endpoint reachability probe. */
export interface AiReachability {
  /** true when the endpoint responded (reachable); false when unreachable. */
  reachable: boolean;
  /** A clear, secret-free diagnostic (never contains the API key). */
  detail: string;
}

/**
 * Probe an AI endpoint's reachability. Injectable so unit tests never make a
 * real network call. Implementations MUST NOT throw and MUST NOT leak the API
 * key in their result.
 */
export type AiReachabilityProbe = (config: AppConfig) => Promise<AiReachability>;

/** Concrete collaborators the document/estimate/health routes depend on. */
export interface DocumentRouteDeps {
  config: AppConfig;
  repository: Repository;
  s3: S3DocumentAdapter;
  /**
   * Optional AI reachability probe. Defaults to a probe that performs a
   * lightweight HEAD/GET against the endpoint host and never throws.
   */
  aiReachabilityProbe?: AiReachabilityProbe;
}

const DOC_STATUSES: readonly DocStatus[] = ["Active", "Superseded", "Draft"] as const;

/** A non-empty string once trimmed. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validate + normalize an incoming metadata object. Returns the parsed
 * DocumentMetadata when all five keys are present and valid, otherwise a list
 * of the missing/invalid keys so the caller can reject with a clear message.
 */
function parseMetadata(raw: unknown): {
  metadata?: DocumentMetadata;
  missing: string[];
} {
  const source = (raw ?? {}) as Record<string, unknown>;
  const missing: string[] = [];

  const echelon = source.Echelon;
  const domain = source.Domain;
  const docType = source.Doc_Type;
  const status = source.Status;
  const topicTags = source.Topic_Tags;

  if (!isNonEmptyString(echelon)) missing.push("Echelon");
  if (!isNonEmptyString(domain)) missing.push("Domain");
  if (!isNonEmptyString(docType)) missing.push("Doc_Type");
  if (!isNonEmptyString(status) || !(DOC_STATUSES as readonly string[]).includes(status as string)) {
    missing.push("Status");
  }
  const tagsValid =
    Array.isArray(topicTags) && topicTags.length > 0 && topicTags.every(isNonEmptyString);
  if (!tagsValid) missing.push("Topic_Tags");

  if (missing.length > 0) {
    return { missing };
  }

  return {
    metadata: {
      Echelon: (echelon as string).trim(),
      Domain: (domain as string).trim(),
      Doc_Type: (docType as string).trim(),
      Status: status as DocStatus,
      Topic_Tags: (topicTags as string[]).map((t) => t.trim()),
    },
    missing: [],
  };
}

/** The shape returned for each document in `GET /documents`. */
interface DocumentListEntry {
  docId: string;
  s3Key: string;
  fileType: "docx" | "pdf";
  /** The five metadata keys, or null when the doc is not yet tagged. */
  metadata: DocumentMetadata | null;
  /** true when the doc is missing required metadata -> excluded from grounding. */
  untagged: boolean;
  /** true when the doc participates in grounding (fully tagged). */
  usableForGrounding: boolean;
  /** true when tagged Superseded/Draft -> usable but must be flagged (10.7). */
  flaggedStatus: boolean;
}

/**
 * Derive a stable docId for an S3 object key. Uses the file's base name without
 * its extension so citations reference a human-readable id. The tagged index
 * (keyed by docId) takes precedence when present.
 */
function deriveDocId(s3Key: string): string {
  const base = s3Key.split("/").pop() ?? s3Key;
  return base.replace(/\.(docx|pdf)$/i, "");
}

/**
 * Default AI reachability probe. Performs a best-effort GET against the
 * configured endpoint with a short timeout. Never throws; never includes the
 * API key in the returned detail. Not used in unit tests (a fake is injected).
 */
async function defaultAiReachabilityProbe(config: AppConfig): Promise<AiReachability> {
  const endpoint = (config.ai.endpoint ?? "").trim();
  if (endpoint === "") {
    return { reachable: false, detail: "AI endpoint is not configured." };
  }

  let host: string;
  try {
    host = new URL(endpoint).host || "configured endpoint";
  } catch {
    host = "configured endpoint";
  }

  const fetchImpl = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!fetchImpl) {
    return { reachable: false, detail: "No network client available to probe the AI endpoint." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    // A lightweight GET is enough to learn whether the host answers at all.
    // Any HTTP response (even 4xx) proves reachability; only a thrown network
    // error means unreachable. The API key is deliberately NOT sent here.
    await fetchImpl(endpoint, { method: "GET", signal: controller.signal });
    return { reachable: true, detail: `AI endpoint reachable at ${host}.` };
  } catch {
    return { reachable: false, detail: `AI endpoint unreachable at ${host}.` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect resource collisions across the estimate's revision history. The
 * revision model does not persist per-revision resource allocations, so absent
 * that data this returns an empty list. Kept as a seam so a richer estimate can
 * surface collisions here without changing the route contract.
 */
function detectPersistedCollisions(): ResourceCollision[] {
  return [];
}

/**
 * Build the document/estimate/health router with injected dependencies.
 */
export function createDocumentRouter(deps: DocumentRouteDeps): Router {
  const router = Router();
  const probe = deps.aiReachabilityProbe ?? defaultAiReachabilityProbe;

  // --- GET /documents ----------------------------------------------------
  router.get("/documents", async (_req: Request, res: Response) => {
    // Persisted tagged metadata is the source of truth for tags.
    const indexed: SourceDocument[] = await deps.repository.getDocIndex();
    const byKey = new Map<string, SourceDocument>();
    const byDocId = new Map<string, SourceDocument>();
    for (const doc of indexed) {
      byKey.set(doc.s3Key, doc);
      byDocId.set(doc.docId, doc);
    }

    // Live S3 listing over the configured prefix (Requirement 10.2). On an S3
    // failure we degrade gracefully to the persisted index (design "S3 /
    // Document Errors") so the library still renders.
    let s3Available = true;
    let s3Detail: string | undefined;
    let liveKeys: { key: string; fileType: "docx" | "pdf" }[] = [];
    try {
      const refs = await deps.s3.list(deps.config.s3.prefix);
      liveKeys = refs.map((r) => ({ key: r.key, fileType: r.fileType }));
    } catch (err) {
      s3Available = false;
      s3Detail = `Live S3 library unavailable: ${(err as Error).message}`;
    }

    const entries: DocumentListEntry[] = [];
    const seenKeys = new Set<string>();

    // Merge: every live object, tagged from the index when known.
    for (const ref of liveKeys) {
      seenKeys.add(ref.key);
      const tagged = byKey.get(ref.key);
      entries.push(toEntry(ref.key, ref.fileType, tagged));
    }

    // Include any persisted docs not present in the live listing (e.g. S3
    // unavailable, or the object was removed) so their tags are not lost.
    for (const doc of indexed) {
      if (!seenKeys.has(doc.s3Key)) {
        entries.push(toEntry(doc.s3Key, doc.fileType, doc));
      }
    }

    res.json({
      documents: entries,
      s3Available,
      ...(s3Detail ? { s3Detail } : {}),
    });
  });

  // --- POST /documents ---------------------------------------------------
  router.post("/documents", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const s3Key = typeof body.s3Key === "string" ? body.s3Key.trim() : "";
    if (s3Key === "") {
      res.status(400).json({ error: "s3Key is required.", field: "s3Key" });
      return;
    }

    const fileTypeRaw = body.fileType;
    const fileType =
      fileTypeRaw === "docx" || fileTypeRaw === "pdf" ? fileTypeRaw : deriveFileType(s3Key);
    if (!fileType) {
      res.status(400).json({
        error: "fileType is required and must be 'docx' or 'pdf'.",
        field: "fileType",
      });
      return;
    }

    // Requirement 10.3: registering a document REQUIRES all five metadata keys.
    // A doc lacking required metadata is rejected; it stays untagged and
    // excluded from grounding (Requirement 10.4).
    const { metadata, missing } = parseMetadata(body.metadata);
    if (!metadata) {
      res.status(400).json({
        error: `Document metadata is incomplete; missing or invalid keys: ${missing.join(", ")}. All five keys (Echelon, Domain, Doc_Type, Status, Topic_Tags) are required before a document can ground output.`,
        missing,
        field: "metadata",
      });
      return;
    }

    const docId =
      typeof body.docId === "string" && body.docId.trim() !== ""
        ? body.docId.trim()
        : deriveDocId(s3Key);

    const doc: SourceDocument = { docId, s3Key, fileType, metadata };

    // Persist: merge into the index, replacing any existing entry with the
    // same docId or s3Key.
    const existing = await deps.repository.getDocIndex();
    const merged = existing.filter((d) => d.docId !== docId && d.s3Key !== s3Key);
    merged.push(doc);
    await deps.repository.saveDocIndex(merged);

    // Sanity: a fully-tagged doc must be usable for grounding.
    const usableForGrounding = hasAllFiveKeys(doc);
    const flaggedStatus = metadata.Status === "Superseded" || metadata.Status === "Draft";

    res.status(201).json({
      document: doc,
      usableForGrounding,
      flaggedStatus,
    });
  });

  // --- GET /estimate -----------------------------------------------------
  router.get("/estimate", async (_req: Request, res: Response) => {
    const estimate = await deps.repository.getEstimate();
    const collisions = detectPersistedCollisions();
    res.json({
      estimate,
      revisions: estimate.revisions,
      collisions,
    });
  });

  // --- GET /config/health ------------------------------------------------
  router.get("/config/health", async (_req: Request, res: Response) => {
    const aiConfigured = isAiConfigured(deps.config);

    // Preserve the existing base contract (status/service/aiConfigured) and
    // extend additively with AI reachability (Requirement 14.3). The probe
    // never throws and never leaks the API key.
    let ai: { configured: boolean; reachable?: boolean; detail: string };
    if (!aiConfigured) {
      ai = {
        configured: false,
        detail: "AI endpoint/model not configured; set them before generating output.",
      };
    } else {
      const reachability = await probe(deps.config);
      ai = {
        configured: true,
        reachable: reachability.reachable,
        detail: reachability.detail,
      };
    }

    res.json({
      status: "ok",
      service: "sage-briefing-app",
      aiConfigured,
      ai,
    });
  });

  return router;
}

/** Map a supported key extension to a fileType discriminant. */
function deriveFileType(key: string): "docx" | "pdf" | undefined {
  const lower = key.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf")) return "pdf";
  return undefined;
}

/**
 * Build a list entry for a document, using the persisted (tagged) record when
 * available. Untagged / incompletely-tagged docs are flagged and excluded from
 * grounding.
 */
function toEntry(
  s3Key: string,
  fileType: "docx" | "pdf",
  tagged: SourceDocument | undefined,
): DocumentListEntry {
  if (tagged && hasAllFiveKeys(tagged)) {
    const status = tagged.metadata?.Status;
    return {
      docId: tagged.docId,
      s3Key,
      fileType: tagged.fileType,
      metadata: tagged.metadata ?? null,
      untagged: false,
      usableForGrounding: true,
      flaggedStatus: status === "Superseded" || status === "Draft",
    };
  }

  // Untagged or incompletely tagged: excluded from grounding until tagged.
  return {
    docId: tagged?.docId ?? deriveDocId(s3Key),
    s3Key,
    fileType,
    metadata: tagged?.metadata ?? null,
    untagged: true,
    usableForGrounding: false,
    flaggedStatus: false,
  };
}
