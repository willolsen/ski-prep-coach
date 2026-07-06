# Purpose

[← Index](../README.md) · Next: [Capabilities →](./02-capabilities.md)

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

There are no fixed workouts, snack mode, or user-selected plans, and **no concept of time-to-goal** — no deadlines, countdowns, or seasons. The engine only ever reasons about the athlete's current state (see [Core Principle](./11-core-principle.md) for the full reasoning). Everything is expressed as a repeated loop:

```
GET /next
→ user performs action
→ POST /result
→ engine records the event
→ GET /next
```

---

[← Index](../README.md) · Next: [Capabilities →](./02-capabilities.md)
