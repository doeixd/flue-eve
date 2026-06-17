import { flue } from "@flue/runtime/routing";
import { Hono } from "hono";

import { mountEveCompat } from "./flue-eve-shim.js";

const app = new Hono();

app.get("/api/ping", (c) => c.json({ pong: true, integrated: true }));

app.route("/", flue());
mountEveCompat(app);

export default app;