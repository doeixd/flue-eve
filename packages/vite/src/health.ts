export interface WaitForUpstreamOptions {
  readonly baseUrl: string;
  readonly eveMount?: string;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

/** Poll Flue `/openapi.json` or Eve `/health` until upstream is reachable. */
export async function waitForUpstream(options: WaitForUpstreamOptions): Promise<void> {
  const fetch = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  const probes = buildProbes(options.baseUrl, options.eveMount);

  while (Date.now() < deadline) {
    for (const probe of probes) {
      try {
        const response = await fetch(probe, { method: "GET" });
        if (!response.ok) continue;
        if (probe.endsWith("/health")) {
          const body = (await response.json()) as { status?: string };
          if (body.status === "ready") return;
          continue;
        }
        return;
      } catch {
        // retry
      }
    }
    await sleep(intervalMs);
  }

  throw new Error(
    `[flue-eve] timed out waiting for upstream (${probes.join(", ")})`,
  );
}

function buildProbes(baseUrl: string, eveMount?: string): string[] {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const probes = [`${normalized}/openapi.json`];
  if (eveMount) {
    const mount = eveMount.startsWith("/") ? eveMount : `/${eveMount}`;
    probes.unshift(`${normalized}${mount}/health`);
  }
  return probes;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}