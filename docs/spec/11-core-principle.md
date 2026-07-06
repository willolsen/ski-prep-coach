# Core Principle

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Resolved Parameters Reference →](./12-parameters-reference.md)

SkiPrepCoach is not a workout calendar.

It is a closed-loop coaching engine.

Each recommendation is computed fresh from the athlete's event log — there is no separate "state" it consults — and each completed action changes what the engine sees next simply by adding one more entry to that log, never by mutating anything (see "Derived state, not stored state" below). The engine has no concept of calendar time, deadlines, or seasons — it never reasons about "days until ski season" or paces itself against a target date. It only ever answers "what's the best next action given exactly where things stand right now."

**Derived state, not stored state.** The only things SkiPrepCoach ever persists are the [user profile](./02-capabilities.md#user-profile), the [event log](./04-history-and-readiness.md#user-activity-history) of every action performed, and each day's manually-entered [readiness](./04-history-and-readiness.md#readiness-state) input. Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never separately written or mutated — they're pure functions of the event log, recomputed whenever they're needed. This means there's no "current state" document that can drift out of sync with what actually happened; the event log is the only source of truth, and everything else is just a lens on it. It's also what makes [onboarding](./05-server-api.md#logging-without-a-recommendation) simple — bootstrapping a new user is nothing more than inserting a few weeks of backdated events, since there's no separate initial state to seed.

**Time is explicit, not ambient.** Nearly every derivation in [Submitting a Result](./07-result-processing.md) — fatigue decay, warmth decay, daily stimulus, recovery windows, repetition recency, recommendation expiry — depends on "now." Rather than each of those quietly reading the server's wall clock, `now` is always an explicit input: supplied with the request that needs it (optionally on [Get Next Action](./05-server-api.md#get-next-action), defaulting to the real clock only at the outermost HTTP layer if omitted), and threaded through unchanged to every derivation that request touches. This makes the whole decision pipeline a pure function of `(event log, now, timezone, readiness)` — and that's the whole reason for doing it this way: a test can build a synthetic event log, call the pipeline with `now` set to any simulated instant, and see exactly how fatigue, warmth, or recovery eligibility look at that moment, without sleeping in real time or faking the system clock. Nothing about *writing* an event needed this — `startedAt`/`completedAt`/`occurredAt` are already fully client-supplied timestamps — the gap was purely on the read side, where derivations were implicitly asking the database what time it is.

Trusting a client-supplied `now` is a real trust assumption, consistent with the single-trusted-client model this spec already assumes elsewhere (see the authentication gap, [Known Gap: Authentication](./14-server-framework.md#known-gap-authentication)) — worth reconsidering together once there's real multi-user exposure.

The app's intelligence comes from the quality of:

- the exercise metadata
- the recovery model
- the capability model
- the user history
- the `next` decision logic

The UI exists only to show the next action and collect the result.

---

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Resolved Parameters Reference →](./12-parameters-reference.md)
