# 3. Server API

[← Index](../README.md) · Previous: [History & Readiness](./04-history-and-readiness.md) · Next: [Decision Pipeline →](./06-decision-pipeline.md)

## 3.1 Get Next Action

```
GET /api/users/{userId}/next
```

A `recommendationId` is generated whenever a new `nextAction` (exercise **or** rest) is produced. Calling `GET /next` again before that recommendation is resolved returns the identical pinned recommendation (same `recommendationId`) rather than recomputing — this prevents the action changing out from under the user mid-session. A pending recommendation that's never resolved expires and is recomputed fresh after 4 hours.

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

## 3.2 Submit Result

```
POST /api/users/{userId}/results
```

Body:

```json
{
  "recommendationId": "rec-20260704-001",
  "exerciseId": "wall_sit",
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

Server responsibilities:

1. Store event.
2. Update warmth.
3. Update fatigue.
4. Update capability estimates.
5. Update daily progress.
6. Update recovery predictions.
7. Make next recommendation available.

---

[← Index](../README.md) · Previous: [History & Readiness](./04-history-and-readiness.md) · Next: [Decision Pipeline →](./06-decision-pipeline.md)
