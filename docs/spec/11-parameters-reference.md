# 10. Resolved Parameters Reference

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Data Layer →](./12-data-layer.md)

Quick lookup for every constant/formula decided during spec review, so implementation doesn't have to re-derive them:

| Parameter | Value |
|---|---|
| Persisted state | **only** the event log ([2.9](./04-history-and-readiness.md#29-user-activity-history)), user profile ([2.1](./02-capabilities.md#21-user-profile)), and each day's readiness entry ([2.10](./04-history-and-readiness.md#210-readiness-state)). Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are all computed from the event log on demand, never separately stored ([Section 5](./07-result-processing.md)) |
| Capability score scale | 0–100 |
| Capability target formula | `min(100, 25 + 5 × priority)` ([2.3](./02-capabilities.md#23-capability-targets)) |
| Daily stimulus target | fixed **70**, same for every user/day ([Step 4](./06-decision-pipeline.md#step-4--determine-whether-enough-has-been-done-today)) |
| Capability growth learning rate | **0.1** ([5.4](./07-result-processing.md#54-capability-score-growth)) |
| Movement pattern taxonomy | squat, hinge, lunge, push, pull, rotation, gait_locomotion ([2.5](./03-exercises-and-recovery.md#25-movement-patterns)) |
| Recovery bucket scope | per `(movementPattern, recoveryClass)` pair, not per exercise ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)) |
| Fatigue model | single bucket-scoped model (`fatigueCost` is now a scalar, not per-capability); decayed sum over historical events in that bucket, half-life = that bucket's `recoveryClass.halfLifeHours` ([5.3](./07-result-processing.md#53-fatigue)) |
| `halfLifeHours` defaults | daily 9h, light 18h, moderate 36h, heavy_strength 72h, max_strength 108h, plyometric 72h, hiit 72h |
| Aggregate fatigue | **MAX** across all buckets of current bucket fatigue (not a sum); readiness yellow at ≥60, safety-veto red at ≥100 ([2.10](./04-history-and-readiness.md#210-readiness-state), [Step 3](./06-decision-pipeline.md#step-3--safety-veto)) — starting thresholds, tune once there's real usage data |
| Warmth decay half-life | **20 minutes**, same for general and per-movement-pattern warmth ([5.2](./07-result-processing.md#52-warmth)) |
| Warmth model | two numbers, not one: `generalWarmth` (all recent events) and `patternWarmth[p]` (filtered to movement pattern `p`) — each exercise has its own `generalWarmthRequired` and `movementPatternWarmthRequired` scalar, checked independently ([2.6](./03-exercises-and-recovery.md#26-exercise-definition), [2.11](./04-history-and-readiness.md#211-warmth-state)) |
| Exercise cross-references | **none** — `substitutes`/`regressions`/`progressions` are not stored; computed from `familyId` + `movementPattern` + `progressionLevel` at query time ([2.6](./03-exercises-and-recovery.md#26-exercise-definition), [Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) |
| Movement pattern restrictions | replaces the earlier per-condition `constraints` object; a map of movementPattern → `"mild"` (recoveryClass daily/light only) or `"avoid"` (excluded entirely) ([2.1](./02-capabilities.md#21-user-profile), [Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions)) |
| `actual.difficulty` enum | `"too_easy" \| "easy" \| "normal" \| "hard" \| "too_hard"` ([2.9](./04-history-and-readiness.md#29-user-activity-history)) |
| Capability `trend` | **cut for MVP** — required replaying the score fold twice per capability for a "meaningfully different" threshold that was never defined; revisit with real usage data ([2.4](./02-capabilities.md#24-capability-state-derived)) |
| Limiting-capability scoring boost | 1.5× ([Step 5](./06-decision-pipeline.md#step-5--identify-limiting-capabilities) / [Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)) |
| Enjoyment bonus | flat **+10** ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)) |
| Risk penalty | riskLevel baseline (low 0 / moderate 5 / high 15) **+30** if `elevatedRisk` flagged ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions), [5.5](./07-result-processing.md#55-pain-risk)) |
| Repetition penalty | recency-decayed over ~3 days ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions) / [Step 8](./06-decision-pipeline.md#step-8--apply-variation-rules)) |
| `recommendationId` lifecycle | pinned until resolved via `POST /result`, or recomputed after a 4h timeout checked against the request's `now`, not the database's clock ([3.1](./05-server-api.md#31-get-next-action)) |
| Equipment/location context | not modeled for MVP; all `availableEquipment` assumed accessible ([Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions)) |
| Dose progression ("level") | purely per-exercise history-driven; no separate level field ([Step 9](./06-decision-pipeline.md#step-9--select-dose)) |
| Readiness inputs | manual entry only for MVP; no biometric/wearable integration; submitted via a dedicated endpoint ([3.4](./05-server-api.md#34-submit-readiness)) that derives `date` and `computedStatus` rather than accepting them directly ([2.10](./04-history-and-readiness.md#210-readiness-state)) |
| Day boundary | no stored timezone — the client sends `timezone` with every `GET /next` call and every write ([3.1](./05-server-api.md#31-get-next-action), [2.9](./04-history-and-readiness.md#29-user-activity-history)); resets at local midnight in whichever timezone was current at the time |
| `now` | always an explicit input (optional on [3.1](./05-server-api.md#31-get-next-action)/[3.4](./05-server-api.md#34-submit-readiness), defaulting to the real clock only at the HTTP edge if omitted), threaded unchanged through every derivation and query for that request; never read ambiently from the server or database clock — see the [Core Principle](./01-purpose-and-principles.md#9-core-principle) |
| Rest actions | same recommendation lifecycle as exercises; logged as an event once acknowledged ([2.9](./04-history-and-readiness.md#29-user-activity-history), [3.1](./05-server-api.md#31-get-next-action)) |
| Logging without a recommendation | one endpoint covers both onboarding (`source: "onboarding"`, backfilled pre-first-use history) and self-directed logging (`source: "self_directed"`, an exercise done that wasn't recommended); same schema and full weight as live events, no `recommendationId` needed ([3.3](./05-server-api.md#33-logging-without-a-recommendation)) |
| Notes | `actual.notes` is free text on every event regardless of source; stored verbatim, read by no current derivation, kept for possible future use ([2.9](./04-history-and-readiness.md#29-user-activity-history)) |
| Time-to-goal concept | **none** — no deadlines, countdowns, or seasons anywhere in the engine ([Core Principle](./01-purpose-and-principles.md#9-core-principle)) |
| Goal labeling | **none** — no `primaryGoal` field; which capabilities exist and how they're prioritized already implies the goal, so a separate label would be redundant ([2.1](./02-capabilities.md#21-user-profile)) |
| Database | PostgreSQL everywhere (local Docker, AWS RDS, Azure Database for PostgreSQL) — recursive CTEs handle the capability-score fold, `jsonb` handles the variable `prescribed`/`actual` shape ([Section 11](./12-data-layer.md)) |
| Server framework | Hono, not Express — official adapters for Node (local/container) and AWS Lambda; one shared app module, a thin entry point per deployment target ([Section 12](./13-server-framework.md)) |

---

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Data Layer →](./12-data-layer.md)
