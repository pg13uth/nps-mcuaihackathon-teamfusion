/**
 * Configuration loader (Requirements 14.1, 14.2).
 *
 * Builds an {@link AppConfig} from environment variables, optionally overlaid
 * by a local JSON config file when present. The AI section is provider-agnostic
 * (endpoint/model/credentials come from config, never hardcoded) so the same
 * binary runs against GenAI.mil (prod) or a commercial API (dev) with no code
 * changes.
 *
 * S3 credentials are deliberately NOT read from configuration: the AWS SDK
 * resolves them from the ambient credential chain (environment, shared
 * credentials file, or IAM role). This loader only reads the S3 bucket/region/
 * prefix — never raw access keys.
 */

import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "@sage/shared";

/** Environment variable names read by the loader. */
export const ENV_KEYS = {
  aiEndpoint: "SAGE_AI_ENDPOINT",
  aiModel: "SAGE_AI_MODEL",
  aiApiKey: "SAGE_AI_API_KEY",
  s3Bucket: "SAGE_S3_BUCKET",
  s3Region: "SAGE_S3_REGION",
  s3Prefix: "SAGE_S3_PREFIX",
  dataDir: "SAGE_DATA_DIR",
  /** Optional path to a local JSON config file to overlay onto env. */
  configFile: "SAGE_CONFIG_FILE",
} as const;

/**
 * Sensible defaults drawn from the requirements where safe to hardcode.
 * The S3 bucket and region are fixed by the deployment; the data directory
 * defaults to a local folder under the app. AI values default to empty so
 * that {@link isAiConfigured} can detect an incomplete/absent AI config.
 */
export const CONFIG_DEFAULTS = {
  s3Bucket: "20260916-5103-mcuhackathon-team-fusion",
  s3Region: "us-east-1",
  s3Prefix: "",
  dataDir: "./.sage-data",
} as const;

/**
 * The shape of an optional local JSON config file. Every field is optional so
 * a partial file can overlay only the values it wishes to override. AWS S3
 * access keys are intentionally absent from this shape and are never read from
 * the file — credentials come from the ambient AWS chain only.
 */
export interface FileConfig {
  ai?: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
  };
  s3?: {
    bucket?: string;
    region?: string;
    prefix?: string;
  };
  persistence?: {
    dataDir?: string;
  };
}

/** Trim a value and treat an empty/whitespace string as "not provided". */
function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Pick the first defined, non-blank value from the provided candidates. */
function firstDefined(
  ...candidates: (string | undefined)[]
): string | undefined {
  for (const candidate of candidates) {
    const c = clean(candidate);
    if (c !== undefined) return c;
  }
  return undefined;
}

/**
 * Read and parse an optional local JSON config file.
 *
 * Returns an empty object when the file does not exist so its absence is not an
 * error. If the file exists but cannot be parsed, throws a clear error so the
 * operator can fix it rather than silently running with unexpected config.
 */
export function readConfigFile(filePath: string): FileConfig {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(
      `Failed to read config file at ${filePath}: ${(err as Error).message}`,
    );
  }
  try {
    const parsed = JSON.parse(raw) as FileConfig;
    return parsed ?? {};
  } catch (err) {
    throw new Error(
      `Config file at ${filePath} is not valid JSON: ${(err as Error).message}`,
    );
  }
}

/** Options for {@link loadConfig}. */
export interface LoadConfigOptions {
  /** Environment source (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /**
   * Explicit path to a local JSON config file. When omitted, the loader looks
   * at the SAGE_CONFIG_FILE env var, then a `sage.config.json` next to cwd.
   */
  configFilePath?: string;
  /** Base directory used to resolve a default config file path. */
  cwd?: string;
}

/** Default local config file name looked up under cwd when none is specified. */
export const DEFAULT_CONFIG_FILENAME = "sage.config.json";

/**
 * Build an {@link AppConfig} from environment variables overlaid by an optional
 * local JSON config file.
 *
 * Precedence (highest wins): environment variables > config file > defaults.
 * Environment is treated as the authoritative source for a running deployment;
 * the file provides a convenient local override; defaults backstop anything
 * left unspecified.
 *
 * Never reads AWS S3 access keys from any source — S3 auth is ambient only.
 */
export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();

  const configFilePath =
    options.configFilePath ??
    clean(env[ENV_KEYS.configFile]) ??
    path.join(cwd, DEFAULT_CONFIG_FILENAME);

  const file = readConfigFile(configFilePath);

  return {
    ai: {
      endpoint:
        firstDefined(env[ENV_KEYS.aiEndpoint], file.ai?.endpoint) ?? "",
      model: firstDefined(env[ENV_KEYS.aiModel], file.ai?.model) ?? "",
      apiKey: firstDefined(env[ENV_KEYS.aiApiKey], file.ai?.apiKey),
    },
    s3: {
      bucket:
        firstDefined(env[ENV_KEYS.s3Bucket], file.s3?.bucket) ??
        CONFIG_DEFAULTS.s3Bucket,
      region:
        firstDefined(env[ENV_KEYS.s3Region], file.s3?.region) ??
        CONFIG_DEFAULTS.s3Region,
      prefix:
        firstDefined(env[ENV_KEYS.s3Prefix], file.s3?.prefix) ??
        CONFIG_DEFAULTS.s3Prefix,
      // NOTE: no credentials here — resolved from the ambient AWS chain only.
    },
    persistence: {
      dataDir:
        firstDefined(env[ENV_KEYS.dataDir], file.persistence?.dataDir) ??
        CONFIG_DEFAULTS.dataDir,
    },
  };
}

/**
 * Detect whether the AI section is sufficiently configured to attempt
 * generation. Returns false when either the endpoint or the model is missing
 * or blank, so callers (routes) can surface a clear guard error instead of
 * calling an unconfigured provider (Requirement 14.1).
 *
 * The apiKey is intentionally NOT required: some endpoints (e.g. a local or
 * IAM-fronted provider) need only endpoint + model.
 */
export function isAiConfigured(config: AppConfig): boolean {
  return clean(config.ai.endpoint) !== undefined &&
    clean(config.ai.model) !== undefined;
}

/**
 * Backwards-compatible alias for the original server bootstrap stub. Reads
 * purely from environment variables (plus any default config file discovered
 * under cwd via {@link loadConfig}).
 */
export function loadConfigFromEnv(): AppConfig {
  return loadConfig();
}
