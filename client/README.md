# SkiPrepCoach client (prototype)

Thin client per `docs/spec/11-core-principle.md`: it only shows the next recommended action and collects the result. No local decision logic.

## Running

```sh
npm install
npm run dev
```

Requires an API server at `VITE_API_BASE_URL` (see `.env`, defaults to `http://localhost:3001`) implementing `GET /api/users/:userId/next` and `POST /api/users/:userId/results` per `docs/spec/05-server-api.md`.

For now, that's the mock server at the repo root:

```sh
# from repo root, in another terminal
npm run mock:server
```

Once the real server (`src/app.ts`) implements those two routes, point `VITE_API_BASE_URL` at it instead — no client code changes needed, since the client is built directly against the spec's contract, not the mock's implementation.

## Not built yet (by design, see plan)

- Readiness check-in (`POST /readiness`)
- Self-directed / onboarding logging (`POST /log`)
