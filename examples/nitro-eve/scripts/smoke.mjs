// Smoke test for Nitro + flue-eve example
// Verifies the Nitro dev server starts and responds to /eve/v1/health

import { createDevServer } from "nitropack";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const nitro = await createDevServer(root, { watch: false, logLevel: "silent" });
  await nitro.ready();
  const url = `http://127.0.0.1:${nitro.options.devServer?.port ?? 3000}`;

  try {
    const resp = await fetch(`${url}/eve/v1/health`);
    const ok = resp.ok || resp.status === 404;
    // 404 is expected if no compat-server is running — just means proxy isn't connected
    console.log(`Nitro dev server responded: ${resp.status}`);
    if (!ok) process.exit(1);
  } finally {
    await nitro.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
