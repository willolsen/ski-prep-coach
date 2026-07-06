/**
 * Local dev / container / VM entry point (docs/spec/14-server-framework.md#local-development).
 *
 * Usage:
 *   npm run dev
 */

import { serve } from "@hono/node-server";
import app from "./app.js";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
