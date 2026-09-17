/**
 * Typed API client for the SAGE backend (Task 13.1 foundation).
 *
 * All calls target the backend under the `/api` prefix, which the Vite dev
 * server proxies to the Express server (see vite.config.ts). Payloads and
 * responses reuse the shared domain types from `@sage/shared` so the client
 * and server never drift.
 *
 * Sibling frontend tasks (13.2 RoutingBlockView + StagedOutputWorkspace, 13.3
 * SynthesisGate/CCIR/RunningEstimate/DocumentLibrary/AiConfigHealth) build on
 * the functions exported here without re-wiring transport concerns.
 */

import type {
  Assumption,
  CcirAlert,
  Constraints,
  CoreProcess,
  DocStatus,
  DocumentMetadata,
  OperationalMode,
  OutputArtifact,
  OutputStep,
  ResourceCollision,
  RoutingBlock,
  RunningEstimate,
  RunningEstimateRevision,
  Task,
  Tier,
} from "@sage/shared";

/** Base path for all backend calls. Proxied to the Express server in dev. */
export const API_BASE = "/api";

/** A structured error carrying the backend's status code and message. */
export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;
  readonly body?: unknown;

  constructor(message: string, status: number, field?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
    this.body = body;
  }
}

/** Extract a human-readable error message from a failed response body. */
function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string") return err;
  }
  return fallback;
}

/** Shared fetch wrapper: JSON in, JSON out, typed errors. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (cause) {
    // Network-level failure (server down, proxy unreachable, offline).
    throw new ApiError(
      `Network request to ${path} failed. Is the backend running?`,
      0,
      undefined,
      cause,
    );
  }

  const text = await response.text();
  const body: unknown = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const field =
      body && typeof body === "object" && "field" in body
        ? (body as { field?: string }).field
        : undefined;
    throw new ApiError(
      messageFrom(body, `Request to ${path} failed with ${response.status}.`),
      response.status,
      field,
      body,
    );
  }

  return body as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// --- POST /tasks -----------------------------------------------------------

/** Request body for creating a task. Mode is optional (backend recommends). */
export interface CreateTaskRequest {
  requirementText: string;
  process: CoreProcess;
  tier: Tier;
  /** Omit to let the backend recommend a mode (Requirement 2.2). */
  mode?: OperationalMode;
  constraints?: Constraints;
}

/** Response from `POST /tasks`. */
export interface CreateTaskResponse {
  task: Task;
  routingPreview: RoutingBlock;
  resolvedAssumptions: Assumption[];
}

/**
 * Create a task: intake + constraint resolution + (optional) mode
 * recommendation + SME selection + routing preview. Leaving `mode` unset asks
 * the backend to recommend one.
 */
export function createTask(payload: CreateTaskRequest): Promise<CreateTaskResponse> {
  return request<CreateTaskResponse>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- POST /tasks/:id/generate/:step ---------------------------------------

/** Response from `POST /tasks/:id/generate/:step`. */
export interface GenerateStepResponse {
  artifact: OutputArtifact;
  ccirAlerts: CcirAlert[];
  collisions: ResourceCollision[];
  estimate: RunningEstimate;
}

/** Generate (or regenerate) a single output step for a task. */
export function generateStep(
  taskId: string,
  step: OutputStep,
): Promise<GenerateStepResponse> {
  return request<GenerateStepResponse>(
    `/tasks/${encodeURIComponent(taskId)}/generate/${encodeURIComponent(step)}`,
    { method: "POST" },
  );
}

// --- GET/POST /documents ---------------------------------------------------

/** One document as returned by `GET /documents`. */
export interface DocumentListEntry {
  docId: string;
  s3Key: string;
  fileType: "docx" | "pdf";
  metadata: DocumentMetadata | null;
  untagged: boolean;
  usableForGrounding: boolean;
  flaggedStatus: boolean;
}

/** Response from `GET /documents`. */
export interface ListDocumentsResponse {
  documents: DocumentListEntry[];
  s3Available: boolean;
  s3Detail?: string;
}

/** List the document library (live S3 merged with the tagged index). */
export function listDocuments(): Promise<ListDocumentsResponse> {
  return request<ListDocumentsResponse>("/documents", { method: "GET" });
}

/** Request body for tagging/registering a document. */
export interface TagDocumentRequest {
  s3Key: string;
  fileType?: "docx" | "pdf";
  docId?: string;
  metadata: {
    Echelon: string;
    Domain: string;
    Doc_Type: string;
    Status: DocStatus;
    Topic_Tags: string[];
  };
}

/** Response from `POST /documents`. */
export interface TagDocumentResponse {
  document: {
    docId: string;
    s3Key: string;
    fileType: "docx" | "pdf";
    metadata: DocumentMetadata;
  };
  usableForGrounding: boolean;
  flaggedStatus: boolean;
}

/** Tag/register a document with the five required metadata keys. */
export function tagDocument(payload: TagDocumentRequest): Promise<TagDocumentResponse> {
  return request<TagDocumentResponse>("/documents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- GET /estimate ---------------------------------------------------------

/** Response from `GET /estimate`. */
export interface EstimateResponse {
  estimate: RunningEstimate;
  revisions: RunningEstimateRevision[];
  collisions: ResourceCollision[];
}

/** Fetch the running estimate with revision history and any collisions. */
export function getEstimate(): Promise<EstimateResponse> {
  return request<EstimateResponse>("/estimate", { method: "GET" });
}

// --- GET /config/health ----------------------------------------------------

/** Response from `GET /config/health`. */
export interface HealthResponse {
  status: string;
  service: string;
  aiConfigured: boolean;
  ai: {
    configured: boolean;
    reachable?: boolean;
    detail: string;
  };
}

/** Fetch service + AI endpoint health. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/config/health", { method: "GET" });
}
