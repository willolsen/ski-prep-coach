# 3. Server API

[← Index](../README.md) · Previous: [History & Readiness](./04-history-and-readiness.md) · Next: [Decision Pipeline →](./06-decision-pipeline.md)

## 3.1 Get Next Action

```
GET /api/users/{userId}/next?timezone=America/Los_Angeles&now=2026-07-04T09:00:00-07:00
```

`timezone` is required — there's no stored user-level timezone (2.1) to fall back on. The engine needs the athlete's *current* local timezone to compute "today" for daily stimulus ([Step 4](./06-decision-pipeline.md#step-4--determine-whether-enough-has-been-done-today)) and recovery-class daily counts ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)), and the client is the only party that reliably knows it right now.

`now` is **optional** — an ISO8601 instant. If omitted, the server substitutes its own real clock. If supplied, that value is what "now" means for every derivation this call touches (fatigue decay, warmth decay, daily stimulus, recovery windows, repetition recency, recommendation expiry) — see the [Core Principle](./01-purpose-and-principles.md#9-core-principle) note on why time is threaded through explicitly rather than read ambiently. A real client just always passes the actual current time; this parameter mainly exists so a test can simulate "3 days later" without waiting or faking the system clock.

A `recommendationId` is generated whenever a new `nextAction` (exercise **or** rest) is produced. Calling `GET /next` again before that recommendation is resolved returns the identical pinned recommendation (same `recommendationId`) rather than recomputing — this prevents the action changing out from under the user mid-session. A pending recommendation that's never resolved expires and is recomputed fresh after 4 hours, checked against the same `now`.

Rest is not a special case in this lifecycle: it gets a `recommendationId` like any other action and is resolved via `POST /result` (a lightweight acknowledgment), which logs a `rest` event in history exactly like an exercise result does.

Returns:

```json
{
  "nextAction": {
    "type": "exercise",
    "recommendationId": "rec-20260704-001",
    "exerciseId": "wall_sit",
    "title": "Wall Sit",
    "icon": "🧍",
    "prescription": {
      "sets": 3,
      "durationSec": 30,
      "restSec": 60,
      "targetRpe": 5,
      "painLimit": 3
    },
    "estimatedDurationSec": 210,
    "instructions": [
      "Lean against a wall with feet hip-width apart.",
      "Slide down only as far as comfortable.",
      "Keep knees aligned with feet.",
      "Stop if pain exceeds 3/10."
    ],
    "completionQuestions": [
      "How many sets did you complete?",
      "What was the highest pain level?",
      "What was the effort level, 1-10?",
      "Anything unusual?"
    ],
    "why": [
      "Knee capacity is currently a high-priority capability.",
      "Wall sits provide useful tendon and quadriceps stimulus with low movement stress.",
      "You are not warm enough for heavier lower-body strength work yet."
    ]
  },
  "todayProgress": {
    "status": "in_progress",
    "stimulusScore": 38,
    "targetStimulusScore": 70,
    "percentComplete": 54
  },
  "stateSummary": {
    "readiness": "green",
    "warmth": "slightly_warm",
    "limitingCapabilities": ["knee_capacity", "lower_body_strength"]
  }
}
```

If rest is best:

```json
{
  "nextAction": {
    "type": "rest",
    "recommendationId": "rec-20260704-002",
    "title": "Rest Is the Best Next Action",
    "estimatedDurationSec": null,
    "instructions": [
      "No more training is recommended right now.",
      "Normal walking and daily activity are fine.",
      "Resume when the app recommends another action."
    ],
    "completionQuestions": [],
    "why": [
      "You have already reached today's useful training stimulus.",
      "Additional lower-body work would create more fatigue than adaptation.",
      "Recovery now increases the chance of productive training tomorrow."
    ]
  },
  "todayProgress": {
    "status": "complete",
    "stimulusScore": 76,
    "targetStimulusScore": 70,
    "percentComplete": 100
  }
}
```

The rest recommendation is acknowledged via the same `POST /result` endpoint (3.2), typically with a minimal `actual` payload, which resolves the pinned recommendation and logs the event.

Note that a pending recommendation isn't the only thing a user can act on — see [3.3](#33-logging-without-a-recommendation) for logging an exercise that wasn't the recommended action.

## 3.2 Submit Result

```
POST /api/users/{userId}/results
```

Body:

```json
{
  "recommendationId": "rec-20260704-001",
  "exerciseId": "wall_sit",
  "timezone": "America/Los_Angeles",
  "startedAt": "2026-07-04T09:00:00-07:00",
  "completedAt": "2026-07-04T09:04:00-07:00",
  "actual": {
    "setsCompleted": 3,
    "durationSecCompleted": 90,
    "maxPain": 1,
    "rpe": 5,
    "difficulty": "normal",
    "notes": "Felt good."
  }
}
```

`timezone` is the client's current timezone at submission time, stored on the event itself (2.9) rather than looked up from a profile — see [2.9](./04-history-and-readiness.md#29-user-activity-history) for why it's captured per-event instead of per-user.

Returns:

```json
{
  "status": "ok",
  "eventId": "evt-001"
}
```

Server responsibility: **store the event** ([5.1](./07-result-processing.md#51-store-event)). That's the entire write. Warmth, fatigue, capability score, recovery eligibility, and daily progress are all derived from the event log on the next `GET /next` call ([Section 5](./07-result-processing.md)) — there's nothing else to update.

`actual.notes` is free text and is stored verbatim. Nothing in the engine reads it today — see [2.9](./04-history-and-readiness.md#29-user-activity-history) for why it's captured anyway.

## 3.3 Logging Without a Recommendation

```
POST /api/users/{userId}/log
```

Not every logged exercise follows a `GET /next` recommendation. Two situations need to insert an `exercise_result` event directly, with no preceding recommendation to resolve:

- **Onboarding** (`source: "onboarding"`) — backfilling roughly the last few weeks before a first-time user's first real `GET /next` call, so the engine isn't starting from a blank slate.
- **Self-directed** (`source: "self_directed"`) — the user did something on their own that wasn't the recommended action (went for a bike ride, did their own thing at the gym instead of the suggested Wall Sit, etc.) and wants it logged.

Both are the same mechanism — inserting ordinary events with no `recommendationId` — so they share one endpoint, distinguished only by `source` and by whether `occurredAt` is in the past (onboarding) or effectively now (self-directed).

Body (batch, as onboarding typically needs; a self-directed log is usually just one entry):

```json
{
  "entries": [
    {
      "exerciseId": "bodyweight_squat",
      "source": "onboarding",
      "timezone": "America/Los_Angeles",
      "occurredAt": "2026-06-20T09:00:00-07:00",
      "actual": {
        "setsCompleted": 3,
        "reps": 10,
        "maxPain": 1,
        "rpe": 5
      }
    },
    {
      "exerciseId": "rollerblade_easy",
      "source": "self_directed",
      "timezone": "America/Los_Angeles",
      "occurredAt": "2026-07-05T18:30:00-07:00",
      "actual": {
        "durationSecCompleted": 1500,
        "maxPain": 0,
        "rpe": 4,
        "notes": "Beautiful evening, did an extra loop around the lake."
      }
    }
  ]
}
```

Each entry is stored as an ordinary `exercise_result` event ([2.9](./04-history-and-readiness.md#29-user-activity-history)) with `startedAt`/`completedAt` set from `occurredAt`. No `recommendationId` is needed or expected — unlike [3.2](#32-submit-result), these entries were never preceded by a `GET /next` call. Entries don't need a `prescribed` block either, since there was no prescription to compare against; dose ratio ([5.4](./07-result-processing.md#54-capability-score-growth)) falls back to 1.0.

Returns:

```json
{
  "status": "ok",
  "eventIds": ["evt-003", "evt-004"]
}
```

`timezone` is per-entry rather than one value for the whole batch, since an onboarding backfill can span weeks and, in principle, a trip through a different timezone — each entry's day-boundary calculations use whatever timezone was actually in effect for that entry.

No eligibility or safety check applies to logging itself — this endpoint is a factual record of what the user says happened, not a request for a recommendation, so there's nothing to veto. Its consequences (fatigue added to the relevant bucket, capability growth, a possible `elevatedRisk` flag if pain was high) show up automatically the next time those are derived ([Section 5](./07-result-processing.md)), the same as for any other event.

Logging here has no effect on any currently pending recommendation from `GET /next` ([3.1](#31-get-next-action)) — it's untouched, and still resolves normally via `POST /result` or expires after its usual 4-hour timeout.

There's no hard limit on how far back `occurredAt` can go, but only the last few days matter for fatigue/warmth — both fully decay well within a couple of weeks ([5.2](./07-result-processing.md#52-warmth), [5.3](./07-result-processing.md#53-fatigue)) regardless of what's backfilled. Older entries still help by giving the capability score replay ([5.4](./07-result-processing.md#54-capability-score-growth)) a more accurate starting point than assuming zero prior training.

## 3.4 Submit Readiness

```
POST /api/users/{userId}/readiness
```

Body:

```json
{
  "now": "2026-07-04T07:30:00-07:00",
  "timezone": "America/Los_Angeles",
  "painNow": 1,
  "morningStiffness": "none",
  "swelling": false,
  "stairs": "easy",
  "sleepQuality": "good"
}
```

`painNow`/`morningStiffness`/`swelling`/`stairs`/`sleepQuality` are defined in [2.10](./04-history-and-readiness.md#210-readiness-state).

Like [3.1](#31-get-next-action), `now` is optional (defaults to the server's real clock) and exists for the same reason: simulating a specific moment in tests. Unlike `GET /next`, here `now` also determines *which day's entry this is* — `date` (2.10) is derived as `now` converted into the given `timezone`'s calendar date, not submitted directly. Computing it this way rather than accepting a raw date string keeps it consistent with every other day-boundary calculation in the system (Step 4, 2.8, 5.7), all of which derive "today" from `(now, timezone)` the same way.

`computedStatus` (2.10) is derived and stored at submission time from the fields above **and** `aggregateFatigue` ([2.10](./04-history-and-readiness.md#210-readiness-state)) computed as of this same `now`.

Returns:

```json
{
  "date": "2026-07-04",
  "computedStatus": "green"
}
```

Submitting again for the same derived `date` overwrites the previous entry for that day (upsert on `(userId, date)`) — useful if something changes later in the day (pain worsens, a nap improves things) and the user wants to update it.

---

[← Index](../README.md) · Previous: [History & Readiness](./04-history-and-readiness.md) · Next: [Decision Pipeline →](./06-decision-pipeline.md)
