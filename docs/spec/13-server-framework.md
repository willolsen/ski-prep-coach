# 12. Server Framework & Deployment

[← Index](../README.md) · Previous: [Data Layer](./12-data-layer.md)

## 12.1 Technology Choice

**Hono**, not Express. Both can serve the API in [Section 3](./05-server-api.md), but Express was designed around a long-running Node process and only runs on AWS Lambda via a third-party wrapper (`serverless-http`) that adapts an API Gateway event into a synthetic Node request/response. Hono was built serverless-first: it has an **official** Node adapter (`@hono/node-server`, for local dev and container/VM deployment) and an **official** AWS Lambda adapter (`hono/aws-lambda`, maintained by the Hono team, not a community shim), plus a genuinely small bundle — which matters directly for Lambda cold-start time. Its routing/middleware API is deliberately close to Express's, so it doesn't cost much familiarity.

The one honest gap: Azure Functions support isn't first-class the way AWS Lambda's is (see [12.6](#126-azure-deployment)).

## 12.2 Shared App, Thin Entry Points

Unlike the database ([Section 11](./12-data-layer.md)), where switching environments is one connection string read at runtime, compute can't be "one process, swap an env var" — a Lambda invocation and a long-running Node server are fundamentally different invocation models. Instead: **one shared app module holds all routes and logic**, and each deployment target gets a thin entry point that adapts it. The entry point is chosen at build/deploy time (which file gets bundled), not at runtime.

```ts
// src/app.ts — shared across every target
import { Hono } from 'hono'

const app = new Hono()

app.get('/api/users/:userId/next', async (c) => {
  const userId = c.req.param('userId')
  const timezone = c.req.query('timezone')   // required, no stored fallback (3.1, 2.1)
  // ...decision pipeline (Section 4)...
  return c.json({ nextAction: { /* ... */ } })
})

app.post('/api/users/:userId/results', async (c) => {
  const userId = c.req.param('userId')
  const body = await c.req.json()
  // ...store event (5.1)...
  return c.json({ status: 'ok' })
})

app.post('/api/users/:userId/log', async (c) => {
  const userId = c.req.param('userId')
  const { entries } = await c.req.json()
  // ...insert events with source: "onboarding" | "self_directed" (3.3)...
  return c.json({ status: 'ok' })
})

export default app
```

```ts
// src/server.ts — local dev and container/VM deployment (either cloud)
import { serve } from '@hono/node-server'
import app from './app'

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) })
```

```ts
// src/lambda.ts — AWS Lambda entry point
import { handle } from 'hono/aws-lambda'
import app from './app'

export const handler = handle(app)
```

## 12.3 Routes

The three endpoints in [Section 3](./05-server-api.md) map onto Hono routes directly, as shown in 12.2: `GET /api/users/:userId/next` (3.1), `POST /api/users/:userId/results` (3.2), `POST /api/users/:userId/log` (3.3). Each handler is where the decision pipeline (Section 4), result-processing derivations (Section 5), and data-layer queries (Section 11) actually get invoked — this spec doesn't prescribe internal handler structure beyond that mapping.

## 12.4 Local Development

`src/server.ts` runs directly via `tsx` (already a project dependency) against a local Postgres, listening on a port like any ordinary Node server. No emulation layer needed for this path — it's the simplest of the three targets.

## 12.5 AWS Lambda Deployment

Bundle `app.ts` + `lambda.ts` into a single file with `esbuild` (already present transitively via `tsx`) for a small, fast-starting deployment artifact. Put an API Gateway HTTP API in front with a proxy integration routing every path to the one Lambda — Hono handles the internal routing itself, so API Gateway's own routing config stays trivial. Actual infrastructure tooling (SAM, CDK, Terraform, Serverless Framework) is a separate decision, deferred until it's time to actually deploy.

## 12.6 Azure Deployment

Two real options, with different risk profiles:

- **Azure Functions** — matches the serverless, pay-per-use model this section was motivated by, but Hono has no official adapter for it. The pattern is straightforward in principle (convert the Azure Functions request into a standard `Request`, call `app.fetch`, convert the `Response` back) but would need real testing before relying on it:

  ```ts
  // src/azure-function.ts — illustrative, not an official Hono adapter
  import { app as azureApp } from '@azure/functions'
  import app from './app'

  azureApp.http('api', {
    route: '{*path}',
    methods: ['GET', 'POST'],
    handler: async (request) => {
      const fetchRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers as any,
        body: request.method === 'GET' ? undefined : await request.text(),
      })
      const response = await app.fetch(fetchRequest)
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      }
    },
  })
  ```

- **Azure Container Apps / App Service** — runs the exact same container built for local Docker (from `src/server.ts`), with zero adapter risk, at the cost of losing Azure Functions' per-invocation billing granularity. Given the adapter is unofficial and untested, this is the safer default for Azure specifically; revisit Azure Functions if serverless billing on Azure becomes a concrete cost concern.

## 12.7 Configuration

Regardless of which entry point is running, application config (`DATABASE_URL` from [Section 11](./12-data-layer.md), `PORT` for the local/container target) is read from environment variables the same way everywhere. What differs across targets is *which entry point gets built and invoked* — not how that entry point reads its configuration.

## 12.8 Known Gap: Authentication

Nothing in this spec so far defines how a request establishes *which* `userId` it's allowed to act as — every endpoint takes `userId` as a path parameter with no authentication or authorization layer specified. The data model has been multi-user-ready since [Section 11](./12-data-layer.md) (every table keyed by `user_id`), but that only matters once requests are actually verified to belong to the user they claim. This needs its own design pass before the API is exposed beyond a trusted single-user client — not addressed here to keep this section scoped to the framework/deployment question it was written to answer.

---

[← Index](../README.md) · Previous: [Data Layer](./12-data-layer.md)
