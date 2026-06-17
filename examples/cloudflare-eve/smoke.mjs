import { Client } from "flue-eve/client";

const host = process.env.EVE_HOST ?? "http://127.0.0.1:8787";
const bearer = process.env.EVE_BEARER;
const client = new Client({
  host,
  ...(bearer !== undefined ? { auth: { bearer } } : {}),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await client.health();
console.log("[smoke:cloudflare] health", health);
assert(health.ok === true, "health.ok must be true");
assert(health.status === "ready", "health.status must be ready");

const session = client.session();
const turn1 = await (await session.send("Hello from Cloudflare worker smoke.")).result();
console.log("[smoke:cloudflare] turn1", turn1.message?.slice(0, 80));
assert(turn1.status === "waiting", "turn1 must settle to waiting");
assert(typeof turn1.message === "string" && turn1.message.length > 0, "turn1 message required");

const startIndex = session.state.streamIndex;
const reconnect = session.stream({ startIndex: 0 });
const replayed = [];
for await (const event of reconnect) {
  replayed.push(event.type);
}
console.log(
  "[smoke:cloudflare] replay",
  replayed.length,
  "includes waiting:",
  replayed.includes("session.waiting"),
);
assert(replayed.includes("session.waiting"), "replay must include session.waiting");
assert(replayed.includes("message.received"), "replay must include message.received");

const turn2 = await (await session.send("Second turn on worker.")).result();
console.log("[smoke:cloudflare] turn2", turn2.message?.slice(0, 80));
assert(turn2.status === "waiting", "turn2 must settle to waiting");
assert(session.state.streamIndex > startIndex, "streamIndex must advance after turn2");

console.log("[smoke:cloudflare] ok", host);