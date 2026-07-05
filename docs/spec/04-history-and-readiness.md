# Data Model: History, Readiness & Warmth (2.9–2.11)

[← Index](../README.md) · Previous: [Exercises & Recovery](./03-exercises-and-recovery.md) · Next: [Server API →](./05-server-api.md)

Part of **2. Core Data Objects**. This file covers 2.9–2.11. User/capability model lives in [2.1–2.4](./02-capabilities.md); exercises and recovery live in [2.5–2.8](./03-exercises-and-recovery.md).

## 2.9 User Activity History

Every completed or attempted action is stored as an event — including acknowledged `rest` recommendations (see [3.1](./05-server-api.md#31-get-next-action)), which log the same way as exercise results. **This is the only behavioral state SkiPrepCoach persists.** Capability score, fatigue, warmth, pain-risk flags, and daily progress are not stored anywhere else — they're all computed from this event log on demand (see [Section 5](./07-result-processing.md)).

```json
{
  "events": [
    {
      "eventId": "evt-001",
      "userId": "user-001",
      "type": "exercise_result",
      "source": "live",
      "timezone": "America/Los_Angeles",
      "startedAt": "2026-07-04T09:00:00-07:00",
      "completedAt": "2026-07-04T09:04:00-07:00",
      "exerciseId": "wall_sit",
      "prescribed": {
        "sets": 3,
        "durationSec": 30,
        "restSec": 60
      },
      "actual": {
        "setsCompleted": 3,
        "durationSecCompleted": 90,
        "load": "bodyweight",
        "maxPain": 1,
        "rpe": 5,
        "difficulty": "normal",
        "notes": "Felt fine."
      }
    }
  ]
}
```

A `rest` event looks the same but simpler — no `exerciseId`, `prescribed`, or dose-related fields, since there was no exercise or prescription:

```json
{
  "eventId": "evt-002",
  "userId": "user-001",
  "type": "rest",
  "source": "live",
  "timezone": "America/Los_Angeles",
  "startedAt": "2026-07-04T15:00:00-07:00",
  "completedAt": "2026-07-04T15:00:05-07:00",
  "actual": {
    "notes": "Took the afternoon off as suggested."
  }
}
```

`source` is `"live"` for events logged through the normal `GET /next` → `POST /result` loop, or one of `"onboarding"` / `"self_directed"` for events inserted directly through [3.3](./05-server-api.md#33-logging-without-a-recommendation) (backfilled pre-first-use history, or an exercise the user did that wasn't the recommended action). All three are ordinary events and count identically in every derivation — `source` exists only for auditability (e.g. "show me what I logged myself vs. what the app recommended").

**`timezone`** is supplied by the client with every write (3.2, 3.3) — there is no stored user-level timezone (2.1) to fall back on. It's stored per-event rather than assumed from a profile field so that day-boundary calculations ([5.7](./07-result-processing.md#57-daily-progress), [2.8](./03-exercises-and-recovery.md#28-recovery-classes)) stay correct even if the user's timezone changes over time (travel, relocation) — each event is grouped into "its" day using the timezone that was actually in effect when it happened, not whatever timezone happens to be current when the query runs.

**`actual.difficulty`** is one of `"too_easy" | "easy" | "normal" | "hard" | "too_hard"` — the user's own subjective read on the dose, distinct from the numeric `rpe`. Used alongside `rpe` and `maxPain` in [Step 9](./06-decision-pipeline.md#step-9--select-dose)'s dose adjustment.

**`actual.notes`** is free text, always available on any event regardless of `source`, and stored verbatim. No derivation formula in this spec reads it — it exists purely so the user's own commentary ("knee felt a little off on the last rep," "did this outside instead of at the gym") isn't lost. Since it's just another field on a stored event, it's already retrievable by reading history; a dedicated "read your notes" view can be added later with zero data-model changes.

Used to derive capability score, fatigue, warmth, pain risk, variation history, and daily progress ([Section 5](./07-result-processing.md)).

## 2.10 Readiness State

Computed from recent manual reports. For MVP this is **manual entry only** — no biometric/wearable integration. Garmin-shaped fields (resting HR, HRV, body battery, training readiness) are out of scope; `computedStatus` is derived only from the fields below. A biometric integration can be layered in later without changing the pipeline shape.

```json
{
  "date": "2026-07-04",
  "painNow": 1,
  "morningStiffness": "none",
  "swelling": false,
  "stairs": "easy",
  "sleepQuality": "good",
  "computedStatus": "green"
}
```

Fields:

- `painNow` — 0–10.
- `morningStiffness` — `"none" | "mild" | "significant"`.
- `swelling` — boolean.
- `stairs` — `"easy" | "difficult" | "unable"`.
- `sleepQuality` — `"good" | "fair" | "poor"`.
- `date` — **not submitted directly.** It's derived at write time ([3.4](./05-server-api.md#34-submit-readiness)) from the submitted `now` converted into the submitted `timezone`'s calendar date, the same way every other day-boundary in this spec is computed (Step 4, 2.8, 5.7) — kept out of client control so it can never disagree with those.
- `computedStatus` — derived and stored at write time (see below); the one place a history-dependent derived value is persisted rather than recomputed on read, because it needs to be cheap to check on every subsequent `GET /next` rather than replayed from scratch each time.

Rules:

- Red if `swelling`, `stairs` is `"difficult"` or `"unable"`, or `painNow` ≥4.
- Yellow if `painNow` 2–3, `sleepQuality` is `"poor"`, or `aggregateFatigue` ≥ 60.
- Green if low pain, no swelling, normal movement, and `aggregateFatigue` < 60.

`aggregateFatigue` is the single highest current bucket fatigue across all `(movementPattern, recoveryClass)` buckets ([5.3](./07-result-processing.md#53-fatigue)) — computed as of the same `now` submitted with this readiness entry, using whichever bucket is most taxed right now, not a sum across all of them. This is also what [Step 3](./06-decision-pipeline.md#step-3--safety-veto)'s "unsafe fatigue accumulation" veto checks, at a higher threshold (≥ 100). Both 60 and 100 are starting points to tune once there's real usage data.

Used early in the `next` pipeline.

## 2.11 Warmth State

Like capability state ([2.4](./02-capabilities.md#24-capability-state-derived)) and fatigue ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)), warmth is **not stored** — it's computed on demand from recent events. See [5.2](./07-result-processing.md#52-warmth) for the decay formula (20-minute half-life).

There are two numbers, not one — being generally warmed up doesn't mean a specific movement pattern is ready. A user could be generally warm from a walk, but still need dedicated warm-up before a heavy squat variant:

- **General warmth** — a decayed sum over *all* recent events, regardless of movement pattern. A rough whole-body "have I been moving at all recently" signal.
- **Per-pattern warmth** — the same decayed sum, but filtered to only events matching one specific movement pattern ([2.5](./03-exercises-and-recovery.md#25-movement-patterns)). Seven of these, one per pattern.

Example of what a computed warmth lookup returns:

```json
{
  "warmth": {
    "general": 42,
    "generalState": "warm",
    "byMovementPattern": {
      "squat": 8,
      "hinge": 35,
      "lunge": 0,
      "push": 12,
      "pull": 0,
      "rotation": 0,
      "gait_locomotion": 20
    }
  }
}
```

Suggested states, used only for the `general` number (a friendly label for display — per-pattern warmth is shown as a plain number, since it's mainly consumed by the `generalWarmthRequired`/`movementPatternWarmthRequired` comparison in [Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions) rather than shown to the user directly):

```json
{
  "cold": "0-19",
  "slightly_warm": "20-39",
  "warm": "40-69",
  "very_warm": "70+"
}
```

Each exercise carries its own flat `warmthEffect` scalar — a per-exercise field on the exercise definition (2.6), not a separate lookup table — contributed to *both* the general sum and its own movement pattern's sum per full-dose completion, decaying per [5.2](./07-result-processing.md#52-warmth). A brisk walk or heavy strength work naturally has a higher `warmthEffect` than a light mobility drill.

Each exercise's `generalWarmthRequired` and `movementPatternWarmthRequired` (2.6) are checked against these two numbers respectively in [Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions) — used to block cold-unsafe exercises and sequence actions naturally.

---

[← Index](../README.md) · Previous: [Exercises & Recovery](./03-exercises-and-recovery.md) · Next: [Server API →](./05-server-api.md)
