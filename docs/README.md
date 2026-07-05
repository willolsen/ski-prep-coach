# SkiPrepCoach — Core Engine Specification v0.2

SkiPrepCoach is a server-side decision engine that answers one question: **what is the best next action for this user right now?** The client is thin — it displays the recommended action, collects the result, and sends it back. See [Purpose & Core Principle](./spec/01-purpose-and-principles.md) for the full framing.

The spec is split into one file per part, so each can be read, edited, or reviewed independently.

## Contents

| # | File | Covers |
|---|---|---|
| 1, 9 | [Purpose & Core Principle](./spec/01-purpose-and-principles.md) | What the engine is, the `GET /next` → `POST /result` loop, and the closed-loop (no fixed plans, no time-to-goal) philosophy |
| 2.1–2.4 | [Data Model: User Profile & Capabilities](./spec/02-capabilities.md) | User profile, capability definitions, derived capability targets, capability state |
| 2.5–2.8 | [Data Model: Exercises & Recovery](./spec/03-exercises-and-recovery.md) | Movement pattern taxonomy, exercise schema (built on [free-exercise-db](https://github.com/yuhonas/free-exercise-db)), prescriptions, recovery classes & fatigue decay |
| 2.9–2.11 | [Data Model: History & Readiness](./spec/04-history-and-readiness.md) | Activity history events, readiness state, warmth state |
| 3 | [Server API](./spec/05-server-api.md) | `GET /next` and `POST /result` |
| 4 | [Next Decision Pipeline](./spec/06-decision-pipeline.md) | The 10-step algorithm from loading state to building the explanation |
| 5 | [Result Processing Logic](./spec/07-result-processing.md) | How a submitted result updates warmth, fatigue, capability scores, pain risk, and variation history |
| 6 | [Daily Progress](./spec/08-daily-progress.md) | The "have we done enough today" view |
| 7 | [Initial MVP Exercise Set](./spec/09-mvp-exercises.md) | The starter exercise list and what's custom vs. free-exercise-db-sourced |
| 8 | [MVP Development Order](./spec/10-mvp-development-order.md) | Build sequence |
| 10 | [Resolved Parameters Reference](./spec/11-parameters-reference.md) | Every constant/formula decided during spec review, in one lookup table |

## Reading order

For a first read-through, follow the table top to bottom — each file links to the next and previous at top and bottom. To work on one part in isolation, jump straight to its file; cross-references to other sections are linked inline.
