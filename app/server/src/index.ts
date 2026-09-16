import express from "express";
import { loadConfig } from "./config.js";
import type { AppConfig } from "@sage/shared";
import {
  buildDefaultDocumentDeps,
  buildDefaultTaskDeps,
  createDocumentRouter,
  createTaskRouter,
  type DocumentRouteDeps,
  type TaskRouteDeps,
} from "./routes/index.js";

/**
 * Express bootstrap for the SAGE Briefing Application backend. Wires the
 * pure orchestration layer and the side-effecting adapters into the HTTP
 * routes via dependency injection so the routes are testable with in-memory
 * fakes.
 */

const DEFAULT_PORT = 4180;

/** Options for {@link createApp} (used by tests to inject fake dependencies). */
export interface CreateAppOptions {
  /** Override the loaded configuration. */
  config?: AppConfig;
  /** Inject fully-formed task-route dependencies (fakes in tests). */
  taskDeps?: TaskRouteDeps;
  /** Inject fully-formed document/estimate/health-route dependencies (fakes in tests). */
  documentDeps?: DocumentRouteDeps;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  app.use(express.json());

  const config = options.config ?? loadConfig();

  // Task intake + staged generation routes (Task 12.2).
  const taskDeps = options.taskDeps ?? buildDefaultTaskDeps(config);
  app.use(createTaskRouter(taskDeps));

  // Document library + running estimate + config/health routes (Task 12.4).
  // This router owns GET /config/health, extending the original contract
  // (status/service/aiConfigured) additively with AI reachability.
  const documentDeps = options.documentDeps ?? buildDefaultDocumentDeps(config);
  app.use(createDocumentRouter(documentDeps));

  return app;
}

// Re-export the configuration loader so existing importers keep working.
export { loadConfig, loadConfigFromEnv, isAiConfigured } from "./config.js";

// Only start listening when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  createApp().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`SAGE backend listening on http://localhost:${port}`);
  });
}
