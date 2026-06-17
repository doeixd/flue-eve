---
name: flue-eve
description: >-
  Migrate an Eve project to flue-eve — scan existing code, scaffold the Flue
  runtime, wire the Eve compat server, connect the frontend. Triggers on any
  mention of "migrate from Eve", "switch to flue-eve", "run Eve on Flue",
  "flue-eve migration", "project conversion", or when users ask how to port
  an existing Eve agent, client, or frontend to flue-eve. Also triggers when
  users ask about setting up flue-eve in a new project from scratch.
---

# flue-eve migration skill

Migrate an Eve project to flue-eve or scaffold a new flue-eve project from scratch.

## Workflow

1. **Assess** — scan the project for Eve patterns
2. **Scaffold** — generate Flue runtime files + Eve compat sidecar
3. **Configure** — set up the Vite plugin, aliases, and env vars
4. **Connect frontend** — update browser code if needed
5. **Verify** — run the health check and a test turn

---

## 1. Assess the project

Run the migration scanner to understand what the project needs:

```bash
npx flue-eve scan
```

The scanner reports findings in four tiers:

| Tier | What it means | Effort |
|------|---------------|--------|
| **Tier 0** | Browser-only code (`useEveAgent`, `eve/client`) | Zero-touch — Vite aliases handle it |
| **Tier 1** | Declarative agent (`instructions.md`, tools, connections, `eve.config.ts`) | Auto-scaffold |
| **Tier 2** | Custom tool patterns, non-standard layout | Manual review needed |
| **Tier 3** | Incompatible: Workflow SDK, platform channels, schedules | **Blocked** — explain alternatives |

For most projects, run with `--strict` in CI to treat Tier 2/3 as errors:

```bash
npx flue-eve scan --strict
```

Read the full tier reference at `references/migration-tiers.md` for detailed migration guidance per pattern.

**Important:** This project has not been migrated to flue-eve — the output of `npx flue-eve scan` will tell us what is needed.

---

## 2. Scaffold

Generate the Flue runtime files and Eve compat sidecar:

```bash
npx flue-eve init
```

This creates or updates:

| File | Purpose |
|------|---------|
| `src/agents/{agentName}.ts` | Flue agent definition with instructions + tools |
| `src/flue-eve-shim.ts` | Eve compat sidecar — mounts `/eve/v1/*` routes |
| `src/app.ts` | Flue Hono app (if new) or mounts the sidecar (if existing) |
| `src/tools/*.ts` | Tool adapters generated from `agent/tools/*.ts` (optional) |
| `src/connections/*.ts` | Connection adapters from `agent/connections/*.ts` (optional) |
| `eve.config.ts` | Plugin configuration (optional) |

### Customizing the scaffold

```bash
npx flue-eve init --agent-name support --model openai/gpt-4o
```

See `references/cli-commands.md` for all options.

**Idempotent:** Re-running is safe — already present files are not overwritten unless `--force` is passed.

---

## 3. Configure

### Vite plugin

Add `flueEve()` to `vite.config.ts`:

```ts
import { flueEve } from "flue-eve/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [flueEve()],
})
```

Or use `eve.config.ts` for project-specific config:

```ts
import { defineEveCompat } from "flue-eve/vite/config"

export default defineEveCompat({
  agentName: "assistant",
  modelId: "anthropic/claude-sonnet-4-6",
  instructions: "You are a helpful assistant.",
})
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `FLUE_BASE_URL` | Points to a running `flue dev` server (default: mock admission) |
| `EVE_AUTH_BEARER` | Bearer token for production auth (fail-closed) |
| `FLUE_AGENT_URL` | Custom Flue agent URL (overrides auto-resolution) |

In dev, leave `FLUE_BASE_URL` unset for mock (deterministic, no LLM needed). To test against a real LLM, start `flue dev` and set `FLUE_BASE_URL=http://127.0.0.1:3583`.

---

## 4. Connect the frontend

The Vite plugin aliases `eve/client` → `flue-eve/client` and `eve/react` → `flue-eve/react`. If the user imports from `eve/...`, no code changes are needed — existing imports work as-is.

For new projects, import directly from `flue-eve`:

```ts
import { useEveAgent } from "flue-eve/react"
import { Client } from "flue-eve/client"
```

The `useEveAgent` hook accepts a `createEveSessionPersistence` for localStorage-backed session resume:

```tsx
import { useEveAgent, createEveSessionPersistence } from "flue-eve/react"

const persistence = createEveSessionPersistence({ storage: localStorage })
const { messages, send, ready, stop } = useEveAgent(persistence)
```

---

## 5. Verify

Start the dev server:

```bash
pnpm dev
```

### Health check

```bash
curl http://localhost:5173/eve/v1/health
```

Expected response: `{ "ok": true, "status": "ready" }`

### Test a turn

```bash
SESSION=$(curl -s -X POST http://localhost:5173/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Hello"}' | jq -r '.sessionId')
```

With mock admission it returns a deterministic response immediately.

### Run the test suite

```bash
vp test
```

Expect 375+ tests across 67 test files — all passing.

---

## New project quickstart (no migration)

For a from-scratch project, the workflow is the same but shorter:

```bash
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install flue-eve
npx flue-eve init
```

Then add `flueEve()` to `vite.config.ts` and start coding your agent.

---

## Project structure reference

A typical flue-eve project after migration:

```text
your-project/
├── agent/
│   ├── instructions.md        # system prompt (Eve-compatible)
│   └── tools/
│       └── lookup-order.ts    # declarative tool definition
├── src/
│   ├── app.ts                 # Flue Hono app
│   ├── agents/
│   │   └── assistant.ts       # Flue agent (generated)
│   ├── flue-eve-shim.ts       # Eve compat sidecar (generated)
│   └── tools/                 # tool adapters (generated)
├── eve.config.ts              # plugin config (optional)
├── vite.config.ts             # Vite + flueEve() plugin
├── flue.config.ts             # Flue config (auto-generated)
└── package.json               # depends on flue-eve
```

---

## Architecture

```text
Browser / scripts
  → /eve/v1/*          (Eve HTTP contract, NDJSON)
  → @flue-eve/compat-server    (journal, mapper, tokens, auth)
  → Flue agent instance        (POST /agents/:name/:id, Durable Streams)
```

The Vite plugin handles integration (proxy, codegen, aliases). `@flue-eve/compat-server` handles runtime translation.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ERR_MODULE_NOT_FOUND` for `@flue-eve/*` | Dependency not installed | `npm install flue-eve` |
| `/eve/v1/health` returns 404 | Plugin not loaded or proxy misconfigured | Verify `flueEve()` in `vite.config.ts` |
| 409 on follow-up | Stale `continuationToken` or active turn | Use the latest token from the session response |
| 500 stream failure | Flue process not running | Start `flue dev` or check `FLUE_BASE_URL` |
| Mock responses instead of real LLM | `FLUE_BASE_URL` not set | Set to running Flue instance or use in-process admission |
| Proxy strips headers | Security feature — strips cookie/auth/origin | Use `EVE_AUTH_BEARER` for production auth |
