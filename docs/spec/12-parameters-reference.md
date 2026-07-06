# Resolved Parameters Reference

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Data Layer →](./13-data-layer.md)

Quick lookup for every constant/formula decided during spec review, so implementation doesn't have to re-derive them:

| Parameter | Value |
|---|---|
| Persisted state | **only** the event log ([User Activity History](./04-history-and-readiness.md#user-activity-history)), user profile ([User Profile](./02-capabilities.md#user-profile)), and each day's readiness entry ([Readiness State](./04-history-and-readiness.md#readiness-state)). Capability score, fatigue, warmth, pain-risk flags, variation history, and daily progress are all computed from the event log on demand, never separately stored ([Submitting a Result](./07-result-processing.md)) |
| Capability score scale | 0–100 |
| Capability target formula | `min(100, 25 + 5 × priority)` ([Capability Targets](./02-capabilities.md#capability-targets)) |
| Daily stimulus target | fixed **70**, same for every user/day ([Determine Whether Enough Has Been Done Today](./06-decision-pipeline.md#determine-whether-enough-has-been-done-today)) |
| Capability growth learning rate | **0.1** ([Capability Score Growth](./07-result-processing.md#capability-score-growth)) |
| Movement pattern taxonomy | squat, hinge, lunge, push, pull, rotation, gait_locomotion ([Movement Patterns](./03-exercises-and-recovery.md#movement-patterns)) |
| Recovery bucket scope | per `(movementPattern, recoveryClass)` pair, not per exercise ([Recovery Classes](./03-exercises-and-recovery.md#recovery-classes)) |
| Fatigue model | single bucket-scoped model (`fatigueCost` is now a scalar, not per-capability); decayed sum over historical events in that bucket, half-life = that bucket's `recoveryClass.halfLifeHours` ([Fatigue](./07-result-processing.md#fatigue)) |
| `halfLifeHours` defaults | daily 9h, light 18h, moderate 36h, heavy_strength 72h, max_strength 108h, plyometric 72h, hiit 72h |
| Aggregate fatigue | **MAX** across all buckets of current bucket fatigue (not a sum); readiness yellow at ≥60, safety-veto red at ≥100 ([Readiness State](./04-history-and-readiness.md#readiness-state), [Safety Veto](./06-decision-pipeline.md#safety-veto)) — starting thresholds, tune once there's real usage data |
| Warmth decay half-life | **20 minutes**, same for general and per-movement-pattern warmth ([Warmth](./07-result-processing.md#warmth)) |
| Warmth model | two numbers, not one: `generalWarmth` (all recent events) and `patternWarmth[p]` (filtered to movement pattern `p`) — each exercise has its own `generalWarmthRequired` and `movementPatternWarmthRequired` scalar, checked independently ([Exercise Definition](./03-exercises-and-recovery.md#exercise-definition), [Warmth State](./04-history-and-readiness.md#warmth-state)) |
| Exercise cross-references | **none** — `substitutes`/`regressions`/`progressions` are not stored; computed from `familyId` + `movementPattern` + `progressionLevel` at query time ([Exercise Definition](./03-exercises-and-recovery.md#exercise-definition), [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)) |
| Movement pattern restrictions | replaces the earlier per-condition `constraints` object; a map of movementPattern → `"mild"` (recoveryClass daily/light only) or `"avoid"` (excluded entirely) ([User Profile](./02-capabilities.md#user-profile), [Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions)) |
| `actual.difficulty` enum | `"too_easy" \| "easy" \| "normal" \| "hard" \| "too_hard"` ([User Activity History](./04-history-and-readiness.md#user-activity-history)) |
| Capability `trend` | **cut for MVP** — required replaying the score fold twice per capability for a "meaningfully different" threshold that was never defined; revisit with real usage data ([Capability State (Derived)](./02-capabilities.md#capability-state-derived)) |
| Limiting-capability scoring boost | 1.5× ([Identify Limiting Capabilities](./06-decision-pipeline.md#identify-limiting-capabilities) / [Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)) |
| Enjoyment bonus | flat **+10** ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)) |
| Risk penalty | riskLevel baseline (low 0 / moderate 5 / high 15) **+30** if `elevatedRisk` flagged ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions), [Pain Risk](./07-result-processing.md#pain-risk)) |
| Repetition penalty | recency-decayed over ~3 days ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions) / [Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules)) |
| `recommendationId` lifecycle | pinned until resolved via `POST /result`, or recomputed after a 4h timeout checked against the request's `now`, not the database's clock ([Get Next Action](./05-server-api.md#get-next-action)) |
| Equipment/location context | not modeled for MVP; all `availableEquipment` assumed accessible ([Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions)) |
| Dose progression ("level") | purely per-exercise history-driven; no separate level field ([Select Dose](./06-decision-pipeline.md#select-dose)) |
| Readiness inputs | manual entry only for MVP; no biometric/wearable integration; submitted via a dedicated endpoint ([Submit Readiness](./05-server-api.md#submit-readiness)) that derives `date` and `computedStatus` rather than accepting them directly ([Readiness State](./04-history-and-readiness.md#readiness-state)) |
| Day boundary | no stored timezone — the client sends `timezone` with every `GET /next` call and every write ([Get Next Action](./05-server-api.md#get-next-action), [User Activity History](./04-history-and-readiness.md#user-activity-history)); resets at local midnight in whichever timezone was current at the time |
| `now` | always an explicit input (optional on [Get Next Action](./05-server-api.md#get-next-action)/[Submit Readiness](./05-server-api.md#submit-readiness), defaulting to the real clock only at the HTTP edge if omitted), threaded unchanged through every derivation and query for that request; never read ambiently from the server or database clock — see the [Core Principle](./11-core-principle.md) |
| Rest actions | same recommendation lifecycle as exercises; logged as an event once acknowledged ([User Activity History](./04-history-and-readiness.md#user-activity-history), [Get Next Action](./05-server-api.md#get-next-action)) |
| Logging without a recommendation | one endpoint covers both onboarding (`source: "onboarding"`, backfilled pre-first-use history) and self-directed logging (`source: "self_directed"`, an exercise done that wasn't recommended); same schema and full weight as live events, no `recommendationId` needed ([Logging Without a Recommendation](./05-server-api.md#logging-without-a-recommendation)) |
| Notes | `actual.notes` is free text on every event regardless of source; stored verbatim, read by no current derivation, kept for possible future use ([User Activity History](./04-history-and-readiness.md#user-activity-history)) |
| Time-to-goal concept | **none** — no deadlines, countdowns, or seasons anywhere in the engine ([Core Principle](./11-core-principle.md)) |
| Goal labeling | **none** — no `primaryGoal` field; which capabilities exist and how they're prioritized already implies the goal, so a separate label would be redundant ([User Profile](./02-capabilities.md#user-profile)) |
| Database | PostgreSQL everywhere (local Docker, AWS RDS, Azure Database for PostgreSQL) — recursive CTEs handle the capability-score fold, `jsonb` handles the variable `prescribed`/`actual` shape ([Data Layer](./13-data-layer.md)) |
| Server framework | Hono, not Express — official adapters for Node (local/container) and AWS Lambda; one shared app module, a thin entry point per deployment target ([Server Framework & Deployment](./14-server-framework.md)) |

---

[← Index](../README.md) · Previous: [MVP Development Order](./10-mvp-development-order.md) · Next: [Data Layer →](./13-data-layer.md)
