import { describe, it, expect } from "vitest";
import { ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import type { AppConfig } from "@sage/shared";
import { S3DocumentAdapterImpl } from "./s3DocumentAdapter.js";

/**
 * Minimal unit tests for S3DocumentAdapter (task 10.3).
 * The S3 client is mocked — NO real network/S3 calls are made.
 */

const s3Config: AppConfig["s3"] = {
  bucket: "test-bucket",
  region: "us-east-1",
  prefix: "Agents/",
};

/** Build a fake S3Client whose `send` dispatches on the command type. */
function fakeClient(send: (command: unknown) => Promise<unknown>) {
  return { send } as unknown as ConstructorParameters<typeof S3DocumentAdapterImpl>[1];
}

describe("S3DocumentAdapter.list — docx/pdf filtering (R10.2)", () => {
  it("returns only .docx and .pdf objects, dropping other keys and folder markers", async () => {
    const client = fakeClient(async (command) => {
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      return {
        Contents: [
          { Key: "Agents/brief.docx", Size: 10, LastModified: new Date("2024-01-01T00:00:00Z") },
          { Key: "Agents/report.pdf", Size: 20 },
          { Key: "Agents/notes.txt" },
          { Key: "Agents/image.png" },
          { Key: "Agents/subfolder/" },
        ],
        IsTruncated: false,
      };
    });
    const adapter = new S3DocumentAdapterImpl(s3Config, client);

    const refs = await adapter.list("Agents/");

    expect(refs).toEqual([
      {
        key: "Agents/brief.docx",
        fileType: "docx",
        size: 10,
        lastModified: "2024-01-01T00:00:00.000Z",
      },
      { key: "Agents/report.pdf", fileType: "pdf", size: 20, lastModified: undefined },
    ]);
  });

  it("follows pagination via ContinuationToken", async () => {
    let call = 0;
    const client = fakeClient(async () => {
      call += 1;
      if (call === 1) {
        return {
          Contents: [{ Key: "Agents/one.pdf" }],
          IsTruncated: true,
          NextContinuationToken: "token-2",
        };
      }
      return { Contents: [{ Key: "Agents/two.docx" }], IsTruncated: false };
    });
    const adapter = new S3DocumentAdapterImpl(s3Config, client);

    const refs = await adapter.list("Agents/");

    expect(call).toBe(2);
    expect(refs.map((r) => r.key)).toEqual(["Agents/one.pdf", "Agents/two.docx"]);
  });

  it("returns an empty list when the bucket/prefix has no contents", async () => {
    const client = fakeClient(async () => ({ IsTruncated: false }));
    const adapter = new S3DocumentAdapterImpl(s3Config, client);
    expect(await adapter.list("Agents/")).toEqual([]);
  });
});

describe("S3DocumentAdapter.get — object bytes", () => {
  it("returns the object body as a Buffer", async () => {
    const payload = new TextEncoder().encode("hello world");
    const client = fakeClient(async (command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      return {
        Body: {
          transformToByteArray: async () => payload,
        },
      };
    });
    const adapter = new S3DocumentAdapterImpl(s3Config, client);

    const buf = await adapter.get("Agents/brief.docx");

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf8")).toBe("hello world");
  });

  it("throws a clear error when the object has no body", async () => {
    const client = fakeClient(async () => ({ Body: undefined }));
    const adapter = new S3DocumentAdapterImpl(s3Config, client);
    await expect(adapter.get("Agents/missing.pdf")).rejects.toThrow(/no body/);
  });
});
