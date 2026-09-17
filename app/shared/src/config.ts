/**
 * Application configuration interface (design.md "Configuration Interface").
 * Provider-agnostic AI config; S3 credentials come from the ambient AWS chain,
 * never from this file.
 */
export interface AppConfig {
  ai: {
    /** e.g. GenAI.mil URL (prod) or commercial API (dev) */
    endpoint: string;
    model: string;
    /** from env/secret store, never hardcoded */
    apiKey?: string;
  };
  s3: {
    /** "20260916-5103-mcuhackathon-team-fusion" */
    bucket: string;
    /** "us-east-1" (commercial partition) */
    region: string;
    /** e.g. "Agents/" */
    prefix: string;
    // credentials come from the ambient AWS chain, NOT this file
  };
  persistence: {
    dataDir: string;
  };
}
