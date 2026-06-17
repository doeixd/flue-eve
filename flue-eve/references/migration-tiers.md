# Migration tiers — detailed reference

## Tier 0 — Frontend only (zero-touch)

No migration work needed. The Vite plugin automatically aliases these imports:

| Eve import | Resolves to |
|------------|-------------|
| `eve/client` | `flue-eve/client` |
| `eve/react` | `flue-eve/react` |
| `eve/client` named exports | `@flue-eve/client` (`Client`, `ClientSession`, etc.) |
| `eve/react` named exports | `@flue-eve/react` (`useEveAgent`, etc.) |

**What the scanner checks:** TypeScript/JavaScript files that import from `eve/client` or `eve/react`.

**Action:** None. The aliases are applied automatically when `flueEve()` is loaded in the Vite config.

## Tier 1 — Declarative agent (auto-scaffold)

The project follows the standard Eve agent layout with declarative tool definitions. The scaffold generates equivalent Flue modules.

### Pattern: `agent/instructions.md`

Copied or referenced as-is in the generated Flue agent definition.

### Pattern: `agent/tools/*.ts`

Eve declarative tools use this shape:

```ts
export default {
  name: "tool_name",
  description: "...",
  parameters: { type: "object", properties: { ... }, required: ["..."] },
  execute: async (args) => { ... },
}
```

The scaffold reads each tool file and generates a Flue-compatible tool adapter.

### Pattern: `agent/connections/*.ts` (simple MCP)

Eve connections using `defineMcpClientConnection` or `defineOpenAPIConnection` are converted to Flue connection definitions via `@flue-eve/connections`. The scaffold generates `src/connections/index.ts` with the connection registry.

### Pattern: `eve.config.ts`

The `loadEveConfigFile()` function reads the existing `eve.config.ts` and merges it with `flueEve()` plugin options. No changes needed — the config format is forward-compatible.

## Tier 2 — Unsupported patterns (manual review)

These patterns require manual migration:

| Pattern | What changed | Migration guide |
|---------|-------------|-----------------|
| `defineTool()` with complex runtime | Custom tool wrapper | Rewrite as a Flue tool in `src/tools/` using `@flue/runtime` tool API |
| `defineMcpClientConnection` with inline auth | Auth flow embedded in tool | Extract standalone connection definition |
| `src/agent/` directory layout | Source directory instead of root | Move `agent/` to project root or update the layout config |
| Non-standard entry point | Custom app bootstrap | Use `eveCompat()` from `@flue-eve/compat-server` in your custom setup |

## Tier 3 — Incompatible (blocked)

These features have no equivalent in flue-eve:

| Feature | Alternative |
|---------|-------------|
| Workflow SDK (`run`, `step`, `@vercel/workflow`) | Use Flue workflow runs via `@flue-eve/workflows` |
| Platform channels (`defineChannel`, `slackChannel`) | Use Flue `@flue/*` channel integrations |
| Eve schedules (`defineSchedule`) | Use your own cron/task scheduler |
| Eve subagents (`agent/subagents/*`) | Define separate Flue agents |
| `defineMcpServerConnection` | Not supported — flue-eve is client-side only |
| `@eve/platform` imports | Not supported — use `@flue/runtime` directly |
