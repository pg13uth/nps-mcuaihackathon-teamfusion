import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CONFIG_DEFAULTS,
  isAiConfigured,
  loadConfig,
  readConfigFile,
} from "./config.js";

/**
 * Unit tests for the configuration loader (Requirements 14.1, 14.2).
 *
 * Coverage:
 *  - loads AI + S3 + persistence values from environment variables
 *  - applies safe defaults for S3 bucket/region and data dir
 *  - isAiConfigured is false when endpoint or model is missing/blank
 *  - S3 access keys are NEVER sourced from config (env or file)
 *  - a local JSON config file overlays env, with env taking precedence
 */

const tempFiles: string[] = [];

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }
});

function writeTempConfig(contents: unknown): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "sage-cfg-")),
    "sage.config.json",
  );
  fs.writeFileSync(file, JSON.stringify(contents), "utf8");
  tempFiles.push(file);
  return file;
}

/** An env with no config file present, isolated from the real environment. */
function envOnly(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("loadConfig — environment variables", () => {
  it("loads AI, S3, and persistence values from env", () => {
    const config = loadConfig({
      env: envOnly({
        SAGE_AI_ENDPOINT: "https://genai.mil/v1",
        SAGE_AI_MODEL: "gpt-4o",
        SAGE_AI_API_KEY: "secret-key",
        SAGE_S3_BUCKET: "custom-bucket",
        SAGE_S3_REGION: "us-gov-west-1",
        SAGE_S3_PREFIX: "Agents/",
        SAGE_DATA_DIR: "/var/sage/data",
      }),
      // point config file discovery at a non-existent path
      configFilePath: path.join(os.tmpdir(), "does-not-exist-sage.json"),
    });

    expect(config.ai).toEqual({
      endpoint: "https://genai.mil/v1",
      model: "gpt-4o",
      apiKey: "secret-key",
    });
    expect(config.s3).toEqual({
      bucket: "custom-bucket",
      region: "us-gov-west-1",
      prefix: "Agents/",
    });
    expect(config.persistence.dataDir).toBe("/var/sage/data");
  });

  it("applies safe defaults for S3 bucket/region/prefix and data dir", () => {
    const config = loadConfig({
      env: envOnly({}),
      configFilePath: path.join(os.tmpdir(), "does-not-exist-sage.json"),
    });

    expect(config.s3.bucket).toBe(CONFIG_DEFAULTS.s3Bucket);
    expect(config.s3.bucket).toBe("20260916-5103-mcuhackathon-team-fusion");
    expect(config.s3.region).toBe("us-east-1");
    expect(config.s3.prefix).toBe("");
    expect(config.persistence.dataDir).toBe(CONFIG_DEFAULTS.dataDir);
    // AI defaults to empty so it can be detected as unconfigured.
    expect(config.ai.endpoint).toBe("");
    expect(config.ai.model).toBe("");
    expect(config.ai.apiKey).toBeUndefined();
  });
});

describe("isAiConfigured", () => {
  const base = {
    s3: { bucket: "b", region: "r", prefix: "" },
    persistence: { dataDir: "." },
  };

  it("is true when endpoint and model are present", () => {
    expect(
      isAiConfigured({
        ...base,
        ai: { endpoint: "https://x", model: "m" },
      }),
    ).toBe(true);
  });

  it("is false when endpoint is missing", () => {
    expect(
      isAiConfigured({ ...base, ai: { endpoint: "", model: "m" } }),
    ).toBe(false);
  });

  it("is false when model is missing", () => {
    expect(
      isAiConfigured({ ...base, ai: { endpoint: "https://x", model: "" } }),
    ).toBe(false);
  });

  it("is false when endpoint/model are only whitespace", () => {
    expect(
      isAiConfigured({ ...base, ai: { endpoint: "   ", model: "  " } }),
    ).toBe(false);
  });

  it("does not require an apiKey to be considered configured", () => {
    expect(
      isAiConfigured({
        ...base,
        ai: { endpoint: "https://x", model: "m" },
      }),
    ).toBe(true);
  });
});

describe("S3 credentials are never sourced from config", () => {
  it("ignores S3 access keys present in env (only bucket/region/prefix read)", () => {
    const config = loadConfig({
      env: envOnly({
        SAGE_S3_BUCKET: "b",
        SAGE_S3_REGION: "us-east-1",
        // Pretend an operator wrongly set these — the loader must not surface them.
        AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
        AWS_SECRET_ACCESS_KEY: "shhh",
        SAGE_S3_ACCESS_KEY: "shouldNotBeRead",
        SAGE_S3_SECRET_KEY: "shouldNotBeRead",
      }),
      configFilePath: path.join(os.tmpdir(), "does-not-exist-sage.json"),
    });

    const s3Json = JSON.stringify(config.s3);
    expect(s3Json).not.toContain("AKIAEXAMPLE");
    expect(s3Json).not.toContain("shhh");
    expect(s3Json).not.toContain("shouldNotBeRead");
    // Only the three expected keys exist on the s3 config.
    expect(Object.keys(config.s3).sort()).toEqual(["bucket", "prefix", "region"]);
  });

  it("ignores S3 access keys present in the local config file", () => {
    const file = writeTempConfig({
      s3: {
        bucket: "file-bucket",
        // These extraneous credential-like keys must be ignored.
        accessKeyId: "AKIAFROMFILE",
        secretAccessKey: "fileSecret",
      },
    });

    const config = loadConfig({ env: envOnly({}), configFilePath: file });

    expect(config.s3.bucket).toBe("file-bucket");
    expect(Object.keys(config.s3).sort()).toEqual(["bucket", "prefix", "region"]);
    const s3Json = JSON.stringify(config.s3);
    expect(s3Json).not.toContain("AKIAFROMFILE");
    expect(s3Json).not.toContain("fileSecret");
  });
});

describe("local JSON config file overlay", () => {
  it("reads values from the config file when env is absent", () => {
    const file = writeTempConfig({
      ai: { endpoint: "https://file-endpoint", model: "file-model" },
      s3: { region: "eu-west-1", prefix: "Docs/" },
      persistence: { dataDir: "/file/data" },
    });

    const config = loadConfig({ env: envOnly({}), configFilePath: file });

    expect(config.ai.endpoint).toBe("https://file-endpoint");
    expect(config.ai.model).toBe("file-model");
    expect(config.s3.region).toBe("eu-west-1");
    expect(config.s3.prefix).toBe("Docs/");
    expect(config.persistence.dataDir).toBe("/file/data");
  });

  it("env takes precedence over the config file", () => {
    const file = writeTempConfig({
      ai: { endpoint: "https://file-endpoint", model: "file-model" },
    });

    const config = loadConfig({
      env: envOnly({ SAGE_AI_ENDPOINT: "https://env-endpoint" }),
      configFilePath: file,
    });

    expect(config.ai.endpoint).toBe("https://env-endpoint");
    // model falls back to the file since env did not set it
    expect(config.ai.model).toBe("file-model");
  });

  it("returns an empty overlay when the file does not exist", () => {
    expect(readConfigFile(path.join(os.tmpdir(), "nope-sage.json"))).toEqual({});
  });

  it("throws a clear error when the config file is invalid JSON", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sage-bad-"));
    const file = path.join(dir, "sage.config.json");
    fs.writeFileSync(file, "{ not valid json ", "utf8");
    tempFiles.push(file);

    expect(() => loadConfig({ env: envOnly({}), configFilePath: file })).toThrow(
      /not valid JSON/,
    );
  });
});
