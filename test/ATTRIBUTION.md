# Eve-derived test attribution

Tests adapted from [vercel/eve](https://github.com/vercel/eve) (Apache-2.0).

| Our file | Eve source | Coverage |
|----------|------------|----------|
| `packages/client/src/client.test.ts` | `packages/eve/test/client.test.ts` | health, auth, info, send/result/stream/reconnect/state (29 tests) |
| `packages/client/src/session.test.ts` | `packages/eve/src/client/session.test.ts` | full port (7 tests) |
| `packages/client/src/test-fixtures.ts` | `packages/eve/test/client.test.ts` | stream helpers |
| `packages/client/src/output-schema.ts` | `packages/eve/src/client/output-schema.ts` | `extractCompletedResult` |
| `packages/client/src/url.test.ts` | `packages/eve/src/client/url.test.ts` | |
| `packages/client/src/client-error.test.ts` | `packages/eve/src/client/client-error.test.ts` | |
| `packages/compat-server/src/stream-query.test.ts` | `packages/eve/test/eve-run-stream-channel.test.ts` | `parseStartIndex` subset |
| `packages/compat-server/src/stream-route.test.ts` | `packages/eve/test/eve-run-stream-channel.test.ts` | HTTP route subset |
| `packages/shared/src/protocol/message.test.ts` | `packages/eve/src/protocol/message.test.ts` | stream version, authorization, action result normalization (9 tests) |
| `packages/react/src/use-eve-agent.test.tsx` | `packages/eve/src/react/use-eve-agent.test.ts` | full port (8 tests) |
| `packages/react/src/message-reducer.test.ts` | `packages/eve/src/client/message-reducer.test.ts` | full port (8 tests) |
| `packages/client/src/output-schema.test.ts` | `packages/eve/src/client/output-schema.test.ts` | `extractCompletedResult` |
| `packages/compat-server/src/stream-replay-regression.test.ts` | `packages/eve/test/eve-run-stream-channel.test.ts` | Multi-turn `startIndex=0` regression |
| `packages/compat-server/src/eve-channel-parity.test.ts` | `packages/eve/src/public/channels/eve.test.ts` | HTTP body validation + continue-session subset |
| `packages/client/src/session.test.ts` | `packages/eve/src/client/session.test.ts` | full port + HITL delivery retry regression |
| `packages/compat-server/src/admission/loopback.test.ts` | (regression) | string/string[] clientContext forwarding |

## Not yet ported (out of scope or M5+)

| Eve source | Reason |
|------------|--------|
| `packages/eve/test/eve-run-stream-channel.test.ts` (full) | Covered by `stream-route` + `stream-replay-regression` |
| `packages/eve/src/public/channels/eve.test.ts` (full) | File uploads, task mode, onMessage hooks — out of v1 scope |
| `packages/eve/src/public/channels/eve.test.ts` | Eve channel internals |
| `packages/eve/test/scenarios/*` | Vercel/Workflow deployment |
| `packages/eve/src/harness/*` | Eve harness (we use Flue) |
| `packages/eve/src/cli/dev/tui/*` | TUI works via compat API; no direct port |