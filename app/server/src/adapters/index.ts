/**
 * Side-effecting adapters (design "Adapters" layer). Each adapter isolates one
 * external concern (AI, S3, text extraction, persistence) behind an interface
 * from `@sage/shared` so the pure orchestration layer stays testable.
 */
export * from "./aiClient.js";
export * from "./s3DocumentAdapter.js";
export * from "./textExtractor.js";
export * from "./repository.js";
