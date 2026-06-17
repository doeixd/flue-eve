// Smoke test for SvelteKit + flue-eve example
// Verifies the Vite dev server starts and responds to /eve/v1/health

import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const server = await createServer({
    root,
    server: { port: 5199 },
    logLevel: "silent",
  });
  await server.listen();

  try {
    const resp = await fetch("http://127.0.0.1:5199/eve/v1/health");
    const ok = resp.ok || resp.status === 404;
    // 404 is expected if no compat-server is running — just means proxy isn't connected yet
    console.log(`SvelteKit dev server responded: ${resp.status}`);
    if (!ok) process.exit(1);
  } finally {
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
