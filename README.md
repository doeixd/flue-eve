[![npm](https://img.shields.io/npm/v/flue-eve)](https://www.npmjs.com/package/flue-eve)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Test](https://github.com/doeixd/flue-eve/actions/workflows/test.yml/badge.svg)](https://github.com/doeixd/flue-eve/actions/workflows/test.yml)
[![Docs](https://github.com/doeixd/flue-eve/actions/workflows/docs.yml/badge.svg)](https://doeixd.github.io/flue-eve/docs/)

# flue-eve

`flue-eve` is an adapter that lets apps written for [Eve](https://eve.dev)'s
browser-facing API run against a [Flue](https://flueframework.com) backend.

In practical terms: you keep the Eve authoring and frontend experience —
`agent/instructions.md`, `agent/tools/*`, `/eve/v1/*`, NDJSON streams,
`Client`, and `useEveAgent` — while your agent actually runs on Flue's open
runtime.

It exists for teams that like Eve's file-based agent authoring and browser
ergonomics but want runtime control: normal Flue agents, Flue tools, Flue
deployment targets, and no dependency on Eve's hosted/runtime layer.

## What it provides

- Eve-style `agent/instructions.md`, `agent/tools/*`, and `agent/connections/*`
  authoring through scaffold/import
- `/eve/v1/*` session routes
- NDJSON streaming
- `Client` / `ClientSession`
- `useEveAgent`
- `sessionId`, `continuationToken`, and `streamIndex`

## What it does not do

- It does not reimplement the Eve runtime.
- It does not make Flue pretend to be Eve internally.
- It does not expose Flue stream offsets or runtime internals to browser clients.

The boundary is deliberate: Eve shape at the edge, Flue execution behind it.

**Docs:** https://doeixd.github.io/flue-eve/docs/

## Fastest path

```bash
npm install flue-eve @flue/runtime hono
npm install -D @flue/cli
```

1. Add `flueEve()` to Vite so browser calls to `/eve/v1/*` are proxied during
   development.
2. Run `npx flue-eve init` to scaffold the Flue agent, compat sidecar, and app
   mount.
3. Build your UI with `useEveAgent()` or call the API with `Client`.
4. Run Flue locally and set `FLUE_BASE_URL=http://127.0.0.1:3583` when you want
   real agent execution.

`flue-eve` is the adapter package. `@flue/runtime` runs the agent, `hono` hosts
the route tree, and `@flue/cli` provides `flue dev`.

Flue requires Node.js 22.19.0 or newer. In this repository, use `vp` so commands
run on the pinned Node version.

## Vite integration

Use the Vite plugin to proxy `/eve/v1/*`, optionally spawn `flue dev`, and alias
Eve browser imports during migration.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { flueEve } from "flue-eve/vite";

export default defineConfig({
  plugins: [
    react(),
    flueEve({
      flueRoot: process.cwd(),
    }),
  ],
});
```

In development, the browser can call same-origin `/eve/v1/*`; the plugin proxies
those requests to the Flue dev server.

## Mount the compat server

Run the CLI to create the standard bridge:

```bash
npx flue-eve init
```

The command generates the Flue agent file, `src/flue-eve-shim.ts`, and, when
`src/app.ts` exists, injects the mount call. The generated sidecar looks like
this:

```ts
// src/flue-eve-shim.ts
import { eveCompat, resolveAdmissionFromRuntime } from "flue-eve/server";
import type { Hono } from "hono";

export function mountEveCompat(app: Hono): void {
  app.route(
    "/eve/v1",
    eveCompat({
      agentName: "assistant",
      admission: resolveAdmissionFromRuntime("assistant", {
        flueBaseUrl: process.env.FLUE_BASE_URL,
      }),
    }),
  );
}
```

```ts
// src/app.ts
import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";
import { mountEveCompat } from "./flue-eve-shim.js";

const app = new Hono();

app.route("/", flue());
mountEveCompat(app);

export default app;
```

Set `FLUE_BASE_URL=http://127.0.0.1:3583` to loop back to a running `flue dev`
server. Without real admission configured, use mock admission for deterministic
local contract tests.

To inspect an existing Eve project before scaffolding, run:

```bash
npx flue-eve scan
npx flue-eve scan --strict
```

## React

`flue-eve/react` provides an Eve-compatible `useEveAgent` hook.

```tsx
import { useState } from "react";
import { useEveAgent } from "flue-eve/react";

export function Chat() {
  const agent = useEveAgent();
  const [message, setMessage] = useState("");
  const busy = agent.status === "submitted" || agent.status === "streaming";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!message.trim() || busy) return;
        void agent.send({ message });
        setMessage("");
      }}
    >
      {agent.data.messages.map((item) => (
        <article key={item.id}>
          <strong>{item.role}</strong>
          {item.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.text}</p> : null,
          )}
        </article>
      ))}

      <input value={message} onChange={(event) => setMessage(event.target.value)} />
      <button disabled={busy || !message.trim()}>Send</button>
      {busy ? <button type="button" onClick={agent.stop}>Stop</button> : null}
    </form>
  );
}
```

The hook returns `{ data, status, error, events, session, send, stop, reset }`.
Use `createEveSessionPersistence()` when you want localStorage-backed session
resume.

## TypeScript client

Use `flue-eve/client` from scripts, tests, server jobs, or custom UIs.

```ts
import { Client } from "flue-eve/client";

const client = new Client({ host: "http://127.0.0.1:5173" });
const session = client.session();

const response = await session.send("Hello");

for await (const event of response) {
  console.log(event.type);
}

const result = await (await session.send("Summarize the session")).result();
console.log(result.status, result.message, result.data);
```

Use `host: ""` for same-origin browser calls. Use a full origin for scripts or
split-origin deployments. The client appends `/eve/v1/*` paths itself.

## Architecture

```text
Browser / scripts
  -> /eve/v1/*                 Eve HTTP contract, NDJSON
  -> @flue-eve/compat-server   journal, tokens, mapper, auth
  -> @flue/runtime             agent harness, tools, durable streams
```

The Vite plugin integrates. The compat server translates. The event journal is
the sole owner of Eve `streamIndex`, so reconnects replay Eve events rather than
leaking Flue stream offsets.

## Eve compatibility

Supported:

- `GET /eve/v1/health`
- `GET /eve/v1/info`
- `POST /eve/v1/session`
- `POST /eve/v1/session/:id`
- `GET /eve/v1/session/:id/stream?startIndex=N`
- `eve/client`-compatible `Client` and `ClientSession`
- `eve/react`-compatible `useEveAgent`
- HITL `input.requested` / `inputResponses`
- OAuth park events
- `outputSchema` / `result.completed`
- Vite, SvelteKit, Nuxt, Nitro, Node, and Cloudflare-oriented integrations

Not a goal for v1:

- Reimplementing the Eve runtime
- Eve's runtime loader as the source of truth; Eve-style `agent/` files are
  supported through `npx flue-eve init` scaffold/import
- Eve platform channels such as Slack or Discord
- Exposing Flue stream internals to Eve clients

See the [compatibility matrix](https://doeixd.github.io/flue-eve/docs/reference/compatibility/)
for the detailed ledger.

## Packages

The public `flue-eve` package exposes the main subpaths:

| Import | Purpose |
|--------|---------|
| `flue-eve/client` | Eve-compatible TypeScript client |
| `flue-eve/react` | `useEveAgent` and session persistence helper |
| `flue-eve/vite` | Vite plugin |
| `flue-eve/server` | Hono compat server middleware |
| `flue-eve/server/worker` | Cloudflare Worker app helpers |
| `flue-eve/connections` | MCP / connection shim |
| `flue-eve/connections/search` | `connection__search` support |
| `flue-eve/connections/connect` | Optional `@vercel/connect` bridge |

The monorepo also contains lower-level `@flue-eve/*` packages used by the
aggregator.

## Examples

| Example | Purpose |
|---------|---------|
| `examples/flue-integrated` | Vite UI + Flue app + Eve compat sidecar |
| `examples/vite-react` | React chat against an Eve-compatible server |
| `examples/vite-vanilla` | Fetch-based browser client |
| `examples/cloudflare-eve` | Worker-oriented compat server |
| `examples/sveltekit-eve` | SvelteKit wrapper |
| `examples/nuxt-eve` | Nuxt module |
| `examples/nitro-eve` | Nitro plugin |

## Development

Use `vp` so commands run on the pinned Node version.

```bash
git clone https://github.com/doeixd/flue-eve.git
cd flue-eve
npm install -g vite-plus
vp install
vp test
vp exec -- pnpm -r run build
```

Useful scripts:

```bash
pnpm dev:integrated      # Vite UI + flue dev + Eve shim
pnpm dev:docs            # docs site
pnpm build:docs          # static docs export
pnpm smoke:spike         # mock HTTP smoke test
```

The test suite covers the compatibility server, client, React hook, Vite
integration, deployment helpers, workflows, channels, and examples.

## Documentation

- [Published docs](https://doeixd.github.io/flue-eve/docs/) — start here
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production deploy notes
- [PLAN.md](./PLAN.md) — implementation plan and invariants
- [AGENTS.md](./AGENTS.md) — coding-agent onboarding
- [flue-eve/](./flue-eve/) — migration skill for AI coding agents
- [Eve docs](https://eve.dev/docs/introduction) — compatibility target
- [Flue docs](https://flueframework.com/docs/getting-started/quickstart/) — runtime

## License

MIT. Eve-derived test fixtures and ported test files are attributed in
[`test/ATTRIBUTION.md`](./test/ATTRIBUTION.md) and remain under Apache-2.0 per
their upstream origin.
