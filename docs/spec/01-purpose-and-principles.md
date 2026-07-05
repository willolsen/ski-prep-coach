# Purpose & Core Principle

[← Index](../README.md) · Next: [Capabilities →](./02-capabilities.md)

## 1. Purpose

SkiPrepCoach is a server-side decision engine that answers one question:

> What is the best next action for this user right now?

The client is thin. It displays the recommended action, collects the result, and sends that result back to the server.

The engine optimizes for safe, steady progress toward skiing capability by using:

- exercise metadata
- recovery rules
- capability targets
- recent training history
- pain and effort feedback
- estimated readiness
- estimated warm-up state
- variation rules

There are no fixed workouts, snack mode, or user-selected plans, and **no concept of time-to-goal** — no deadlines, countdowns, or seasons. The engine only ever reasons about the athlete's current state (see [Core Principle](#9-core-principle) below). Everything is expressed as a repeated loop:

```
GET /next
→ user performs action
→ POST /result
→ engine records the event
→ GET /next
```

## 9. Core Principle

SkiPrepCoach is not a workout calendar.

It is a closed-loop coaching engine.

Each recommendation is based on the current state of the athlete, and each completed action changes that state. The engine has no concept of calendar time, deadlines, or seasons — it never reasons about "days until ski season" or paces itself against a target date. It only ever answers "what's the best next action given exactly where things stand right now."

**Derived state, not stored state.** The only things SkiPrepCoach ever persists are the [user profile](./02-capabilities.md#21-user-profile), the [event log](./04-history-and-readiness.md#29-user-activity-history) of every action performed, and each day's manually-entered [readiness](./04-history-and-readiness.md#210-readiness-state) input. Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are never separately written or mutated — they're pure functions of the event log, recomputed whenever they're needed. This means there's no "current state" document that can drift out of sync with what actually happened; the event log is the only source of truth, and everything else is just a lens on it. It's also what makes [onboarding](./05-server-api.md#33-logging-without-a-recommendation) simple — bootstrapping a new user is nothing more than inserting a few weeks of backdated events, since there's no separate initial state to seed.

The app's intelligence comes from the quality of:

- the exercise metadata
- the recovery model
- the capability model
- the user history
- the `next` decision logic

The UI exists only to show the next action and collect the result.

---

[← Index](../README.md) · Next: [Capabilities →](./02-capabilities.md)
