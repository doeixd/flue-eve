# CLI commands reference

## `npx flue-eve init`

Scaffold Flue runtime files and the Eve compat sidecar.

```bash
npx flue-eve init [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--agent-name` | `assistant` | Name of the Flue agent |
| `--model` | `anthropic/claude-sonnet-4-6` | LLM model specifier |
| `--eve-mount` | `/eve/v1` | Mount path for Eve compat routes |
| `--sidecar` | `true` | Generate the Eve compat sidecar file |
| `--agent` | `true` | Generate the Flue agent definition |
| `--tools` | `true` | Generate tool adapters from `agent/tools/*.ts` |
| `--connections` | `false` | Generate connection adapters from `agent/connections/*.ts` |
| `--app-mount` | `true` | Auto-inject `mountEveCompat(app)` into `src/app.ts` |
| `--no-sidecar` | — | Skip sidecar generation |
| `--no-agent` | — | Skip agent generation |
| `--force` | — | Overwrite existing generated files |

### Output

Creates files under the project root. All generated files are marked with `@flue-eve/generated` or `@flue-eve/injected` comments. Safe to re-run — already present files are skipped unless `--force` is passed.

## `npx flue-eve scan`

Scan an existing Eve project for migration requirements.

```bash
npx flue-eve scan [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--strict` | `false` | Treat Tier 2/3 findings as errors (exit code 1) |
| `--json` | `false` | Output report as JSON |
| `--format` | `text` | Output format: `text`, `json`, `markdown` |

### Output

A migration report grouped by tier, with per-file findings and an estimated effort level.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | All findings are Tier 0/1 (or no findings) |
| 1 | Tier 2/3 findings present (only with `--strict`) |

## `npx flue-eve --help`

General help with all available commands.

## Configuration precedence

1. CLI flags (highest priority)
2. `eve.config.ts` file (if present)
3. `flueEve()` plugin options in `vite.config.ts`
4. Defaults (lowest priority)
