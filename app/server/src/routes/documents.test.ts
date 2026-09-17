import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../index.js";
import type { DocumentRouteDeps, AiReachabilityProbe } from "./index.js";
import type {
  AppConfig,
  OutputArtifact,
  OutputStep,
  Repository,
  RunningEstimate,
  S3DocumentAdapter,
  S3ObjectRef,
  SourceDocument,
  Task,
} from "@sage/shared";

/**
 * Route tests for the document library + running estimate + config/health
 * endpoints (Task 12.4).
 *
 * Uses in-memory fakes for the two side-effecting collaborators (S3 adapter +
 * persistence) and an injected AI reachability probe, so no real network, disk,
 * or AWS access occurs.
 */

// --- In-memory fake repository ---------------------------------------------

class InMemoryRepository implements Repository {
  tasks = new Map<string, Task>();
  outputs = new Map<string, OutputArtifact>();
  estimate: RunningEstimate = {
    billetBalance: "",
    fundingStatus: "",
    activeCcirAlerts: [],
    revisions: [],
  };
  docIndex: SourceDocument[] = [];

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, structuredClone(task));
  }
  async getTask(id: string): Promise<Task | undefined> {
    const t = this.tasks.get(id);
    return t ? structuredClone(t) : undefined;
  }
  async saveOutput(artifact: OutputArtifact): Promise<void> {
    this.outputs.set(`${artifact.taskId}__${artifact.step}`, structuredClone(artifact));
  }
  async getOutput(taskId: string, step: OutputStep): Promise<OutputArtifact | undefined> {
    const a = this.outputs.get(`${taskId}__${step}`);
    return a ? structuredClone(a) : undefined;
  }
  async getEstimate(): Promise<RunningEstimate> {
    return structuredClone(this.estimate);
  }
  async saveEstimate(estimate: RunningEstimate): Promise<void> {
    this.estimate = structuredClone(estimate);
  }
  async saveDocIndex(docs: SourceDocument[]): Promise<void> {
    this.docIndex = structuredClone(docs);
  }
  async getDocIndex(): Promise<SourceDocument[]> {
    return structuredClone(this.docIndex);
  }
}

// --- Fake S3 adapter --------------------------------------------------------

class FakeS3Adapter implements S3DocumentAdapter {
  constructor(private readonly objects: S3ObjectRef[]) {}
  async list(_prefix: string): Promise<S3ObjectRef[]> {
    return this.objects.slice();
  }
  async get(_key: string): Promise<Buffer> {
    return Buffer.from("");
  }
}

// --- Config + deps builders -------------------------------------------------

const AI_CONFIGURED: AppConfig = {
  ai: { endpoint: "https://ai.example/v1", model: "test-model", apiKey: "secret-key-123" },
  s3: { bucket: "b", region: "us-east-1", prefix: "Agents/" },
  persistence: { dataDir: "./.unused-in-tests" },
};

const AI_UNCONFIGURED: AppConfig = {
  ...AI_CONFIGURED,
  ai: { endpoint: "", model: "" },
};

const reachableProbe: AiReachabilityProbe = async () => ({
  reachable: true,
  detail: "AI endpoint reachable at ai.example.",
});

function buildDeps(
  overrides: Partial<DocumentRouteDeps> = {},
): { deps: DocumentRouteDeps; repo: InMemoryRepository } {
  const repo = (overrides.repository as InMemoryRepository) ?? new InMemoryRepository();
  const deps: DocumentRouteDeps = {
    config: overrides.config ?? AI_CONFIGURED,
    repository: repo,
    s3: overrides.s3 ?? new FakeS3Adapter([]),
    aiReachabilityProbe: overrides.aiReachabilityProbe ?? reachableProbe,
    ...overrides,
  };
  return { deps, repo };
}

// --- GET /documents ---------------------------------------------------------

describe("GET /documents", () => {
  it("merges the live S3 listing with tagged index; untagged docs are flagged + excluded", async () => {
    const s3 = new FakeS3Adapter([
      { key: "Agents/tagged.docx", fileType: "docx" },
      { key: "Agents/untagged.pdf", fileType: "pdf" },
    ]);
    const { deps, repo } = buildDeps({ s3 });
    // Only the first object is tagged in the persisted index.
    repo.docIndex = [
      {
        docId: "tagged",
        s3Key: "Agents/tagged.docx",
        fileType: "docx",
        metadata: {
          Echelon: "Strategic",
          Domain: "Logistics",
          Doc_Type: "Policy",
          Status: "Active",
          Topic_Tags: ["readiness"],
        },
      },
    ];
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app).get("/documents");
    expect(res.status).toBe(200);
    expect(res.body.s3Available).toBe(true);
    const byKey = Object.fromEntries(
      res.body.documents.map((d: { s3Key: string }) => [d.s3Key, d]),
    );

    const tagged = byKey["Agents/tagged.docx"];
    expect(tagged.untagged).toBe(false);
    expect(tagged.usableForGrounding).toBe(true);
    expect(tagged.metadata.Echelon).toBe("Strategic");

    const untagged = byKey["Agents/untagged.pdf"];
    expect(untagged.untagged).toBe(true);
    expect(untagged.usableForGrounding).toBe(false);
    expect(untagged.metadata).toBeNull();
  });

  it("flags Superseded/Draft tagged documents", async () => {
    const s3 = new FakeS3Adapter([{ key: "Agents/old.docx", fileType: "docx" }]);
    const { deps, repo } = buildDeps({ s3 });
    repo.docIndex = [
      {
        docId: "old",
        s3Key: "Agents/old.docx",
        fileType: "docx",
        metadata: {
          Echelon: "Strategic",
          Domain: "Logistics",
          Doc_Type: "Policy",
          Status: "Superseded",
          Topic_Tags: ["legacy"],
        },
      },
    ];
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app).get("/documents");
    expect(res.status).toBe(200);
    const doc = res.body.documents[0];
    expect(doc.usableForGrounding).toBe(true);
    expect(doc.flaggedStatus).toBe(true);
  });
});

// --- POST /documents --------------------------------------------------------

describe("POST /documents", () => {
  it("rejects a document missing metadata keys and persists nothing", async () => {
    const { deps, repo } = buildDeps();
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app)
      .post("/documents")
      .send({
        s3Key: "Agents/partial.docx",
        metadata: { Echelon: "Strategic", Domain: "Logistics" },
      });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe("metadata");
    expect(res.body.missing).toEqual(
      expect.arrayContaining(["Doc_Type", "Status", "Topic_Tags"]),
    );
    expect(repo.docIndex.length).toBe(0);
  });

  it("registers and persists a fully-tagged document", async () => {
    const { deps, repo } = buildDeps();
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app)
      .post("/documents")
      .send({
        s3Key: "Agents/policy.docx",
        metadata: {
          Echelon: "Strategic",
          Domain: "Logistics",
          Doc_Type: "Policy",
          Status: "Active",
          Topic_Tags: ["readiness", "posture"],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.document.docId).toBe("policy");
    expect(res.body.usableForGrounding).toBe(true);
    expect(res.body.flaggedStatus).toBe(false);
    // Persisted to the doc index.
    expect(repo.docIndex.length).toBe(1);
    expect(repo.docIndex[0].s3Key).toBe("Agents/policy.docx");
    expect(repo.docIndex[0].metadata?.Doc_Type).toBe("Policy");
  });

  it("replaces an existing entry with the same s3Key on re-tag", async () => {
    const { deps, repo } = buildDeps();
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    await request(app).post("/documents").send({
      s3Key: "Agents/policy.docx",
      metadata: {
        Echelon: "Strategic",
        Domain: "Logistics",
        Doc_Type: "Policy",
        Status: "Draft",
        Topic_Tags: ["draft"],
      },
    });
    await request(app).post("/documents").send({
      s3Key: "Agents/policy.docx",
      metadata: {
        Echelon: "Strategic",
        Domain: "Logistics",
        Doc_Type: "Policy",
        Status: "Active",
        Topic_Tags: ["final"],
      },
    });

    expect(repo.docIndex.length).toBe(1);
    expect(repo.docIndex[0].metadata?.Status).toBe("Active");
  });
});

// --- GET /estimate ----------------------------------------------------------

describe("GET /estimate", () => {
  it("returns the persisted running estimate with revision history and collisions", async () => {
    const { deps, repo } = buildDeps();
    repo.estimate = {
      billetBalance: "120/120",
      fundingStatus: "POM-27 funded",
      activeCcirAlerts: [],
      revisions: [
        {
          at: "2026-01-01T00:00:00.000Z",
          taskId: "task-1",
          summary: "Initial estimate",
          billetBalance: "120/120",
          fundingStatus: "POM-27 funded",
        },
      ],
    };
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app).get("/estimate");
    expect(res.status).toBe(200);
    expect(res.body.estimate.billetBalance).toBe("120/120");
    expect(res.body.revisions.length).toBe(1);
    expect(res.body.revisions[0].taskId).toBe("task-1");
    expect(Array.isArray(res.body.collisions)).toBe(true);
  });
});

// --- GET /config/health -----------------------------------------------------

describe("GET /config/health", () => {
  it("preserves the base contract and reports aiConfigured=true with reachability", async () => {
    const { deps } = buildDeps({ aiReachabilityProbe: reachableProbe });
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app).get("/config/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("sage-briefing-app");
    expect(res.body.aiConfigured).toBe(true);
    expect(res.body.ai.configured).toBe(true);
    expect(res.body.ai.reachable).toBe(true);
    // The API key must never appear in the health response.
    expect(JSON.stringify(res.body)).not.toContain("secret-key-123");
  });

  it("reports aiConfigured=false when AI is unconfigured and does not probe", async () => {
    let probed = false;
    const probe: AiReachabilityProbe = async () => {
      probed = true;
      return { reachable: false, detail: "should not be called" };
    };
    const { deps } = buildDeps({ config: AI_UNCONFIGURED, aiReachabilityProbe: probe });
    const app = createApp({ config: AI_UNCONFIGURED, documentDeps: deps });

    const res = await request(app).get("/config/health");
    expect(res.status).toBe(200);
    expect(res.body.aiConfigured).toBe(false);
    expect(res.body.ai.configured).toBe(false);
    expect(res.body.ai.reachable).toBeUndefined();
    expect(probed).toBe(false);
  });

  it("reports unreachable clearly when the probe fails, without leaking the key", async () => {
    const unreachableProbe: AiReachabilityProbe = async () => ({
      reachable: false,
      detail: "AI endpoint unreachable at ai.example.",
    });
    const { deps } = buildDeps({ aiReachabilityProbe: unreachableProbe });
    const app = createApp({ config: AI_CONFIGURED, documentDeps: deps });

    const res = await request(app).get("/config/health");
    expect(res.status).toBe(200);
    expect(res.body.ai.configured).toBe(true);
    expect(res.body.ai.reachable).toBe(false);
    expect(res.body.ai.detail).toContain("unreachable");
    expect(JSON.stringify(res.body)).not.toContain("secret-key-123");
  });
});
