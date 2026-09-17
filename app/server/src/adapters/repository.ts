/**
 * Repository — local file-backed persistence store (side-effecting adapter).
 *
 * Task 10.5. Persists the app's durable state as human-readable JSON on disk:
 *  - tasks (one file per task id),
 *  - output artifacts (one file per taskId + step),
 *  - the running estimate (single file),
 *  - the document index (single file).
 *
 * Requirements:
 *  - 12.1: persist a Running Estimate log (Billet Balance, Funding Status,
 *          Active CCIR Alerts) as a task completes.
 *  - 15.1: staged output generation — persist each output step's artifact
 *          independently so a step can be regenerated without touching others.
 *
 * Storage layout under the configured data directory (`AppConfig.persistence.dataDir`):
 *
 *   <dataDir>/
 *     tasks/<taskId>.json
 *     outputs/<taskId>__<step>.json
 *     estimate.json
 *     docIndex.json
 *
 * Writes are atomic-ish: content is written to a unique temp file in the same
 * directory and then renamed over the destination, so a crash mid-write never
 * leaves a partially-written JSON document at the canonical path.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  OutputArtifact,
  OutputStep,
  Repository as IRepository,
  RunningEstimate,
  SourceDocument,
  Task,
} from "@sage/shared";

/** A sensible empty running estimate returned before anything has been saved. */
export function emptyEstimate(): RunningEstimate {
  return {
    billetBalance: "",
    fundingStatus: "",
    activeCcirAlerts: [],
    revisions: [],
  };
}

/**
 * Sanitize an id/step component so it is safe to use as a single path segment
 * (no directory separators, no traversal). Task ids and steps are expected to
 * be simple slugs; this guards against unexpected characters regardless.
 */
function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class FileRepository implements IRepository {
  private readonly dataDir: string;
  private readonly tasksDir: string;
  private readonly outputsDir: string;
  private readonly estimatePath: string;
  private readonly docIndexPath: string;

  /**
   * @param dataDir base directory for all persisted JSON (from
   *   `AppConfig.persistence.dataDir`). Injected via the constructor so the
   *   store's location is configurable and testable.
   */
  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.tasksDir = path.join(dataDir, "tasks");
    this.outputsDir = path.join(dataDir, "outputs");
    this.estimatePath = path.join(dataDir, "estimate.json");
    this.docIndexPath = path.join(dataDir, "docIndex.json");
  }

  // --- Tasks ---

  async saveTask(task: Task): Promise<void> {
    await ensureDir(this.tasksDir);
    await writeJsonAtomic(path.join(this.tasksDir, `${safeSegment(task.id)}.json`), task);
  }

  async getTask(id: string): Promise<Task | undefined> {
    return readJson<Task>(path.join(this.tasksDir, `${safeSegment(id)}.json`));
  }

  // --- Output artifacts (keyed by taskId + step) ---

  async saveOutput(artifact: OutputArtifact): Promise<void> {
    await ensureDir(this.outputsDir);
    await writeJsonAtomic(this.outputPath(artifact.taskId, artifact.step), artifact);
  }

  async getOutput(taskId: string, step: OutputStep): Promise<OutputArtifact | undefined> {
    return readJson<OutputArtifact>(this.outputPath(taskId, step));
  }

  private outputPath(taskId: string, step: OutputStep): string {
    return path.join(this.outputsDir, `${safeSegment(taskId)}__${safeSegment(step)}.json`);
  }

  // --- Running estimate ---

  async getEstimate(): Promise<RunningEstimate> {
    const estimate = await readJson<RunningEstimate>(this.estimatePath);
    return estimate ?? emptyEstimate();
  }

  async saveEstimate(estimate: RunningEstimate): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonAtomic(this.estimatePath, estimate);
  }

  // --- Document index ---

  async saveDocIndex(docs: SourceDocument[]): Promise<void> {
    await ensureDir(this.dataDir);
    await writeJsonAtomic(this.docIndexPath, docs);
  }

  async getDocIndex(): Promise<SourceDocument[]> {
    const docs = await readJson<SourceDocument[]>(this.docIndexPath);
    return docs ?? [];
  }
}

/** Ensure a directory exists (recursively), tolerating an existing directory. */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Write JSON atomically: serialize (human-readable, 2-space indented) to a
 * unique temp file in the same directory, then rename over the destination.
 * The same-directory temp guarantees the rename is atomic on the same volume.
 */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const json = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`,
  );
  await fs.writeFile(tmp, json, "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Clean up the temp file if the rename failed, then rethrow.
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Read and parse a JSON file. Returns `undefined` when the file does not exist
 * so callers can supply sensible defaults; other I/O errors propagate.
 */
async function readJson<T>(filePath: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  return JSON.parse(raw) as T;
}

/**
 * Create a `FileRepository` rooted at a fresh unique subdirectory of the OS
 * temp directory. Handy for tests and ephemeral runs.
 */
export function createTempFileRepository(prefix = "sage-repo-"): {
  repo: FileRepository;
  dir: string;
} {
  const dir = path.join(os.tmpdir(), `${prefix}${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`);
  return { repo: new FileRepository(dir), dir };
}
