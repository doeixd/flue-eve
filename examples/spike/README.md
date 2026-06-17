# M0 spike

Hand-written `@flue-eve/compat-server` with mock Flue admission (no live LLM required).

```bash
pnpm install
pnpm --filter @flue-eve/example-spike start
# other terminal:
pnpm --filter @flue-eve/example-spike smoke
```

Or use curl against `/eve/v1/session` and `/eve/v1/session/:id/stream`.