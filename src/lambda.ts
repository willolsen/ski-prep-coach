/**
 * AWS Lambda entry point (docs/spec/14-server-framework.md#aws-lambda-deployment).
 * Bundle this together with app.ts via esbuild for deployment; not used locally.
 */

import { handle } from "hono/aws-lambda";
import app from "./app.js";

export const handler = handle(app);
