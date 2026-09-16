import type { AiClient, AiResult, AppConfig, AssembledPrompt } from "@sage/shared";

/**
 * AiClientImpl — OpenAI-compatible chat/completions adapter (Rule 14).
 *
 * Requirements:
 *  - 14.1: WHEN the app starts THEN it SHALL read the AI endpoint, model, and
 *          credentials from configuration (not hardcoded).
 *  - 14.2: WHEN the endpoint is OpenAI-compatible THEN the app SHALL function
 *          without code changes to switch providers.
 *  - 14.3: IF the AI endpoint is unreachable THEN the system SHALL surface a
 *          clear error and preserve the user's inputs.
 *  - 15.2: WHEN an output step fails or truncates THEN the system SHALL allow
 *          regenerating that step without redoing the others (signalled here
 *          via AiResult.truncated / ok:false so orchestration can retry a step
 *          in isolation).
 *
 * Design contract (see design.md "AI Provider Errors"):
 *  - This adapter NEVER throws into the orchestration layer. Every failure
 *    path — network/unreachable, auth (401/403), other non-2xx, malformed
 *    body — is caught and returned as `AiResult { ok: false, errorMessage,
 *    truncated: false }`.
 *  - Error messages NEVER contain the configured API key or any Authorization
 *    header material.
 *  - On success it extracts the assistant message text and sets
 *    `truncated: true` when the provider signals a length cutoff
 *    (`finish_reason === "length"`).
 *
 * The AI configuration (endpoint/model/apiKey) is injected via the constructor
 * so the adapter is testable with a stubbed `fetch`.
 */

/** Minimal shape of the OpenAI-compatible chat/completions response we read. */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
}

/** The `fetch` surface this adapter depends on (Node 18+ global by default). */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface AiClientOptions {
  /** Injectable fetch (defaults to the runtime global fetch). */
  fetchImpl?: FetchLike;
  /** Optional request timeout in milliseconds. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class AiClientImpl implements AiClient {
  private readonly config: AppConfig["ai"];
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(config: AppConfig["ai"], options: AiClientOptions = {}) {
    this.config = config;
    // Fall back to the runtime global fetch (Node 18+). Captured at
    // construction so callers can inject a stub for testing.
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const resolved = options.fetchImpl ?? globalFetch;
    if (!resolved) {
      throw new Error(
        "No fetch implementation available; provide options.fetchImpl or run on Node 18+.",
      );
    }
    this.fetchImpl = resolved;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async complete(prompt: AssembledPrompt): Promise<AiResult> {
    const endpoint = (this.config.endpoint ?? "").trim();
    const model = (this.config.model ?? "").trim();

    // Configuration guard (Requirement 14.1): without an endpoint/model we
    // cannot call the provider. Return a clear, non-sensitive error.
    if (!endpoint) {
      return fail("AI endpoint is not configured.");
    }
    if (!model) {
      return fail("AI model is not configured.");
    }

    const requestBody = JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    // Authenticate via Bearer token when an API key is configured. The key is
    // only ever placed in the header — never in a log or error message.
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // Per-request timeout so an unreachable endpoint fails cleanly rather than
    // hanging the single-user app.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: requestBody,
        signal: controller.signal,
      });
    } catch (err) {
      // Network / unreachable / timeout. Never leak the key; `err` cannot
      // contain it because we never put the key anywhere but the header value.
      return fail(`AI endpoint unreachable at ${safeHost(endpoint)}.`);
    } finally {
      clearTimeout(timer);
    }

    // Auth failures get a distinct, secret-free message (design.md).
    if (response.status === 401 || response.status === 403) {
      return fail("AI endpoint rejected credentials.");
    }

    if (!response.ok) {
      return fail(
        `AI endpoint returned an error (HTTP ${response.status} ${response.statusText}).`,
      );
    }

    let parsed: ChatCompletionResponse;
    try {
      parsed = (await response.json()) as ChatCompletionResponse;
    } catch {
      return fail("AI endpoint returned a response that could not be parsed.");
    }

    const choice = parsed.choices?.[0];
    const text = choice?.message?.content ?? undefined;
    if (typeof text !== "string" || text.length === 0) {
      return fail("AI endpoint returned no completion text.");
    }

    const truncated = choice?.finish_reason === "length";
    return { ok: true, text, truncated };
  }
}

/** Build a failed AiResult. Kept tiny so every failure path is consistent. */
function fail(errorMessage: string): AiResult {
  return { ok: false, errorMessage, truncated: false };
}

/**
 * Extract a host (or a safe fragment) from the endpoint for diagnostics.
 * Falls back to a generic label if the endpoint is not a parseable URL, so we
 * never echo anything unexpected.
 */
function safeHost(endpoint: string): string {
  try {
    return new URL(endpoint).host || "configured endpoint";
  } catch {
    return "configured endpoint";
  }
}
