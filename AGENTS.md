# flue-eve-vite

Compatibility layer: **Eve.dev API surface** (HTTP routes, client SDK, `useEveAgent`) powered by **Flue** (`@flue/runtime`) on the backend, integrated via a **Vite plugin**.

This file orients coding agents (Cursor, Claude Code, Codex, etc.) working in this repository.

---

## Goals

### What we are building

| Package | Purpose | Status |
|---------|---------|--------|
| `@flue-eve/shared` | Event types, mapping tables, stream constants, event factories | Done |
| `@flue-eve/compat-server` | Hono middleware at `/eve/v1/*` — sessions, journal, mapper, NDJSON | Done |
| `@flue-eve/client` | Drop-in replacement for `eve/client` | Done |
| `@flue-eve/react` | Drop-in replacement for `useEveAgent` from `eve/react` | Done (core path) |
| `@flue-eve/vite` | Vite plugin: spawn/proxy `flue dev`, scaffold, aliases | Done |
| `@flue-eve/connections` | MCP → Eve connection shim, optional `@vercel/connect` bridge | Done |
| `@flue-eve/workflows` | Flue workflow runs → Eve stream (POST /runs, GET .../stream) | Done (M8e) |
| `@flue-eve/channels` | Flue channel events → Eve sessions (webhook → session) | Done (M8e) |
| `@flue-eve/sveltekit` | SvelteKit Vite plugin wrapper with Vite proxy config | Done (M8f) |
| `@flue-eve/nuxt` | Nuxt module wrapping `flueEve()` Vite plugin | Done (M8f) |
| `@flue-eve/nitro` | Nitro plugin: Vite dev proxy + runtime plugin mounting `eveCompat` via `fromWebHandler` | Done (M8g) |

### What we are NOT building

- A fork of Eve or Flue
- Full Eve filesystem agent discovery (`agent/tools/*.ts`, `agent/connections/*.ts` auto-load)
- Eve platform channels (Slack, Discord, …) — users use Flue channels separately
- Mandatory `@vercel/connect` dependency (optional peer for OAuth in M5 — see `PLAN.md` section 27)
- A drop-in `eve` npm package replacement (we publish `@flue-eve/*`)

### One-sentence pitch

> Reuse Eve's frontend contract and developer ergonomics; run agents on Flue's harness and deploy anywhere Flue supports.

### Authoritative plan

Read **`PLAN.md`** before making architectural decisions. It contains milestones, invariants, API mappings, edge cases, and success criteria. When `PLAN.md` and this file disagree, **`PLAN.md` wins** for design; update this file if onboarding guidance drifts.

---

## Implementation status (2026-06-17)

**M0–M8 complete.** 380 Vitest tests pass across 68 files (`vp test`).

```text
Browser / Eve tooling (useEveAgent, eve/client, TUI)
  → /eve/v1/*  (Eve HTTP contract, NDJSON)
  → @flue-eve/compat-server  (journal, tokens, mapFlueToEve, admission)
  → Flue agent instance  (POST /agents/:name/:id, Durable Streams)
```

| Layer | What works today |
|-------|------------------|
| **compat-server** | HITL, OAuth park, journal persistence adapters, production auth, Worker entry (`createEveWorkerApp`) |
| **client** | `Client`, `ClientSession`, NDJSON parse, reconnect, `result()` via `extractCompletedResult` |
| **react** | `useEveAgent`, HITL projection, `stop()`, 9 hook tests + 8 reducer tests |
| **connections** | `defineFlueConnection`, `connection__search`, `@vercel/connect` bridge |
| **vite** | Proxy, spawn `flue dev`, health gate, sidecar scaffold, `virtual:flue-eve-config`, validation |
| **sveltekit** | Vite proxy plugin wrapper — `eveSvelteKit()` merges proxy config |
| **nuxt** | Nuxt module — `@flue-eve/nuxt` calls `addVitePlugin(flueEve())` |
| **workflows** | POST /runs + GET .../stream, NDJSON output |
| **channels** | POST /channels/:name/events + GET session stream |
| **nitro** | `eveNitro()` — Vite dev proxy + runtime plugin (`@flue-eve/nitro`) |
| **examples** | `spike`, `vite-vanilla`, `vite-react`, `flue-integrated`, `cloudflare-eve`, `sveltekit-eve`, `nuxt-eve`, `nitro-eve` |

**M8 complete:** All milestones achieved. Remaining: live MCP 401 against real MCP server (post-M8 polish).

---

## Architecture (30 seconds)

```text
Browser / scripts
  → /eve/v1/*          (Eve contract)
  → @flue-eve/compat-server   (translation + tokens + NDJSON)
  → Flue agent instance       (createAgent, harness, tools, sandbox)
```

**Critical split:** the Vite plugin handles **integration** (proxy, codegen, shim insertion). The compat-server handles **runtime translation** (never put stream mapping in Vite middleware if it can live in the Flue server process).

**Stream shim (solved in M0–M1):** Flue Durable Streams → `mapFlueToEve()` → event journal → Eve NDJSON + `startIndex`. The journal is the sole owner of Eve `streamIndex`.

### Key exported APIs

| Export | Package | Purpose |
|--------|---------|---------|
| `eveCompat(options)` | compat-server | Hono sub-app with Eve routes (mount-relative) |
| `createEveCompatApp(options)` | compat-server | Standalone app with `/eve/v1` prefix |
| `createMockAdmission()` | compat-server | Deterministic mock stream (no LLM) |
| `createLoopbackAdmission()` | compat-server | HTTP POST to Flue + Durable Streams consumer |
| `resolveAdmission()` | compat-server | Uses `FLUE_BASE_URL` when set, else undefined (mock fallback) |
| `mapFlueToEve()` | compat-server | Flue event async generator → Eve events |
| `Client`, `ClientSession` | client | Eve SDK parity |
| `useEveAgent` | react | Frontend hook |
| `flueEve()` | vite | Vite plugin |
| `createEveWorkerApp()` | compat-server/worker | Cloudflare Worker Eve app (KV/DO journal) |
| `resolveEveCompatDefaults()` | compat-server | Production `auth` + `persistence` from env |
| `createEveCorsMiddleware()` | compat-server | Mode B split-origin CORS |
| `createEveSessionPersistence()` | react | `localStorage` session cursor for `useEveAgent` |
| `loadSessionState()` / `saveSessionState()` | client | Session JSON persistence helpers |
| `eveSvelteKit(options)` | sveltekit | SvelteKit Vite plugin wrapper (proxy + flueEve) |
| `@flue-eve/nuxt` (module) | nuxt | Nuxt module wrapping `flueEve()` |
| `createEveWorkflowApp(options)` | workflows | Workflow run routes (POST /runs + GET /stream) |
| `createEveChannelBridge(options)` | channels | Channel webhook → Eve session bridge |

**Sidecar pattern** (default in `examples/flue-integrated`):

```ts
// src/flue-eve-shim.ts — generated once
import { eveCompat, resolveAdmission } from "@flue-eve/compat-server";

export function mountEveCompat(app: Hono): void {
  app.route("/eve/v1", eveCompat({
    agentName: "assistant",
    admission: resolveAdmission({ agentName: "assistant", flueBaseUrl: process.env.FLUE_BASE_URL }),
  }));
}
```

Set `FLUE_BASE_URL=http://127.0.0.1:3583` for loopback to a running `flue dev` instance; omit for mock admission.

---

## Documentation & Resources

### This repo

| Path | Contents |
|------|----------|
| `PLAN.md` | Full implementation plan, milestones M0–M7, invariants, edge cases |
| `README.md` | Quick start + Eve compatibility matrix |
| `DEPLOYMENT.md` | Production deploy (Node Mode A/B, Cloudflare Worker, env vars) |
| `AGENTS.md` | This file — agent onboarding |
| `packages/` | `@flue-eve/*` monorepo packages |
| `examples/` | Spike, vite-vanilla, vite-react, flue-integrated, cloudflare-eve |
| `fixtures/eve-contract/` | Partial golden JSON (`health.json`, `session-start.json`) |
| `fixtures/flue-events/` + `fixtures/eve-events/` | Golden mapper pairs (5 scenarios) |
| `test/ATTRIBUTION.md` | Eve-derived test provenance (Apache-2.0) |
| `vitest.workspace.ts` | Per-package Vitest projects |
| `.node-version` | Node 22.19.0 (pinned via `vp env pin`) |

### Eve (compatibility target — what we copy)

| Resource | URL |
|----------|-----|
| Introduction | https://eve.dev/docs/introduction |
| Getting started | https://eve.dev/docs/getting-started/quickstart/ |
| Eve HTTP channel (routes) | https://eve.dev/docs/channels/eve |
| Sessions & streaming (contract) | https://eve.dev/docs/concepts/sessions-runs-and-streaming |
| TypeScript SDK (`eve/client`) | https://eve.dev/docs/guides/client/overview |
| Messages / continuations / streaming | https://eve.dev/docs/guides/client/messages |
| Frontend / `useEveAgent` | https://eve.dev/docs/guides/frontend/overview |
| SvelteKit Vite plugin (reference) | https://eve.dev/docs/guides/frontend/sveltekit |
| Next.js `withEve` (reference) | https://eve.dev/docs/guides/frontend/nextjs |
| Agent discovery index | https://eve.dev/agents.md |
| Full docs corpus (Markdown) | https://eve.dev/llms.txt |
| Semantic sitemap | https://eve.dev/sitemap.md |
| Page-level Markdown | append `.md` to any `eve.dev/docs/...` URL |
| Source (after `npm install eve`) | `node_modules/eve/docs/` |
| GitHub | https://github.com/vercel/eve |

**Eve routes implemented (v1):**

```text
GET  /eve/v1/health
GET  /eve/v1/info
POST /eve/v1/session
POST /eve/v1/session/:sessionId
GET  /eve/v1/session/:sessionId/stream?startIndex=N
```

**Eve handles clients must understand:**

- `continuationToken` — resume next user turn (channel-owned)
- `sessionId` — stream/inspect handle (runtime-owned)
- `streamIndex` — events consumed (for reconnect)
- NDJSON stream (`application/x-ndjson; charset=utf-8`)

### Flue (runtime — what powers agents)

| Resource | URL |
|----------|-----|
| Getting started | https://flueframework.com/docs/getting-started/quickstart/ |
| Agent skill / scaffold prompt | https://flueframework.com/start.md |
| What is an agent? (harness model) | https://flueframework.com/docs/concepts/agents/ |
| Building agents | https://flueframework.com/docs/guide/building-agents/ |
| Routing / `app.ts` | https://flueframework.com/docs/guide/routing/ |
| Routing API | https://flueframework.com/docs/api/routing-api/ |
| Streaming protocol (Durable Streams) | https://flueframework.com/docs/api/streaming-protocol/ |
| SDK overview | https://flueframework.com/docs/sdk/overview/ |
| SDK agents API | https://flueframework.com/docs/sdk/agents/ |
| SDK events | https://flueframework.com/docs/sdk/events/ |
| Durable execution | https://flueframework.com/docs/concepts/durable-execution/ |
| CLI overview | https://flueframework.com/docs/cli/overview/ |
| Project layout | https://flueframework.com/docs/guide/project-layout/ |
| Deploy on Node.js | https://flueframework.com/docs/ecosystem/deploy/node/ |
| Model specifiers | https://flueframework.com/models.json |
| GitHub | https://github.com/withastro/flue |

**Flue routes we translate from:**

```text
POST /agents/:name/:id          → admit prompt (202 or 200 ?wait=result)
GET  /agents/:name/:id          → Durable Streams (NOT NDJSON)
```

**Offline Flue docs (after `@flue/cli` install in a Flue project):**

```bash
npx flue docs
npx flue docs search <query>
npx flue docs read <path>
```

### Pi (Flue's model layer)

Flue model specifiers and provider env vars follow Pi conventions:

- https://pi.dev/docs/latest/providers#api-keys
- https://pi.dev/models

---

## Local vendor clones (untracked)

Clone upstream repos into **gitignored** folders for source reading, grepping, and contract verification. Do not commit these directories.

```text
_vendor/
├── eve/          # git clone https://github.com/vercel/eve.git
└── flue/         # git clone https://github.com/withastro/flue.git
```

### Setup

```bash
mkdir -p _vendor
git clone --depth 1 https://github.com/vercel/eve.git _vendor/eve
git clone --depth 1 https://github.com/withastro/flue.git _vendor/flue
```

Add `_vendor/` to `.gitignore` if not already present.

### What to grep in vendor clones

**Eve (`_vendor/eve/`):**

- `eveChannel` route handlers — `/eve/v1/session` (202 vs 200 status codes)
- `eve/client` — `Client`, `ClientSession`, reconnect logic; `test/client.test.ts`
- `eve/react` or frontend — `useEveAgent`, reducer, event types
- `protocol/message.ts` — stream constants, `authorization.*` event factories
- `test/eve-run-stream-channel.test.ts` — `startIndex` validation
- `runtime/framework-tools/connection-search-dynamic.ts` — `connection__search`
- `internal/authored-definition/connection.ts` — `@vercel/connect` metadata
- `eveSvelteKit` / `withEve` — Vite/Next proxy patterns
- Continuation token validation

**Flue (`_vendor/flue/`):**

- `packages/runtime/` — agent admission, Durable Streams emission
- `packages/cli/` — `flue dev` server, Vite integration, discovery
- Agent stream event shapes (`FlueEvent`)
- `POST /agents/:name/:id` handler
- `examples/` — minimal agent + workflow fixtures

Treat vendor clones as **read-only reference**. Implement compatibility in `packages/`, not by patching upstream.

---

## Terminology

| Term | Meaning in this project |
|------|-------------------------|
| **Eve contract** | HTTP paths, JSON bodies, NDJSON events, client types Eve exposes |
| **Compat / shim** | `@flue-eve/compat-server` — translates Eve ↔ Flue |
| **Session (Eve)** | Durable conversation; identified by `sessionId` + `continuationToken` |
| **Agent instance (Flue)** | `POST /agents/:name/:id` — `id` is the instance identifier |
| **v1 mapping** | `sessionId` === Flue instance `id`; single configured `agentName` |
| **Event journal** | Adapter-owned log of emitted Eve events (powers `startIndex` replay) |
| **Mapper** | `FlueEvent` → `EveEvent` async generator |
| **Shim injection** | Plugin writes `mountEveCompat(app)` sidecar import into Flue `app.ts` |
| **Admission** | How compat-server submits a user turn to Flue (mock, loopback HTTP, or in-process) |

**Do not conflate:**

- Flue **workflow run** (`runId`) ≠ Eve **session** — we use Flue **agents**, not workflows, for Eve sessions
- Flue **dispatch** (`dispatchId`) ≠ Eve session turn
- Eve **continuationToken** ≠ Flue **stream offset** — we synthesize tokens in the adapter

---

## Milestones (where to work next)

Follow `PLAN.md` section 21. **M0–M8 complete.** 380 tests, 68 files. Remaining: live MCP 401 against real MCP server (post-M8 polish).

---

## Agent instructions

### Before coding

1. Read `PLAN.md` sections 1–11 (architecture + API mapping + events + tokens).
2. Fetch or read the specific Eve doc page for the feature you are implementing.
3. Fetch or read the matching Flue doc page for the runtime behavior.
4. If stuck on wire format, grep `_vendor/eve` and `_vendor/flue` (clone first).
5. Run `vp test` before and after changes.

### While coding

- **Eve API is the external boundary.** Tests and examples assert Eve shapes, not Flue shapes.
- **Plugin integrates; compat-server translates.** Keep responsibilities separate.
- **Idempotent codegen.** Never duplicate `mountEveCompat` or `app.route('/eve/v1', ...)` on plugin restart.
- **Fail closed on auth** in production unless `auth: 'none'` is explicit.
- **Do not leak Flue internals** (`streamUrl`, Durable Stream offsets) to Eve clients.
- **Prefer small, focused diffs.** One package / one milestone per PR when possible.
- **Match existing naming:** `@flue-eve/*` scope, `eveCompat()`, `flueEve()` plugin name.
- **UI/server split:** keep browser UI in `src/ui/` when compat-server runs in Flue `app.ts` — prevents bundling server code into the client.

### Implementation preferences

| Task | Preferred approach |
|------|-------------------|
| Admit user message | `resolveAdmission()` → loopback when `FLUE_BASE_URL` set; mock otherwise; in-process when available |
| Stream to browser | compat-server reads Flue Durable Stream, writes Eve NDJSON via journal |
| Dev same-origin | Vite plugin proxies `/eve/v1` → `flue dev` origin |
| Agent authoring | Flue `createAgent` in `src/agents/<name>.ts` — not Eve filesystem layout |
| Session persistence | Flue agent instance + adapter SessionStore (tokens/indices) |
| Node version | Always use `vp exec` — Flue requires Node ≥22.19.0 |

### What to ask the user

Only ask for genuine decisions:

- Flue deploy target (`node` vs `cloudflare`) for examples
- Default `agentName` and model specifier
- Auth policy for production demos
- API keys / secrets (never invent — show env var commands)

Automate everything else: scaffold, shim injection, validation, fixture tests.

### What NOT to do

- Do not reimplement the agent harness — use Flue
- Do not expose Flue workflow runs as Eve sessions
- Do not overwrite user-edited generated files (check for `@flue-eve/generated` marker)
- Do not commit `_vendor/` clones or `.env` files
- Do not invent API keys or tokens
- Do not expand scope into Eve schedules/platform channels unless explicitly requested (connections OAuth is M5 — see `PLAN.md` section 27)
- Do not run `pnpm test` on system Node 20 — use `vp test` or `vp exec`

---

## Key invariants (do not break)

From `PLAN.md` section 16 — abbreviated:

1. Eve route paths are stable under `{eveMount}` (default `/eve/v1/`)
2. v1: server-generated `ses_*` session id ↔ one Flue instance `id`
3. **`streamIndex` is owned by compat-server journal only** — never Flue per-prompt offsets
4. NDJSON: one JSON object per line
5. `session.waiting` unlocks the composer (`useEveAgent` → `ready`)
6. Stale `continuationToken` → 409; terminal session follow-up → 410
7. `POST /session` returns before turn completes
8. Default shim = sidecar file; auto-patch `app.ts` is opt-in (`scaffold.appMount`)
9. Flue owns model/tools/sandbox execution; compat-server translates only
10. No Flue `streamUrl`, `offset`, or `submissionId` in Eve client responses
11. v1: `continuationToken` is stable for session lifetime (no per-turn rotation yet)

---

## Testing guidance

**Runner:** Vitest via `vp test`. See `PLAN.md` section 23 for full tier layout (unit / integration / contract / scenario).

**Current:** 302 tests, 59 files — all passing (1 live-smoke skipped unless `EVE_LIVE_SMOKE=1`).

### Eve as behavioral reference

Clone `_vendor/eve` and **adapt** its tests (Apache-2.0) — do not guess HTTP shapes or client semantics.

```bash
# Run our suite
vp test

# Run a specific Eve test for reference (read-only, in vendor clone)
pnpm --filter eve exec vitest run --config vitest.unit.config.ts packages/eve/test/client.test.ts
```

**Ported** (see `test/ATTRIBUTION.md`):

| Our file | Eve source | Notes |
|----------|------------|-------|
| `packages/client/src/client.test.ts` | `test/client.test.ts` | 17 tests — health, auth, info, send/result/stream/reconnect |
| `packages/client/src/session.test.ts` | `src/client/session.test.ts` | Full port (7 tests) |
| `packages/client/src/url.test.ts` | `src/client/url.test.ts` | |
| `packages/client/src/client-error.test.ts` | `src/client/client-error.test.ts` | |
| `packages/client/src/output-schema.ts` | `src/client/output-schema.ts` | `extractCompletedResult` for `result()` |
| `packages/compat-server/src/stream-route.test.ts` | `test/eve-run-stream-channel.test.ts` | HTTP route subset |
| `packages/compat-server/src/stream-query.test.ts` | `test/eve-run-stream-channel.test.ts` | `parseStartIndex` |
| `packages/shared/src/protocol/message.test.ts` | `src/protocol/message.test.ts` | Core factories (auth cases M5) |
| `packages/react/src/message-reducer.test.ts` | `src/client/message-reducer.test.ts` | 8 tests (HITL + tools) |
| `packages/react/src/use-eve-agent.test.tsx` | `src/react/use-eve-agent.test.ts` | 9 tests (HITL, stop, prepareSend) |
| `packages/compat-server/src/m5-exit-criteria.test.ts` | M5 exit criteria | Linear MCP + OAuth + /info |
| `packages/compat-server/src/fixture-contract.test.ts` | Golden fixtures | 5 flue→eve pairs |

**Still to port:** any remaining Eve `use-eve-agent` edge cases not yet covered.

### Contract tests (priority)

```text
fixtures/flue-events/*.json  →  mapFlueToEve()  →  fixtures/eve-events/*.jsonl
```

Assert Eve parity: health `{ ok, status: "ready", workflowId }`, POST 202/200, stream headers `x-eve-stream-version: 16`.

### Integration tests

- compat-server mounted in test Flue app (`eve-compat.test.ts`, `integration.test.ts`)
- `@flue-eve/client` multi-turn conversation (3-turn integration test)
- Stream reconnect with `startIndex`; malformed `startIndex` → 400
- Loopback admission against mock Flue stream (`loopback.test.ts`)
- `mcp__*` tools appear as `connection__*` in stream (M5+)

### Manual smoke (Eve quickstart)

```bash
# Mock spike (no Flue)
pnpm --filter @flue-eve/example-spike smoke

# Integrated Flue project (requires Node 22+)
vp exec -- pnpm flue:dev
# In another terminal:
curl -X POST http://127.0.0.1:3583/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Hello"}'
curl -N http://127.0.0.1:3583/eve/v1/session/<sessionId>/stream
```

Port depends on context: Vite dev (5173 + proxy) or `flue dev` (3583).

### Verify before claiming done

- [ ] Eve-shaped request/response (not Flue-shaped)
- [ ] NDJSON stream parses line-by-line
- [ ] Multi-turn context preserved
- [ ] Stale token rejected (409)
- [ ] No secrets in generated code
- [ ] `vp test` green
- [ ] `PLAN.md` milestone exit criteria met

---

## Development setup

Monorepo is scaffolded. Use **vp (Vite+)** for Node version management — Flue requires Node ≥22.19.0; system Node may be older.

```bash
vp install                    # install deps under pinned Node 22.19.0
vp test                       # 250 tests across packages
pnpm dev:cloudflare           # cloudflare-eve Worker example
pnpm smoke / smoke:integrated # live HTTP smoke scripts
pnpm smoke:cloudflare:bg      # Worker smoke detached → .tmp/smoke-cloudflare-*.log
vp exec -- pnpm -r run build  # build all packages
pnpm dev:integrated           # flue-integrated example (Vite + flue dev)
vp exec -- pnpm flue:dev      # Flue dev server only (port 3583)
pnpm dev                      # vite-react example
pnpm dev:vanilla              # vite-vanilla example
```

**Prerequisites:**

- Node `>=22.19.0` (pinned via `.node-version` + `volta` in root `package.json`)
- pnpm 9.x (`packageManager` field)
- `vite-plus` (`vp`) for env pinning and script execution
- LLM API key in `.env` for live agent tests (`ANTHROPIC_API_KEY`, etc.)

**Examples:**

| Example | Purpose |
|---------|---------|
| `examples/spike/` | Standalone mock compat server + smoke script |
| `examples/vite-vanilla/` | Fetch-based chat; separate `server.mjs`; `spawnFlueDev: false` |
| `examples/vite-react/` | React chat with `useEveAgent`; separate `server.mjs` |
| `examples/flue-integrated/` | Real Flue project — `src/app.ts` + sidecar shim, UI in `src/ui/` |
| `examples/cloudflare-eve/` | Cloudflare Worker — KV/DO journal, mock admission |
| `examples/sveltekit-eve/` | SvelteKit chat example with `eveSvelteKit()` plugin |
| `examples/nuxt-eve/` | Nuxt chat example with `@flue-eve/nuxt` module |

See **`DEPLOYMENT.md`** for production Node and Worker setup.

---

## Open questions

Track resolutions in `PLAN.md` section 24. **Resolved in implementation:**

- HTTP loopback admission via `FLUE_BASE_URL` + `createLoopbackAdmission()` (D18)
- Stale `continuationToken` → **409 Conflict** (D2)
- v1 stable token per session — no per-turn rotation yet (D17; audit Eve parity before changing)

**Still open:**

- In-process Flue admission API (preferred long-term; loopback works on Node today)
- **Live Flue MCP 401 → `authorization.required`** against a real MCP server (mock e2e done)
- **`eve.config.ts`** and **`agent/instructions.md`** codegen (M7 stretch)
**Recently resolved (M5–M7):**

- HITL runtime (`input.requested`, `inputResponses`, OAuth callback route)
- Connections shim (`@flue-eve/connections`, `connection__*` rename, mock OAuth stream)
- `@vercel/connect/eve` token bridge (`resolveConnectMcpHeaders`, `defineFlueConnection`)
- Production auth + journal persistence (`resolveEveProductionOptions`, `resolveJournalPersistence`, KV/SQLite/Redis/DO)
- Cloudflare Worker (`createEveWorkerApp`, `examples/cloudflare-eve`)
- Golden contract fixtures + `DEPLOYMENT.md` + `README.md`
- M6 complete: `createEveSessionPersistence`, `createEveCorsMiddleware`, `resolveEveCompatDefaults`, CI, `m6-exit-criteria.test.ts`

When you resolve an open question, update `PLAN.md` and add a one-line note here.

---

## Package & fixture status

| Path | Status |
|------|--------|
| `packages/shared/` | Done |
| `packages/compat-server/` | Done |
| `packages/client/` | Done |
| `packages/vite/` | Done |
| `packages/react/` | Done |
| `packages/connections/` | Done |
| `packages/workflows/` | Done (M8e) |
| `packages/channels/` | Done (M8e) |
| `packages/sveltekit/` | Done (M8f) |
| `packages/nuxt/` | Done (M8f) |
| `examples/spike/` | Done |
| `examples/vite-vanilla/` | Done |
| `examples/vite-react/` | Done |
| `examples/flue-integrated/` | Done |
| `fixtures/eve-contract/` | Partial (`health.json`, `session-start.json`) |
| `fixtures/flue-events/` | Done (5 scenarios) |
| `fixtures/eve-events/` | Done (5 scenarios) |
| `examples/cloudflare-eve/` | Done |
| `README.md` | Done (M6) |
| `DEPLOYMENT.md` | Done (M6) |
| `.github/workflows/test.yml` | Done (M6 CI) |
| `vitest.workspace.ts` | Done |
| `test/ATTRIBUTION.md` | Done |
| `.gitignore` (`_vendor/`, `.env`) | Done |

---

## Quick reference: Eve vs Flue session model

| | Eve | Flue (native) | Our adapter |
|---|-----|---------------|-------------|
| Start conversation | `POST /eve/v1/session` | `POST /agents/:name/:id` | compat-server creates both |
| Identity | `sessionId` | instance `id` | `sessionId` = instance `id` (v1) |
| Resume handle | `continuationToken` | (none) | adapter-issued token (stable v1) |
| Stream | NDJSON + `startIndex` | Durable Streams + `offset` | journal + mapper → NDJSON |
| Client package | `eve/client` | `@flue/sdk` | `@flue-eve/client` |
| Frontend hook | `useEveAgent` | `@flue/react` | `@flue-eve/react` |

---

*Last updated: 2026-06-17 (v10: M0–M8 complete, 380 tests, +nitro plugin). Keep in sync with `PLAN.md`.*