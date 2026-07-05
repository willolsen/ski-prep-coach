# Data Model: History, Readiness & Warmth (2.9–2.11)

[← Index](../README.md) · Previous: [Exercises & Recovery](./03-exercises-and-recovery.md) · Next: [Server API →](./05-server-api.md)

Part of **2. Core Data Objects**. This file covers 2.9–2.11. User/capability model lives in [2.1–2.4](./02-capabilities.md); exercises and recovery live in [2.5–2.8](./03-exercises-and-recovery.md).

## 2.9 User Activity History

Every completed or attempted action is stored as an event — including acknowledged `rest` recommendations (see [3.1](./05-server-api.md#31-get-next-action)), which log the same way as exercise results.

```json
{
  "events": [
    {
      "eventId": "evt-001",
      "userId": "user-001",
      "type": "exercise_result",
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

Used to update capability, fatigue, warmth, exercise variation, readiness, and progression.

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

Rules:

- Red if swelling, limp, or pain ≥4.
- Yellow if pain 2–3, poor sleep, or elevated fatigue.
- Green if low pain, no swelling, normal movement, and acceptable fatigue.

Used early in the `next` pipeline.

## 2.11 Warmth State

Warmth is computed, not manually selected.

```json
{
  "warmth": {
    "score": 42,
    "state": "warm",
    "updatedAt": "2026-07-04T09:04:00-07:00",
    "source": "computed"
  }
}
```

Suggested states:

```json
{
  "cold": "0-19",
  "slightly_warm": "20-39",
  "warm": "40-69",
  "very_warm": "70-89",
  "fatigued": "90+ with high fatigue"
}
```

Warmth increases after movement and decays with inactivity.

Example warmth effects:

```json
{
  "walk_5_min": 10,
  "mobility_light": 8,
  "wall_sit": 8,
  "bodyweight_squat": 12,
  "heavy_strength": 25,
  "rollerblade_20_min": 35
}
```

Used to block cold-unsafe exercises and sequence actions naturally.

---

[← Index](../README.md) · Previous: [Exercises & Recovery](./03-exercises-and-recovery.md) · Next: [Server API →](./05-server-api.md)
