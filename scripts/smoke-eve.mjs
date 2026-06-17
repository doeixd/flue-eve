/**
 * Shared Eve contract smoke — run against any compat server origin.
 *
 *   EVE_HOST=http://127.0.0.1:3583 node scripts/smoke-eve.mjs
 *   EVE_HOST=http://127.0.0.1:8787 EVE_BEARER=secret node scripts/smoke-eve.mjs
 */
import { Client } from "flue-eve/client";

const host = process.env.EVE_HOST ?? "http://127.0.0.1:3583";
const bearer = process.env.EVE_BEARER;
const client = new Client({
  host,
  ...(bearer !== undefined && bearer.length > 0 ? { auth: { bearer } } : {}),
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await client.health();
console.log("[smoke] health", health);
assert(health.ok === true, "health.ok must be true");
assert(health.status === "ready", "health.status must be ready");

const info = await client.info();
console.log("[smoke] info.agent", info.agent?.name);
assert(typeof info.agent?.name === "string", "info.agent.name required");

const session = client.session();

const turn1 = await (await session.send("Smoke turn one.")).result();
console.log("[smoke] turn1", turn1.message?.slice(0, 80));
assert(turn1.status === "waiting", "turn1 must settle to waiting");
assert(typeof turn1.message === "string" && turn1.message.length > 0, "turn1 message required");

const replay = [];
for await (const event of session.stream({ startIndex: 0 })) {
  replay.push(event.type);
}
console.log("[smoke] replay", replay.length, "events");
assert(replay.includes("session.waiting"), "replay must include session.waiting");
assert(replay.includes("message.received"), "replay must include message.received");

const turn2 = await (await session.send("Smoke turn two.")).result();
console.log("[smoke] turn2", turn2.message?.slice(0, 80));
assert(turn2.status === "waiting", "turn2 must settle to waiting");
assert(session.state.streamIndex > 0, "streamIndex must advance");

const outputSchema = {
  type: "object",
  properties: { title: { type: "string" } },
  required: ["title"],
};
const structured = await (
  await session.send({ message: "Structured smoke", outputSchema })
).result();
console.log("[smoke] structured", structured.data);
assert(structured.status === "waiting", "structured turn must settle to waiting");

console.log("[smoke] ok", host);