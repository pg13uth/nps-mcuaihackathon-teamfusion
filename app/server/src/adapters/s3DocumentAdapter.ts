/**
 * S3DocumentAdapter — side-effecting adapter for the S3 document library (Rule 10).
 *
 * Responsibilities:
 *  - Authenticate using the *ambient* AWS credential chain only. Credentials are
 *    never hardcoded and are never read from AppConfig — the AWS SDK resolves
 *    them from the environment, shared credentials file, or IAM role
 *    (Requirement 10.1). Only the bucket, region, and prefix come from config.
 *  - `list(prefix)`: enumerate objects under the configured bucket/prefix using
 *    `ListObjectsV2` (paginated) and return `S3ObjectRef[]` filtered to `.docx`
 *    and `.pdf` objects (Requirement 10.2).
 *  - `get(key)`: fetch a single object with `GetObject` and return its bytes as
 *    a Node `Buffer`.
 *
 * Config is injected via the constructor (design "Configuration Interface").
 */

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type ListObjectsV2CommandInput,
} from "@aws-sdk/client-s3";
import type { AppConfig, S3DocumentAdapter, S3ObjectRef } from "@sage/shared";

/** Just the S3 slice of AppConfig that this adapter needs. */
export type S3AdapterConfig = AppConfig["s3"];

/** Map a supported file extension to the adapter's `fileType` discriminant. */
function fileTypeForKey(key: string): "docx" | "pdf" | undefined {
  const lower = key.toLowerCase();
  if (lower.endsWith(".docx")) {
    return "docx";
  }
  if (lower.endsWith(".pdf")) {
    return "pdf";
  }
  return undefined;
}

export class S3DocumentAdapterImpl implements S3DocumentAdapter {
  private readonly config: S3AdapterConfig;
  private readonly client: S3Client;

  /**
   * @param config S3 bucket/region/prefix from AppConfig. Credentials are NOT
   *   accepted here — they are resolved from the ambient AWS chain.
   * @param client optional pre-built S3 client (used by tests to inject a mock).
   *   When omitted, a client is constructed with only the region set so the SDK
   *   falls back to the default credential provider chain.
   */
  constructor(config: S3AdapterConfig, client?: S3Client) {
    this.config = config;
    // No `credentials` field: the default provider chain is used.
    this.client = client ?? new S3Client({ region: config.region });
  }

  /**
   * List docx/pdf objects under `prefix` within the configured bucket. Handles
   * pagination via the `ContinuationToken`. Non-docx/pdf keys and "directory"
   * placeholder keys (ending in `/`) are filtered out.
   */
  async list(prefix: string): Promise<S3ObjectRef[]> {
    const refs: S3ObjectRef[] = [];
    let continuationToken: string | undefined;

    do {
      const input: ListObjectsV2CommandInput = {
        Bucket: this.config.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      };
      const response = await this.client.send(new ListObjectsV2Command(input));

      for (const object of response.Contents ?? []) {
        const key = object.Key;
        if (!key || key.endsWith("/")) {
          continue;
        }
        const fileType = fileTypeForKey(key);
        if (!fileType) {
          continue;
        }
        refs.push({
          key,
          fileType,
          size: object.Size,
          lastModified: object.LastModified?.toISOString(),
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return refs;
  }

  /** Fetch a single object and return its full contents as a Buffer. */
  async get(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    const body = response.Body;
    if (!body) {
      throw new Error(`S3 object has no body: ${key}`);
    }
    // AWS SDK v3 stream bodies expose transformToByteArray() in Node.
    const bytes = await (
      body as unknown as { transformToByteArray(): Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }
}
