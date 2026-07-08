# SkiPrepCoach client (prototype)

A thin client per `docs/spec/11-core-principle.md`: it shows the next recommended action and collects the result. All decision-making (which exercise, how much, why) lives server-side; the client never computes a recommendation itself.

This doc is aimed at whoever picks this up to build the real production UI — what's here, how it's wired, and exactly where the mock backend needs to be swapped for the real one.

## Running

```sh
npm install
npm run dev
```

Requires an API server at `VITE_API_BASE_URL` (see `.env`). Two options:

- **Mock** (default, `http://localhost:3001`): `npm run mock:server` from the repo root. Random-exercise picker, in-memory only, reset on restart. Built purely so the client had something real to talk to before the real pipeline existed.
- **Real**: `npm run dev` (Hono app, `src/app.ts`) from the repo root, default port 3000. **This already implements the full spec contract** — see "Mock → real swap" below for the two things it's still missing for browser use.

Switching backends is a one-line env var change (`client/.env`), not a code change — see why below.

## Architecture in one paragraph

`AppShell.tsx` is the only component that talks to the network or owns real state. It fetches `GET /next` once, then owns everything downstream: which top-level tab is active, which exercise sub-tab is active, and the little state machine (`action → timer/sets → form`) that drives what's on screen while the user works through one exercise. Every other component is presentational — it receives data and callbacks as props and renders. This isn't an architectural nicety, it directly follows from `docs/spec/11-core-principle.md`: since the *server* is the single source of truth for "what's next," the client shouldn't be scattering its own bits of state across a tree of components either.

## File guide

```
client/src/
  main.tsx                        — ReactDOM entry point
  App.tsx                         — page chrome (header) + <AppShell>
  styles.css                      — the entire stylesheet, one file, CSS custom properties for theming

  api/
    types.ts                      — TypeScript types mirroring docs/spec/05-server-api.md exactly.
                                     Keep these in sync with the SPEC, not with the mock server.
    client.ts                     — fetch wrappers: getNextAction(), submitResult(), exerciseImageUrl().
                                     Every network call in the app goes through this one file.

  screens/
    AppShell.tsx                  — THE state owner. Fetches on mount, holds view/tab state, renders
                                     everything below. Start here to understand the app.

  components/
    TabBar.tsx                    — generic top-level tab nav (label + optional badge). Reused as-is
                                     for the Current Exercise / Today / Overall tabs.
    NextActionCard.tsx            — persistent exercise header (image, name, prescription summary).
                                     Also exports ExerciseFullImage (used in the Description sub-tab).
    ExerciseTimer.tsx             — countdown UI for duration-based exercises (holds, cardio). Owns its
                                     own local timer state; reports back via onFinish(CompletionPrefill).
    SetLogger.tsx                 — one-set-at-a-time UI for rep-based exercises (weight/reps entry,
                                     per-set history, rest-between-sets countdown). Same onFinish contract
                                     as ExerciseTimer — both feed into CompleteActionForm.
    CompleteActionForm.tsx        — final pain/RPE/difficulty/notes form. Accepts a `prefill` from
                                     whichever interactive component ran before it, and hides fields
                                     that are already known (sets/reps/load) rather than asking twice.
    FocusLabel.tsx                — the single "what should I be doing right now" element, reused
                                     across every state (Ready / Hold / Set N of M / Rest / Finish Up).
    StateSummary.tsx              — readiness/warmth/limiting-capability chips (Today tab)
    TodayProgress.tsx             — daily stimulus progress bar (Today tab)

  audio.ts                        — one function, beep(), used for timer phase-change cues
  format.ts                       — one function, formatClock(), MM:SS formatting
  localHistory.ts                 — localStorage-backed "what did I do last time" cache, keyed by
                                     exerciseId. Explicitly NOT server data — see below.
```

## State machine inside AppShell

```
activeTab:      "current" | "today" | "overall"
exerciseSubTab: "action" | "description" | "why"   (within the "current" tab)
view:           "action" | "timer" | "sets" | "form"  (within the "action" sub-tab)
```

All of these render as siblings with the `hidden` attribute toggling visibility — **nothing unmounts when you switch tabs**. This is deliberate: `ExerciseTimer`/`SetLogger` run a live countdown via `requestAnimationFrame`, and if switching tabs unmounted them, a running timer would reset. If you refactor this, preserve that property (e.g. if you introduce React Router, don't let route changes unmount the in-progress exercise state).

Routing between `timer` / `sets` / `form` is decided once, from the prescription shape, when the user starts an exercise:

- `prescription.durationSec` set → `ExerciseTimer` (holds, cardio)
- `prescription.reps` set (no duration) → `SetLogger` (weighted/rep work)
- neither → straight to `CompleteActionForm` (defensive fallback; every exercise in the current curated set has one or the other)
- `nextAction.type === "rest"` → straight to `CompleteActionForm`'s minimal "Acknowledge" branch

## Mock → real swap

The client was built directly against `docs/spec/05-server-api.md`'s request/response shapes (see `api/types.ts`), specifically so this swap is a config change, not a rewrite.

**1. Point at the real server.** In `client/.env`:

```diff
- VITE_API_BASE_URL=http://localhost:3001
+ VITE_API_BASE_URL=http://localhost:3000   # or wherever src/app.ts is deployed
```

That's it for `GET /next` and `POST /results` — `src/app.ts` already implements both against the real decision pipeline, with the same response shape the client expects (checked against `src/pipeline/getNextAction.ts` while writing this: `icon`, `completionQuestions`, `why` are all there).

**2. Enable CORS on the real server.** The mock has `app.use("/api/*", cors())` (`scripts/mock-server.ts`) specifically because a browser on `localhost:5173` calling a different-port API needs it. `src/app.ts` doesn't have this yet — add it (`hono/cors`, same as the mock) before pointing the client at it, or every request will fail with an opaque CORS error, not a helpful one.

**3. Exercise images have no real equivalent yet.** `api/client.ts`'s `exerciseImageUrl()` builds `{API_BASE_URL}/exercise-images/{exerciseId}.png` — a route that only exists on the mock (`scripts/mock-server.ts`, serving straight from `data/generated-images/`). This was never part of the spec (`docs/spec/05-server-api.md` has no image field). Options for the real server, roughly in order of effort: (a) add the same static-file route serving from wherever the real exercise images end up, (b) serve from a CDN/object storage and change `exerciseImageUrl()` to point there instead, (c) put a real `imageUrl` field on the spec's `nextAction` response and drop `exerciseImageUrl()`'s exerciseId-based URL construction entirely. `exerciseImageUrl()` is the only place this logic lives, so any of the three is a one-function change.

**4. `POST /log` and `POST /readiness` are implemented server-side but the client never calls them.** Onboarding/self-directed logging and the morning readiness check-in have no UI yet — see "Not built" below. When you build that UI, the server work is already done; wire straight to it.

## What's mocked vs. real today

| Endpoint | Real server (`src/app.ts`) | Mock (`scripts/mock-server.ts`) | Client calls it? |
|---|---|---|---|
| `GET /api/users/:id/next` | ✅ real decision pipeline | ✅ random exercise picker | ✅ |
| `POST /api/users/:id/results` | ✅ | ✅ (validates pinned `recommendationId`) | ✅ |
| `POST /api/users/:id/log` | ✅ | ❌ | ❌ (no UI yet) |
| `POST /api/users/:id/readiness` | ✅ | ❌ | ❌ (no UI yet) |
| `GET /api/users/:id/state` (debug) | ✅ | ❌ | ❌ |
| `GET /exercise-images/:file` | ❌ | ✅ | ✅ (not part of the spec — see above) |

## Not built (by design — not silently dropped)

- **Readiness check-in UI** for `POST /readiness` (morning pain/stiffness/sleep survey)
- **Self-directed / onboarding logging UI** for `POST /log`
- **Overall tab** is an intentional placeholder (`AppShell.tsx`, "Overall" tab panel) — no spec-defined "all-time progress" view exists yet to build against
- Auth, multi-user, real persistence of anything client-side beyond the `localHistory.ts` "last weight/reps" cache (matches the spec's own stated gaps, `docs/spec/14-server-framework.md#known-gap-authentication`)

A `todo.txt` at the repo root has additional rougher notes/ideas from working sessions (snooze an exercise, temporarily swap equipment, tips during rest, etc.) — not committed to, just captured so they're not lost.

## Design notes for whoever builds the real UI

- **Everything is one CSS file** (`styles.css`) using custom properties for theming (`--primary`, `--rest-accent`, `--subtab-accent`, etc.), each with a light and `prefers-color-scheme: dark` variant. No CSS framework, no CSS-in-JS.
- **Flat by design**: cards intentionally have no border/background at multiple levels (the exercise header, the Action/Description/Why panel contents) — this was an explicit, iterative styling direction in this prototype, not an oversight. If reintroducing card chrome, that was a deliberate choice being reversed, not a bug being fixed.
- **Two-level tab convention**: top-level tabs (`TabBar.tsx`) use a full-width underline style in `--primary`; the nested Action/Description/Why sub-tabs reuse that same visual language but in a distinct accent color (`--subtab-accent`) specifically so the two navigation levels don't blend together at a glance.
- **`FocusLabel` is load-bearing UX**, not decoration — the explicit design intent (from the session that built it) is that the user's eyes should always land in the same place to answer "what am I doing right now," across every state. If you add new states to the Action flow, give them a `FocusLabel` too rather than leaving it blank.
- The exercise **timer/rest countdowns are `requestAnimationFrame`-driven**, computing remaining time from `Date.now()` vs. a stored end-timestamp every frame (not `setInterval` counting down) — robust to tab throttling and gives a genuinely smooth (not stepped) progress ring. If you rebuild this, keep the time-from-timestamp approach; a naive "subtract one second" counter will drift.
