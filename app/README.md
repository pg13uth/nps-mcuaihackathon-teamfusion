# SAGE Briefing Application

Local, single-user desktop web app operationalizing the TECOM SAGE Master
Orchestration Directive (v10). React + Node/Express, TypeScript.

## Monorepo layout

```
app/
  shared/   @sage/shared — domain types + orchestration/adapter interfaces (importable by client & server)
  server/   @sage/server — Node/Express backend (orchestration + AI/S3 adapters + routes)
  client/   @sage/client — React frontend (Vite)
```

Managed with npm workspaces and TypeScript project references.

## Commands (run from `app/`)

```
npm install       # install all workspace deps
npm run typecheck # typecheck every workspace
npm run build     # build shared + server + client
npm test          # run vitest across workspaces
```

Per-workspace dev servers:

```
npm run dev -w @sage/server   # Express on http://localhost:4180
npm run dev -w @sage/client   # Vite dev server on http://localhost:5173 (proxies /api -> 4180)
```

## Testing

- Test runner: Vitest.
- Property-based testing: fast-check (correctness properties P1–P16 land in later tasks).
