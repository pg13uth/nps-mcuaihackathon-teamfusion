import { describe, it, expect } from "vitest";
import type { AppConfig, AssembledPrompt } from "@sage/shared";
import { AiClientImpl, type FetchLike } from "./aiClient.js";

/**
 * Minimal unit tests for the AiClient adapter (Rule 14 / Requirements 14.3, 15.2).
 *
 * These use a stubbed fetch (no real network) to cover:
 *  - a successful chat/completions call (text extracted; truncated derived from
 *    finish_reason), and
 *  - one failure path (HTTP 401 auth failure),
 * asserting in both cases that the configured API key never leaks into the
 * returned errorMessage or is otherwise surfaced by the adapter.
 */

const SECRET_KEY = "sk-super-secret-key-DO-NOT-LEAK-12345";

const aiConfig: AppConfig["ai"] = {
  endpoint: "https://ai.example.mil/v1/chat/completions",
  model: "sage-model",
  apiKey: SECRET_KEY,
};

const prompt: AssembledPrompt = {
  step: "brief",
  system: "You are SAGE.",
  user: "Produce the executive brief.",
};

/** Build a stub fetch returning a fixed response and capturing the last init. */
function stubFetch(response: {
  ok: boolean;
  status: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}): { fetchImpl: FetchLike; calls: Array<{ url: string; init: unknown }> } {
  const calls: Array<{ url: string; init: unknown }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText ?? "",
      json: response.json ?? (async () => ({})),
      text: async () => "",
    };
  };
  return { fetchImpl, calls };
}

describe("AiClientImpl — success", () => {
  it("returns ok with extracted text and truncated=false on a normal completion", async () => {
    const { fetchImpl, calls } = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: "assistant", content: "BLUF: ..." }, finish_reason: "stop" }],
      }),
    });
    const client = new AiClientImpl(aiConfig, { fetchImpl });

    const result = await client.complete(prompt);

    expect(result.ok).toBe(true);
    expect(result.text).toBe("BLUF: ...");
    expect(result.truncated).toBe(false);

    // Key is sent only in the Authorization header, never elsewhere.
    const init = calls[0]!.init as { headers?: Record<string, string> };
    expect(init.headers?.["Authorization"]).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("sets truncated=true when finish_reason is 'length'", async () => {
    const { fetchImpl } = stubFetch({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "partial..." }, finish_reason: "length" }],
      }),
    });
    const client = new AiClientImpl(aiConfig, { fetchImpl });

    const result = await client.complete(prompt);

    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
  });
});

describe("AiClientImpl — failure paths never leak the API key", () => {
  it("returns ok:false with a secret-free message on auth failure (401)", async () => {
    const { fetchImpl } = stubFetch({ ok: false, status: 401, statusText: "Unauthorized" });
    const client = new AiClientImpl(aiConfig, { fetchImpl });

    const result = await client.complete(prompt);

    expect(result.ok).toBe(false);
    expect(result.truncated).toBe(false);
    expect(result.errorMessage).toBeTruthy();
    expect(result.errorMessage).not.toContain(SECRET_KEY);
  });

  it("never throws and never echoes the key when the endpoint is unreachable", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error(`connect ECONNREFUSED ${aiConfig.endpoint}`);
    };
    const client = new AiClientImpl(aiConfig, { fetchImpl });

    const result = await client.complete(prompt);

    expect(result.ok).toBe(false);
    expect(result.errorMessage).not.toContain(SECRET_KEY);
  });
});
