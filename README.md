[![npm](https://img.shields.io/npm/v/flue-eve)](https://www.npmjs.com/package/flue-eve)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Test](https://github.com/doeixd/flue-eve/actions/workflows/test.yml/badge.svg)](https://github.com/doeixd/flue-eve/actions/workflows/test.yml)
[![Docs](https://github.com/doeixd/flue-eve/actions/workflows/docs.yml/badge.svg)](https://doeixd.github.io/flue-eve/)

# flue-eve

Eve.dev API surface (`/eve/v1/*`, `flue-eve/client`, `useEveAgent`) powered by [Flue](https://flueframework.com) (`@flue/runtime`), integrated via a Vite plugin.

> Reuse Eve's frontend contract and developer ergonomics; run agents on Flue's harness and deploy anywhere Flue supports.

## Quick start

Write an agent the Eve way — `agent/instructions.md` + `agent/tools/*.ts` — then run on Flue.

### 1. Install

```bash
npm install flue-eve
```

### 2. Define your agent

```text
your-project/
├── agent/
│   ├── instructions.md
│   └── tools/
│       └── lookup-order.ts
├── src/
│   └── app.ts
└── vite.config.ts
```

`agent/instructions.md`:
```markdown
You are an order support agent. Always cite order numbers.
```

`agent/tools/lookup-order.ts`:
```ts
export default {
  name: "lookup_order",
  description: "Look up an order by ID",
  parameters: {
    type: "object",
    properties: { orderId: { type: "string" } },
    required: ["orderId"],
  },
  execute: async ({ orderId }) => `Order ${orderId} is packed and ready.`,
};
```

### 3. Initialize

```bash
npx flue-eve init
```

Scaffolds Flue runtime files, generates tool adapters, and wires the Eve compat server.

### 4. Dev

```bash
pnpm dev
```

Vite + Flue start together. Your browser at `http://localhost:5173` talks to `/eve/v1/*` same-origin.

```bash
curl -X POST http://localhost:5173/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Find order 42"}'
curl -N http://localhost:5173/eve/v1/session/<sessionId>/stream
```

### 5. Connect from React

```tsx
import { useEveAgent } from "flue-eve/react";
import { createEveSessionPersistence } from "flue-eve/react";

const persistence = createEveSessionPersistence({ storage: localStorage });
const { messages, send, ready, stop } = useEveAgent(persistence);
```

Or use the `eve/react` import — the Vite plugin aliases it transparently:

```tsx
import { useEveAgent } from "eve/react"; // same as flue-eve/react
```

## Migrate from Eve

Run the migration scanner:

```bash
npx flue-eve scan
```

| Tier | Description | Migration |
|------|-------------|-----------|
| **Tier 0** | `useEveAgent`, `eve/client` imports in browser code | Zero-touch — aliases work |
| **Tier 1** | `agent/instructions.md`, `agent/tools/*.ts`, `eve.config.ts`, simple MCP connections | Auto — scaffold generates Flue modules |
| **Tier 2** | `defineTool`, `defineMcpClientConnection` with complex logic, `src/agent/` layout | Warning + manual review |
| **Tier 3** | Workflow SDK, platform channels, schedules, subagents, `@eve/platform` | Blocked — report explains alternatives |

Most Eve chat agents are **Tier 0/1**. Run `npx flue-eve scan --strict` in CI.

### Code migration skill

This repo includes a [skills.sh](https://skills.sh)-compatible **[flue-eve skill](./flue-eve/SKILL.md)** for AI coding agents. It guides Claude Code, Cursor, or any skills-compatible agent through the full migration workflow: assess, scaffold, configure, verify.

```bash
# Install the skill from the repo
npx skills add doeixd/flue-eve
```

Once installed, ask your agent:

> "Migrate this Eve project to flue-eve"

The agent will scan the codebase, scaffold Flue runtime files, wire the compat server, and verify the setup.

## Architecture

```text
Browser / scripts
  → /eve/v1/*         (Eve HTTP contract, NDJSON)
  → @flue-eve/compat-server  (journal, tokens, mapper, auth)
  → Flue agent instance      (POST /agents/:name/:id, Durable Streams)
```

**Key split:** the Vite plugin handles integration (proxy, codegen, aliases). The `@flue-eve/compat-server` handles runtime translation — never put stream mapping in Vite middleware if it can live in the Flue server process.

## Compatibility matrix

| Eve surface | Status | Notes |
|-------------|--------|-------|
| `GET /eve/v1/health` | Supported | `{ ok, status: "ready", workflowId }` |
| `GET /eve/v1/info` | Supported | Tools include `connection__*` when configured |
| `POST /eve/v1/session` | Supported | 202 + `sessionId` + `continuationToken` |
| `POST /eve/v1/session/:id` | Supported | 200 follow-up; stable token (v1) |
| `GET /eve/v1/session/:id/stream` | Supported | NDJSON + `startIndex` replay |
| `eve/client` (`Client`, `ClientSession`) | Supported | Reconnect, `result()`, bearer auth |
| `useEveAgent` | Supported | HITL projection, `stop()`, localStorage resume |
| `input.requested` / `inputResponses` | Supported | HITL park-resume |
| `authorization.*` OAuth park | Supported | Mock + callback route |
| `mcp__*` → `connection__*` tools | Supported | Via `@flue-eve/connections` |
| `outputSchema` / `result.completed` | Supported | Client `result()` extraction |
| Same-origin Vite dev | Supported | Plugin proxy to `flue dev` |
| Bearer auth (production) | Supported | `EVE_AUTH_BEARER` / fail-closed |
| Journal persistence (Node) | Supported | memory, file, SQLite, Redis |
| Cloudflare Worker | Partial | KV/DO journal; mock admission |
| Multi-agent sessions | Supported | `POST /session { agent }` |
| Per-turn token rotation | Not supported (v1) | Stable token per session |
| Eve filesystem discovery | Not supported | Use Flue `src/agents/*.ts` |
| Eve platform channels | Not supported | Use Flue `@flue/*` channels |

## Packages

The `flue-eve` package bundles every subpackage under subpath imports:

| Subpath | Package |
|---------|---------|
| `flue-eve` | Aggregator — re-exports all |
| `flue-eve/client` | `@flue-eve/client` — Eve SDK parity |
| `flue-eve/react` | `@flue-eve/react` — `useEveAgent` |
| `flue-eve/vite` | `@flue-eve/vite` — Vite plugin |
| `flue-eve/server` | `@flue-eve/compat-server` — Hono middleware |
| `flue-eve/server/worker` | `@flue-eve/compat-server/worker` — Cloudflare Worker |
| `flue-eve/connections` | `@flue-eve/connections` — MCP shim |
| `flue-eve/connections/search` | `@flue-eve/connections/search` — connection search |
| `flue-eve/connections/connect` | `@flue-eve/connections/connect` — `@vercel/connect` bridge |

## Production

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for Node reverse-proxy, env vars, journal backends, and Cloudflare Workers.

## Contributing

```bash
git clone https://github.com/doeixd/flue-eve.git
cd flue-eve
npm install -g vite-plus
vp install
pnpm dev:integrated    # Vite UI + flue dev + Eve shim
vp test                # 375+ tests across 67 test files
```

## Docs

- [PLAN.md](./PLAN.md) — architecture, milestones, invariants
- [AGENTS.md](./AGENTS.md) — onboarding for coding agents
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production deployment
- [flue-eve/](./flue-eve/) — AI coding agent skill for migration workflows
- [Eve docs](https://eve.dev/docs/introduction) — compatibility target
- [Flue docs](https://flueframework.com/docs/getting-started/quickstart/) — runtime

## License

MIT. Eve-derived test fixtures (under `fixtures/` and ported test files) are attributed in [`test/ATTRIBUTION.md`](./test/ATTRIBUTION.md) and remain under Apache-2.0 per their upstream origin.
