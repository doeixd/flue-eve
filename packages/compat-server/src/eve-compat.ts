import { createConnectionSearchTool } from "@flue-eve/connections/search";
import {
  COMPAT_API_VERSION,
  COMPAT_WORKFLOW_ID,
  createAuthorizationCompletedEvent,
  createSessionWaitingEvent,
  EVE_SESSION_ID_HEADER,
} from "@flue-eve/shared";
import { Hono } from "hono";

import { createAuthMiddleware, resolveAuthPolicy } from "./auth.js";
import { createMockAdmission } from "./admission/mock.js";
import { createNdjsonStream, StartIndexTruncatedError, streamHeaders } from "./ndjson.js";
import { parseSessionPostBody } from "./session-body.js";
import { parseStartIndex } from "./stream-query.js";
import { SessionStore } from "./session-store.js";
import { createContinuationToken, createSessionId } from "./tokens.js";
import { runTurn } from "./turn-runner.js";
import type { EveCompatOptions, EveResolvedAgentConfig } from "./types.js";
import { wrapAdmission } from "./otel.js";

export type EveWebHandler = (request: Request) => Promise<Response>;

function resolveAgents(options: EveCompatOptions, fallbackModelId: string): readonly EveResolvedAgentConfig[] {
  const configured = options.agents?.length
    ? options.agents
    : [{ name: options.agentName, description: "", modelId: fallbackModelId, tools: options.tools ?? [] }];

  return configured.map((agent) => ({
    name: agent.name,
    description: agent.description ?? "",
    modelId: agent.modelId ?? fallbackModelId,
    tools: agent.tools ?? [],
  }));
}

/** Mount-relative routes (`/health`, `/session`, …). Use with `app.route(mount, eveCompat(...))`. */
export function eveCompat(options: EveCompatOptions): Hono {
  const store = new SessionStore({
    persistence: options.persistence,
    journal: options.journal,
  });
  const baseAdmission = options.admission ?? createMockAdmission();
  const admission = wrapAdmission(baseAdmission);
  const modelId = options.modelId ?? "anthropic/claude-sonnet-4-6";
  const agents = resolveAgents(options, modelId);
  const agentNames = new Set(agents.map((agent) => agent.name));

  const app = new Hono();
  const authPolicy = resolveAuthPolicy(options.auth);
  const requireAuth = createAuthMiddleware(authPolicy);

  app.get("/health", (c) => {
    return c.json({
      ok: true,
      status: "ready",
      workflowId: COMPAT_WORKFLOW_ID,
      flue: true,
      agentName: options.agentName,
      compatVersion: COMPAT_API_VERSION,
    });
  });

  app.get("/info", (c) => {
    const baseTools = (options.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
    }));
    const connectionTools =
      options.connections?.listAllTools().map((tool) => ({
        name: tool.qualifiedName,
        description: tool.description,
      })) ?? [];
    const connectionSearchTool =
      options.connections !== undefined && options.connections.hasConnections()
        ? createConnectionSearchTool(options.connections)
        : undefined;
    const searchTool = connectionSearchTool
      ? [{ name: connectionSearchTool.name, description: connectionSearchTool.description }]
      : [];

    return c.json({
      model: { id: modelId },
      agent: { name: options.agentName },
      agents: agents.map((agent) => ({
        name: agent.name,
        description: agent.description,
        model: { id: agent.modelId },
        tools: [...baseTools, ...searchTool, ...connectionTools, ...agent.tools],
      })),
      tools: [...baseTools, ...searchTool, ...connectionTools],
      connections:
        options.connections?.getConnections().map((connection) => ({
          name: connection.name,
          description: connection.description,
        })) ?? [],
      instructions: options.instructions ?? "",
      compatVersion: COMPAT_API_VERSION,
    });
  });

  app.post("/session", requireAuth, async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const parsed = parseSessionPostBody(raw);
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, parsed.status);
    }

    const requestedAgent = parsed.body.agent ?? options.agentName;
    if (!agentNames.has(requestedAgent)) {
      return c.json(
        { ok: false, error: `Unknown agent "${requestedAgent}".` },
        400,
      );
    }

    const sessionId = createSessionId();
    const continuationToken = createContinuationToken();
    const session = store.create({
      sessionId,
      agentName: requestedAgent,
      continuationToken,
    });

    void runTurn({
      session,
      message: parsed.body.message ?? "",
      inputResponses: parsed.body.inputResponses,
      outputSchema: parsed.body.outputSchema,
      clientContext: parsed.body.clientContext,
      admission,
      store,
    });

    return c.json(
      { ok: true, sessionId, continuationToken },
      202,
      {
        "cache-control": "no-store",
        [EVE_SESSION_ID_HEADER]: sessionId,
        "x-flue-eve-compat": COMPAT_API_VERSION,
      },
    );
  });

  app.post("/session/:sessionId", requireAuth, async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
      return c.json({ ok: false, error: "sessionId is required." }, 400);
    }
    const session = await store.resolve(sessionId);

    if (!session) {
      return c.json({ ok: false, error: "Session not found." }, 404);
    }

    if (session.status === "completed" || session.status === "failed") {
      return c.json({ ok: false, error: "Session is terminal." }, 410);
    }

    if (session.status === "active") {
      return c.json({ ok: false, error: "Session is still active." }, 409);
    }

    const raw = await c.req.json().catch(() => ({}));
    const parsed = parseSessionPostBody(raw);
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, parsed.status);
    }

    const requestedAgent = parsed.body.agent ?? session.agentName;
    if (!agentNames.has(requestedAgent)) {
      return c.json({ ok: false, error: `Unknown agent "${requestedAgent}".` }, 400);
    }

    const token = parsed.body.continuationToken;
    if (!token || token !== session.continuationToken) {
      return c.json({ ok: false, error: "Stale or missing continuation token." }, 409);
    }

    // Route to the requested agent for this turn.
    if (requestedAgent !== session.agentName) {
      session.agentName = requestedAgent;
    }

    void runTurn({
      session,
      message: parsed.body.message ?? "",
      inputResponses: parsed.body.inputResponses,
      outputSchema: parsed.body.outputSchema,
      clientContext: parsed.body.clientContext,
      admission,
      store,
    });

    return c.json(
      { ok: true, sessionId },
      200,
      {
        "cache-control": "no-store",
        [EVE_SESSION_ID_HEADER]: sessionId,
        "x-flue-eve-compat": COMPAT_API_VERSION,
      },
    );
  });

  app.get("/session/:sessionId/stream", requireAuth, async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!sessionId) {
      return c.json({ ok: false, error: "sessionId is required." }, 400);
    }
    const session = await store.resolve(sessionId);

    if (!session) {
      return c.json({ ok: false, error: "Session not found." }, 404);
    }

    const parsed = parseStartIndex(new URL(c.req.url).searchParams);
    if (parsed !== undefined && typeof parsed === "object" && "error" in parsed) {
      return c.json({ ok: false, error: parsed.error }, 400);
    }

    const startIndex = typeof parsed === "number" ? parsed : undefined;

    try {
      const body = createNdjsonStream(session, startIndex);
      return new Response(body, { headers: streamHeaders(sessionId) });
    } catch (error) {
      if (error instanceof StartIndexTruncatedError) {
        return c.json(
          {
            ok: false,
            error: error.message,
            journalBaseIndex: error.baseIndex,
          },
          400,
        );
      }
      throw error;
    }
  });

  app.get("/connections/:connectionName/callback", requireAuth, async (c) => {
    const connectionName = c.req.param("connectionName");
    if (!connectionName) {
      return c.json({ ok: false, error: "connectionName is required." }, 400);
    }
    const sessionId = c.req.query("sessionId");

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return c.json({ ok: false, error: "sessionId query parameter is required." }, 400);
    }

    const session = await store.resolve(sessionId);
    if (!session) {
      return c.json({ ok: false, error: "Session not found." }, 404);
    }

    if (session.pendingAuthorization?.connectionName !== connectionName) {
      return c.json(
        { ok: false, error: "No pending authorization for this connection." },
        409,
      );
    }

    session.journal.append(
      createAuthorizationCompletedEvent({
        name: connectionName,
        outcome: "authorized",
        sequence: session.journal.snapshot(0).nextIndex,
        stepIndex: 0,
        turnId: session.sessionId,
      }),
    );
    session.journal.append(createSessionWaitingEvent());
    session.pendingAuthorization = undefined;
    session.status = "waiting";
    session.updatedAt = Date.now();
    await store.persist(session);

    return c.json({ ok: true, connectionName, sessionId });
  });

  if (process.env.NODE_ENV !== "production") {
    app.get("/debug/journal/:sessionId", async (c) => {
      const session = await store.resolve(c.req.param("sessionId"));
      if (!session) return c.json({ ok: false }, 404);
      const snap = session.journal.snapshot(0);
      return c.json({
        ok: true,
        status: session.status,
        baseIndex: snap.baseIndex,
        nextIndex: snap.nextIndex,
        events: snap.events,
      });
    });
  }

  return app;
}

/** Standalone app with `/eve/v1` prefix for dev servers and examples. */
export function createEveCompatApp(options: EveCompatOptions & { readonly mount?: string }): Hono {
  const mount = normalizeMount(options.mount ?? "/eve/v1");
  const root = new Hono();
  root.route(mount, eveCompat(options));
  return root;
}

/**
 * Web-standard handler for runtimes and frameworks that speak `Request`/`Response`.
 *
 * Examples:
 *   - Hono: `app.mount("/eve/v1", createEveWebHandler({ ... }, { mount: "/" }))`
 *   - h3/Nitro: `h3App.use("/eve/v1", fromWebHandler(createEveWebHandler({ ... }, { mount: "/" })))`
 *   - Workers: `fetch: createEveWebHandler({ ... })`
 */
export function createEveWebHandler(
  options: EveCompatOptions,
  handlerOptions: { readonly mount?: string } = {},
): EveWebHandler {
  const app = createEveCompatApp({
    ...options,
    mount: handlerOptions.mount ?? "/eve/v1",
  });

  return async (request) => app.fetch(request);
}

/** Alias for integrations that call web-standard handlers "middleware". */
export const createEveWebMiddleware = createEveWebHandler;

function normalizeMount(mount: string): string {
  const trimmed = mount.endsWith("/") ? mount.slice(0, -1) : mount;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
