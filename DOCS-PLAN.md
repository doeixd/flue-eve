# Documentation site plan — Fumadocs + GitHub Pages

**Status:** Not started (plan only)  
**Target:** Public docs at `https://<org>.github.io/<repo>/` (or custom domain later)  
**Stack:** [Fumadocs](https://www.fumadocs.dev) (Next.js App Router) → static export → GitHub Actions → GitHub Pages

---

## Goals

| Goal | Notes |
|------|-------|
| Single docs site for `flue-eve` | Replaces “read five root markdown files” onboarding; current `@flue-eve/*` packages are internal implementation boundaries |
| Eve-parity navigation | Guides shaped like [eve.dev/docs](https://eve.dev/docs/introduction) where we implement the same surfaces |
| Flue-first runtime story | Always clarify: Eve contract in browser, Flue harness on the server |
| Full compatibility roadmap | Every Eve surface is documented as supported, partial, planned, or explicitly rejected |
| Zero server at deploy time | Static export only — GitHub Pages has no Node runtime |
| Monorepo-friendly | Docs app is a workspace package; content lives in-repo |
| CI deploy on `main` | Push → build → `actions/upload-pages-artifact` → `actions/deploy-pages` |

**Non-goals (v1 docs):**

- Forking Eve’s full Geistdocs site (`@vercel/geistdocs`, chat, OG image API, i18n)
- Auto-syncing `_vendor/eve` or `_vendor/flue` docs
- Hosting API reference generated from every package export (stretch)
- Versioned docs (`/v0.1/…`) — single “latest” until publish cadence exists

---

## Docs mission

The docs must make the project intent obvious to a user who has never read `PLAN.md`:

> Follow Eve-style tutorials and APIs; run the actual agent on Flue; keep the escape hatch to use Flue directly when Eve does not expose enough control.

Every major page should answer three questions:

1. **What is the Eve surface?** The route, hook, SDK method, file layout, or guide users already know from Eve.
2. **How is it implemented with Flue?** The adapter, generated Flue code, journal, admission path, or runtime mapping.
3. **What is the compatibility status?** Supported, partial, planned, or not applicable, with a link to tests or roadmap.

### Required explanations

| Topic | Where | Required content |
|-------|-------|------------------|
| What Eve is | `/docs/concepts/eve-and-flue` and intro | Eve provides the authoring experience, frontend/client contract, sessions, streaming, connections, and framework integrations this project targets |
| What Flue is | `/docs/concepts/eve-and-flue` and intro | Flue provides the open runtime: agent harness, tools, durable execution, routing, and deploy targets |
| Why this project exists | `/docs/why` and intro | Users want Eve ergonomics without being locked to Eve's runtime or deployment surface |
| How compatibility works | `/docs/concepts/architecture` and `/docs/reference/eve-to-flue-mapping` | Vite integrates; compat-server translates; Flue executes; journal owns Eve stream indices |
| What is supported | `/docs/reference/compatibility` | Matrix sourced from `PLAN.md` §3.1 and tests |
| What remains | `/docs/roadmap/full-compatibility` | Full Eve compatibility closure list, not vague future work |

### Audience paths

| User | Primary path | Success outcome |
|------|--------------|-----------------|
| Eve user evaluating migration | `/docs/getting-started/from-eve` | Existing Eve client or React app works by changing Vite/config/package imports |
| New user | `/docs/getting-started/new-project` | Creates a working Flue-backed Eve-compatible chat app |
| Frontend-only user | `/docs/getting-started/frontend-only` | Uses `eve/client` or `eve/react` compatible APIs against an existing compat server |
| Flue user | `/docs/guides/vite` and `/docs/concepts/authoring-model` | Adds Eve-compatible HTTP/client/frontend contract to a Flue app |
| Cloudflare deployer | `/docs/deployment/cloudflare` | Deploys Worker with persistence and a documented admission strategy |
| Contributor / agent | `/docs/contributing` and `AGENTS.md` | Knows what to implement without weakening compatibility |

---

## Recommended stack

```text
apps/docs/                    # new pnpm workspace package
  content/docs/               # MDX (Fumadocs source)
  app/                        # Next.js App Router
  source.config.ts            # fumadocs-mdx defineDocs()
  lib/source.ts               # loader + page tree
  next.config.mjs             # output: 'export', basePath, images.unoptimized
```

| Package | Role |
|---------|------|
| `fumadocs-mdx` | MDX compile, `meta.json` sidebar, frontmatter schema |
| `fumadocs-core` | Source loader, search indexes, MDX plugins |
| `fumadocs-ui` | Default docs theme (sidebar, TOC, code blocks) |
| `next` | App Router; **static export** for GitHub Pages |

**Reference implementation:** `_vendor/eve/apps/docs/` uses Fumadocs + Geistdocs. We should **not** copy Geistdocs wholesale — use vanilla `fumadocs-ui` to avoid Vercel-only APIs (`/api/chat`, analytics, etc.) that break static export.

**Search (static):** Configure [Orama static export](https://www.fumadocs.dev/docs/headless/search/orama#static-export) so search runs in the browser (required for GH Pages).

---

## GitHub Pages constraints

GitHub project sites are served under a **subpath**:

```text
https://<owner>.github.io/<repository>/
```

Implications:

1. `next.config.mjs` must set `basePath` and `assetPrefix` to `/<repository>` (or read from env in CI).
2. Prefer `trailingSlash: true` so `/docs/getting-started/` resolves reliably on static hosts.
3. `images.unoptimized: true` (no Next.js image optimizer on GH Pages).
4. No server routes — remove or stub anything under `app/api/*` (use static search indexes only).
5. Repo **Settings → Pages → Source: GitHub Actions** (not `gh-pages` branch).

**Decision D-D1 (required before scaffold):** Confirm GitHub repo name — it becomes the URL segment (`flue-eve-vite` → `/flue-eve-vite/`).

**Decision D-D2 (optional):** Custom domain later (`docs.example.com`) — plan for `CNAME` + drop `basePath` when switching.

---

## Repository layout

Add to `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "examples/*"
  - "apps/docs"          # new
```

```text
apps/docs/
├── package.json              # @flue-eve/docs (private)
├── next.config.mjs
├── source.config.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # marketing / redirect → /docs
│   └── docs/[[...slug]]/page.tsx
├── content/docs/
│   ├── meta.json
│   ├── index.mdx             # Introduction
│   ├── getting-started/
│   ├── guides/
│   ├── concepts/
│   ├── deployment/
│   ├── packages/
│   └── reference/
├── lib/
│   ├── source.ts
│   └── layout.shared.tsx
└── public/
    └── favicon.ico
```

Root scripts (add to root `package.json`):

```json
{
  "dev:docs": "vp exec -- pnpm --filter @flue-eve/docs dev",
  "build:docs": "vp exec -- pnpm --filter @flue-eve/docs build"
}
```

Keep **`PLAN.md`**, **`AGENTS.md`**, **`DEPLOYMENT.md`** at repo root for agents and contributors. The site **summarizes and links**; it does not replace the authoritative plan file.

---

## Content architecture (Diátaxis)

Use Diátaxis, but keep the Eve-to-Flue mapping visible on every compatibility page.

| Area | Path | Purpose |
|------|------|---------|
| **Introduction** | `/docs` | Pitch, architecture diagram, project status, fastest path |
| **Why** | `/docs/why` | Why Eve authoring + Flue openness belongs together |
| **Getting Started** | `/docs/getting-started/*` | Tutorial paths for new users, Eve users, frontend-only users, and Cloudflare users |
| **Guides** | `/docs/guides/*` | Task-oriented: Vite plugin, authoring, React hook, client SDK, connections, migration |
| **Concepts** | `/docs/concepts/*` | Eve vs Flue, sessions, tokens, NDJSON, HITL, admission models, migration tiers |
| **Deployment** | `/docs/deployment/*` | Node, split-origin, Cloudflare Worker, auth, persistence, env vars |
| **Packages** | `/docs/packages/*` | Public package and subpath docs; internal package pages only for contributors |
| **Reference** | `/docs/reference/*` | HTTP routes, event types, config, compatibility matrix, Eve-to-Flue mapping |
| **Roadmap** | `/docs/roadmap/*` | Full Eve compatibility ledger and remaining work |
| **Contributing** | `/docs/contributing` | Trimmed `AGENTS.md` + link to `PLAN.md` on GitHub |

### Page hierarchy

```text
content/docs/
├── index.mdx
├── why.mdx
├── getting-started/
│   ├── index.mdx
│   ├── new-project.mdx
│   ├── from-eve.mdx
│   ├── frontend-only.mdx
│   ├── react.mdx
│   ├── client.mdx
│   └── cloudflare-worker.mdx
├── concepts/
│   ├── eve-and-flue.mdx
│   ├── architecture.mdx
│   ├── authoring-model.mdx
│   ├── sessions-runs-and-streaming.mdx
│   ├── events-and-journal.mdx
│   ├── admission.mdx
│   ├── connections-oauth.mdx
│   └── migration-tiers.mdx
├── guides/
│   ├── vite-plugin.mdx
│   ├── eve-config.mdx
│   ├── migrate-existing-eve-agent.mdx
│   ├── authoring-instructions.mdx
│   ├── authoring-tools.mdx
│   ├── authoring-connections.mdx
│   ├── client.mdx
│   ├── react.mdx
│   ├── connections.mdx
│   ├── multi-agent.mdx
│   └── troubleshooting.mdx
├── deployment/
│   ├── index.mdx
│   ├── node.mdx
│   ├── split-origin.mdx
│   ├── cloudflare/
│   │   ├── index.mdx
│   │   ├── worker.mdx
│   │   ├── kv-do-persistence.mdx
│   │   ├── admission.mdx
│   │   ├── workers-ai.mdx
│   │   └── troubleshooting.mdx
│   ├── auth.mdx
│   ├── persistence.mdx
│   └── env-vars.mdx
├── packages/
│   ├── index.mdx
│   ├── public-package.mdx
│   ├── client.mdx
│   ├── react.mdx
│   ├── vite.mdx
│   ├── server.mdx
│   └── connections.mdx
├── reference/
│   ├── compatibility.mdx
│   ├── eve-to-flue-mapping.mdx
│   ├── http-api.mdx
│   ├── events.mdx
│   ├── config.mdx
│   ├── errors.mdx
│   └── cloudflare.mdx
├── roadmap/
│   ├── full-compatibility.mdx
│   └── migration-support.mdx
└── contributing.mdx
```

### Getting Started flow

| Page | User story | Must include |
|------|------------|--------------|
| `/docs/getting-started/new-project` | “I want a new app.” | Install one public package, add Vite plugin, scaffold Flue agent, run dev, send first message |
| `/docs/getting-started/from-eve` | “I already know Eve tutorials.” | Show Eve quickstart steps and the equivalent `flue-eve` steps side by side |
| `/docs/getting-started/frontend-only` | “I only have a browser app.” | Alias/import `eve/client` and `eve/react`, configure `baseUrl`, connect to an existing compat server |
| `/docs/getting-started/react` | “I want the Eve hook.” | `useEveAgent`, session persistence, HITL state, stop/reconnect |
| `/docs/getting-started/client` | “I want the SDK.” | `Client`, `ClientSession`, `send`, `result`, stream iteration, reconnect |
| `/docs/getting-started/cloudflare-worker` | “I want to deploy on Workers.” | Worker app, KV/DO bindings, env vars, local smoke, known admission limitations |

### Compatibility page template

Every page documenting an Eve-compatible surface must include these sections in this order:

1. **Eve surface** — route/import/file layout/event/user-facing behavior.
2. **Flue implementation** — runtime component or generated Flue code used underneath.
3. **Status** — supported, partial, planned, or rejected; include milestone when not complete.
4. **Example** — minimal runnable code or curl.
5. **Limitations** — exact unsupported edge cases.
6. **Verify** — test file, fixture, smoke command, or manual check.

### Compatibility matrix content

`/docs/reference/compatibility` must be generated from or manually kept in sync with `PLAN.md` §3.1.

| Eve surface | Docs status | Flue implementation |
|-------------|-------------|---------------------|
| `/eve/v1/health`, `/info`, `/session`, `/stream` | Supported / partial where noted | `@flue-eve/compat-server`, Hono routes, SessionStore, EventJournal |
| NDJSON streaming + `startIndex` | Supported | Flue Durable Streams → `mapFlueToEve()` → journal-owned `streamIndex` |
| `eve/client` | Supported core path | `flue-eve/client` subpath wrapping compat HTTP contract |
| `eve/react` / `useEveAgent` | Supported core path | `flue-eve/react`, reducer + client session |
| `agent/instructions.md` | Partial | Vite scaffold/generator into Flue `createAgent` config |
| `agent/tools/*.ts` | Planned | Eve filesystem importer → Flue tools while preserving input/output inference |
| `agent/connections/*.ts` | Planned / partial shim | Eve connection importer + `defineFlueConnection()` + MCP bridge |
| `connection__*` tool names | Partial | `mcp__*` to `connection__*` event mapping |
| Workflows | Planned | Future `flue-eve/workflows` facade over Flue workflows where semantics match |
| Channels | Planned | Future `flue-eve/channels` facade or explicit compatibility notes |
| Schedules / platform channels | Planned | Must be tracked in roadmap before implementation claims full compatibility |
| Cloudflare deployment | Supported shell / partial real admission | `createEveWorkerApp`, KV/DO journal, Worker bindings, future in-process admission |

### Cloudflare docs requirements

Cloudflare must be a first-class deployment section, not a footnote under Node.

| Page | Required content |
|------|------------------|
| `/docs/deployment/cloudflare` | Overview, when to use Workers, supported/partial matrix, required bindings |
| `/docs/deployment/cloudflare/worker` | `createEveWorkerApp`, routing, local dev, deploy command, smoke curl |
| `/docs/deployment/cloudflare/kv-do-persistence` | KV vs Durable Object journal/session storage, binding examples, consistency notes |
| `/docs/deployment/cloudflare/admission` | Mock, loopback not applicable, planned in-process/Service Binding strategies, exact current limitation |
| `/docs/deployment/cloudflare/workers-ai` | If supported: model env/config examples; if not: mark planned and link roadmap |
| `/docs/deployment/cloudflare/troubleshooting` | CORS, missing bindings, stream buffering, auth failures, local Wrangler differences |

Cloudflare pages must avoid implying full live Flue admission works on Workers until M8a proves it with tests and smoke evidence.

### Sidebar `meta.json` (draft)

```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "why",
    "---Quickstart---",
    "getting-started",
    "getting-started/new-project",
    "getting-started/from-eve",
    "getting-started/frontend-only",
    "getting-started/react",
    "getting-started/client",
    "getting-started/cloudflare-worker",
    "---Guides---",
    "guides/vite-plugin",
    "guides/eve-config",
    "guides/migrate-existing-eve-agent",
    "guides/authoring-instructions",
    "guides/authoring-tools",
    "guides/authoring-connections",
    "guides/client",
    "guides/react",
    "guides/connections",
    "guides/multi-agent",
    "guides/troubleshooting",
    "---Concepts---",
    "concepts/eve-and-flue",
    "concepts/architecture",
    "concepts/sessions-streaming",
    "concepts/events-and-journal",
    "concepts/admission",
    "concepts/connections-oauth",
    "concepts/migration-tiers",
    "---Deployment---",
    "deployment/node",
    "deployment/split-origin",
    "deployment/cloudflare/index",
    "deployment/cloudflare/worker",
    "deployment/cloudflare/kv-do-persistence",
    "deployment/cloudflare/admission",
    "deployment/cloudflare/workers-ai",
    "deployment/cloudflare/troubleshooting",
    "deployment/auth",
    "deployment/persistence",
    "deployment/env-vars",
    "---Packages---",
    "packages/public-package",
    "packages/server",
    "packages/client",
    "packages/react",
    "packages/vite",
    "packages/connections",
    "---Reference---",
    "reference/compatibility",
    "reference/eve-to-flue-mapping",
    "reference/http-api",
    "reference/events",
    "reference/config",
    "reference/errors",
    "reference/cloudflare",
    "---Roadmap---",
    "roadmap/full-compatibility",
    "roadmap/migration-support",
    "contributing"
  ]
}
```

---

## Content migration map

| Source (today) | Docs page | Action |
|----------------|-----------|--------|
| `README.md` | `index.mdx`, `reference/compatibility.mdx` | Split pitch vs matrix |
| `DEPLOYMENT.md` | `deployment/*` | Section per deploy target; keep env tables |
| `AGENTS.md` | `contributing.mdx` | Contributor onboarding only |
| `PLAN.md` | `roadmap/full-compatibility.mdx`, `reference/compatibility.mdx` | Summarize §3.1 and milestones; link to GitHub source; do not mirror the whole file |
| `examples/*/README` (if any) | getting-started subpages | One page per example |
| Eve docs (external) | callouts | “Eve parity target” links to eve.dev |
| Flue docs (external) | callouts | Runtime links to flueframework.com |

**Writing rules:**

- Page `title` in frontmatter = sidebar + H1 (Title Case, per Eve docs convention).
- No body H1 — Fumadocs renders title from frontmatter.
- Code samples must use `vp exec` where Node ≥22 matters.
- Every guide ends with “Verify” steps (curl, `vp test`, or example smoke).
- User-facing install docs must prefer the single public package (`flue-eve` or final selected name), not direct installation of every internal workspace package.
- Do not claim “drop-in Eve replacement” unless the page states the exact import/config aliases required and the compatibility status.
- Every unsupported Eve surface must link to `/docs/roadmap/full-compatibility`.

---

## Implementation phases

### Phase D0 — Scaffold (~1 day)

- [ ] `pnpm create fumadocs-app` or manual scaffold in `apps/docs`
- [ ] Wire `apps/docs` into pnpm workspace
- [ ] `next.config.mjs`: `output: 'export'`, `basePath`, `trailingSlash`, `images.unoptimized`
- [ ] `source.config.ts` + minimal `content/docs/index.mdx`
- [ ] Local dev: `pnpm dev:docs`

**Exit:** `pnpm build:docs` emits `apps/docs/out/` with static HTML.

### Phase D1 — Core content (~3–5 days)

- [ ] Introduction + architecture (mermaid from `PLAN.md` §2)
- [ ] Why page: Eve ergonomics + Flue openness
- [ ] Concepts page: what Eve is, what Flue is, and how this project maps them
- [ ] Getting Started paths: new project, from Eve, frontend-only, React, client, Cloudflare Worker
- [ ] Guides: client, `useEveAgent`, `flueEve()`, `eve.config.ts`, migration, authoring tools/connections
- [ ] Compatibility matrix (from `README.md` + `PLAN.md` §3.1)
- [ ] Eve-to-Flue mapping reference
- [ ] Deployment section (from `DEPLOYMENT.md`), including first-class Cloudflare section

**Exit:** New user can go from zero to working chat without reading root markdown.

### Phase D2 — Search + polish (~1–2 days)

- [ ] Orama static search (build-time indexes, client-side query)
- [ ] MDX components: `Callout`, `Steps`, `Tabs` (Fumadocs UI)
- [ ] Optional: `llms.txt` static route (plain markdown export for agents)
- [ ] Branding: logo, social links, “GitHub” nav item

**Exit:** Search works offline on built static site.

### Phase D3 — GitHub Actions deploy (~1 day)

- [ ] Workflow `.github/workflows/docs.yml` (see below)
- [ ] Enable GitHub Pages from Actions
- [ ] README badge + link to published docs
- [ ] PR preview (optional stretch): deploy workflow_dispatch or PR comment with artifact link

**Exit:** Push to `main` publishes site within ~3 minutes.

---

## GitHub Actions workflow (target)

Create `.github/workflows/docs.yml`:

```yaml
name: docs

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: docs
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22.19.0
          cache: pnpm

      - name: Install vite-plus
        run: npm install -g vite-plus@0.1.24

      - name: Install dependencies
        run: vp install

      - name: Build docs
        env:
          # Set to repository name for GitHub project pages
          NEXT_PUBLIC_BASE_PATH: /${{ github.event.repository.name }}
        run: vp exec -- pnpm --filter @flue-eve/docs build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/docs/out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deploy
```

`next.config.mjs` reads base path:

```js
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
```

**Local dev:** `NEXT_PUBLIC_BASE_PATH=` (empty) so `http://localhost:3000/docs` works without prefix.

**CI preview on PR (stretch):** Second job using `JamesIves/github-pages-deploy-action` to `gh-pages` branch with PR number in path — only if preview URLs are worth the complexity.

---

## CI integration with existing `test.yml`

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `test.yml` | push + PR | `vp test`, package builds, cloudflare smoke |
| `docs.yml` | push `main` + manual | Build + deploy docs only |

Optional gate (Phase D3+):

```yaml
# in test.yml — fail PR if docs break
- name: Build docs (no deploy)
  run: vp exec -- pnpm --filter @flue-eve/docs build
```

Add after `apps/docs` exists so doc PRs cannot merge with broken MDX.

---

## Exit criteria (docs v1 complete)

| # | Criterion | Evidence |
|---|-----------|----------|
| D-1 | Fumadocs site builds with `output: 'export'` | `pnpm build:docs` → `apps/docs/out/` |
| D-2 | Published on GitHub Pages | Live URL loads `/docs` |
| D-3 | Quickstart + deployment + compatibility matrix | Manual read-through |
| D-4 | Static search works | Query in browser on deployed site |
| D-5 | `basePath` correct (assets + links) | No 404 CSS/JS on project subpath |
| D-6 | CI deploy workflow green | `docs.yml` on `main` |
| D-7 | README links to docs site | Badge or prominent link |
| D-8 | Eve/Flue explanation exists | `/docs/concepts/eve-and-flue` covers both clearly |
| D-9 | Cloudflare section is complete | Worker, KV/DO, admission, troubleshooting pages exist |
| D-10 | Full compatibility roadmap is visible | `/docs/roadmap/full-compatibility` mirrors `PLAN.md` §3.1 status |
| D-11 | Compatibility pages follow template | Spot-check all Eve surface pages |

---

## Suggested PR stack

| PR | Title | Depends on |
|----|-------|------------|
| 1 | `feat(docs): fumadocs scaffold + workspace` | — |
| 2 | `docs: introduction + getting started` | PR 1 |
| 3 | `docs: guides + deployment port` | PR 2 |
| 4 | `ci: github pages docs workflow` | PR 1 |
| 5 | `docs: static search + llms.txt` | PR 3 |

PR 4 can land as soon as scaffold builds; content PRs parallelize after PR 1.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Next.js static export vs Fumadocs server features | Use static search; no `app/api` routes |
| Wrong `basePath` → broken assets | Single env var; smoke curl CSS in CI |
| Docs drift from code | “Verify” blocks; optional `build:docs` in `test.yml` |
| Node 22 in docs build | `vp exec` in workflow (same as existing CI) |
| Monorepo install size | Docs package isolates Next deps; filter install in workflow |
| Eve doc parity expectations | Matrix clearly marks supported / partial / not supported |

---

## Open decisions

| ID | Question | Default if no answer |
|----|----------|----------------------|
| D-D1 | GitHub repo name for `basePath`? | `flue-eve-vite` |
| D-D2 | Custom domain? | No — project pages first |
| D-D3 | Docs package name `@flue-eve/docs` vs `apps/docs` private? | `@flue-eve/docs` private |
| D-D4 | Include `llms.txt` / `llms-full.txt` routes? | Yes — cheap, helps agents |
| D-D5 | PR preview deployments? | Defer to v2 |
| D-D6 | Mirror full `PLAN.md` / M8 roadmap on site? | Link only; summary page |

---

## Effort estimate

| Phase | Time | Risk |
|-------|------|------|
| D0 Scaffold | ~1 day | Low |
| D1 Core content | ~3–5 days | Low |
| D2 Search + polish | ~1–2 days | Low |
| D3 GH Actions | ~1 day | Medium (`basePath` tuning) |

**Minimum path to published docs:** ~1 week.

---

## Next step

Run Phase D0: scaffold `apps/docs` with Fumadocs, confirm `pnpm build:docs` produces `out/`, then add `docs.yml` workflow.

```bash
# after scaffold exists
vp install
pnpm dev:docs
NEXT_PUBLIC_BASE_PATH=/flue-eve-vite pnpm build:docs
```

---

*Created: 2026-06-17. Keep in sync when repo name or hosting target changes.*
