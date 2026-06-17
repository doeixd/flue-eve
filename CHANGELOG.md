# Changelog

## v0.1.0 (2026-06-17)

Initial release of **flue-eve** — Eve.dev API surface powered by Flue runtime.

### Packages published

| Package | Version | Description |
|---------|---------|-------------|
| `flue-eve` | 0.1.0 | Public aggregator package |
| `@flue-eve/shared` | 0.1.0 | Shared types, events, stream protocol |
| `@flue-eve/client` | 0.1.0 | Eve-compatible client SDK |
| `@flue-eve/react` | 0.1.0 | `useEveAgent` React hook |
| `@flue-eve/compat-server` | 0.1.0 | Hono middleware: HTTP routes, journal, NDJSON |
| `@flue-eve/vite` | 0.1.0 | Vite plugin: proxy, scaffold, aliases |
| `@flue-eve/connections` | 0.1.0 | MCP → Eve connection shim |
| `@flue-eve/workflows` | 0.1.0 | Flue workflow → Eve stream bridge |
| `@flue-eve/channels` | 0.1.0 | Flue channel → Eve session bridge |
| `@flue-eve/sveltekit` | 0.1.0 | SvelteKit Vite plugin wrapper |
| `@flue-eve/nuxt` | 0.1.0 | Nuxt module |
| `@flue-eve/nitro` | 0.1.0 | Nitro plugin |

### Eve compatibility (M0–M8)

- **HTTP routes**: `GET /eve/v1/health`, `GET /eve/v1/info`, `POST /eve/v1/session`, `POST /eve/v1/session/:id`, `GET /eve/v1/session/:id/stream`
- **NDJSON streaming** with `startIndex` replay via event journal
- **Client SDK**: `Client`, `ClientSession`, `send`, `stream`, `result`, reconnect
- **React**: `useEveAgent` with HITL, stop, session persistence
- **HITL**: `input.requested` / `inputResponses` flow
- **Connections**: `connection__*` tool names, OAuth callback
- **Auth**: Bearer token, production defaults via `resolveEveCompatDefaults`
- **Persistence**: Memory, SQLite, Redis, KV, Durable Objects
- **Deployment**: Node (single/split-origin), Cloudflare Worker
- **Framework plugins**: SvelteKit, Nuxt, Nitro
- **Migration skill**: AI coding agent skill for Eve → flue-eve migration
