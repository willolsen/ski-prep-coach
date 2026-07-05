# Data Model: User Profile & Capabilities (2.1–2.4)

[← Index](../README.md) · Previous: [Purpose & Core Principle](./01-purpose-and-principles.md) · Next: [Exercises & Recovery →](./03-exercises-and-recovery.md)

Part of **2. Core Data Objects**. This file covers 2.1–2.4 (the user and capability model). Exercises and recovery live in [2.5–2.8](./03-exercises-and-recovery.md); history, readiness, and warmth live in [2.9–2.11](./04-history-and-readiness.md).

## 2.1 User Profile

Stores stable user-level information.

```json
{
  "userId": "user-001",
  "displayName": "Will",
  "primaryGoal": "ski_resilience",
  "timezone": "America/Los_Angeles",
  "availableEquipment": [
    "gym",
    "dumbbells",
    "barbell",
    "bike",
    "rollerblades",
    "pickleball_court",
    "hiking_trails"
  ],
  "constraints": {
    "kneeSensitivity": true,
    "lowBackCaution": true,
    "avoidBulking": true
  },
  "preferences": {
    "likes": ["rollerblading", "hiking", "pickleball"],
    "dislikes": [],
    "preferredSessionStyle": "next_action"
  }
}
```

Used by `next` logic to filter exercises, prioritize goals, and bias recommendations toward enjoyable options.

`timezone` defines the athlete's local day boundary — daily stimulus ([Step 4](./06-decision-pipeline.md#step-4--determine-whether-enough-has-been-done-today)) and recovery-class `maxPerDay` counters ([2.8](./03-exercises-and-recovery.md#28-recovery-classes)) reset at local midnight in this timezone.

There is deliberately no `targetDate` or deadline field — the engine has no concept of time remaining toward a goal.

## 2.2 Capability Definitions

Capabilities are things the engine tries to improve.

```json
{
  "capabilities": {
    "knee_capacity": {
      "name": "Knee Capacity",
      "icon": "🦵",
      "priority": 10,
      "description": "Ability of knees and surrounding tissues to tolerate skiing-relevant load."
    },
    "lower_body_strength": {
      "name": "Lower Body Strength",
      "icon": "🦿",
      "priority": 9
    },
    "posterior_chain": {
      "name": "Posterior Chain",
      "icon": "🍑",
      "priority": 8
    },
    "balance": {
      "name": "Balance",
      "icon": "⚖",
      "priority": 9
    },
    "mobility": {
      "name": "Mobility",
      "icon": "🤸",
      "priority": 7
    },
    "aerobic_endurance": {
      "name": "Aerobic Endurance",
      "icon": "🚴",
      "priority": 7
    },
    "stamina": {
      "name": "Stamina",
      "icon": "🔥",
      "priority": 8
    },
    "reaction": {
      "name": "Reaction",
      "icon": "⚡",
      "priority": 6
    },
    "upper_body_strength": {
      "name": "Upper Body Strength",
      "icon": "💪",
      "priority": 5
    },
    "fall_resilience": {
      "name": "Fall Resilience",
      "icon": "🛡",
      "priority": 6
    }
  }
}
```

Used to score candidate actions. Higher-priority capabilities receive more weight, especially if currently undertrained or limiting.

## 2.3 Capability Targets

Each capability's target score is **derived from its priority** rather than hand-authored as a separate number, so the two can't drift out of sync:

```
target = min(100, 25 + 5 × priority)
```

| capability | priority | target |
|---|---|---|
| knee_capacity | 10 | 75 |
| lower_body_strength | 9 | 70 |
| balance | 9 | 70 |
| posterior_chain | 8 | 65 |
| stamina | 8 | 65 |
| mobility | 7 | 60 |
| aerobic_endurance | 7 | 60 |
| reaction | 6 | 55 |
| fall_resilience | 6 | 55 |
| upper_body_strength | 5 | 50 |

Capability scores ([2.4](#24-user-capability-state)) are on a 0–100 scale, measured against these targets. Targets drive [Step 5](./06-decision-pipeline.md#step-5--identify-limiting-capabilities) (limiting capabilities) and [Step 4](./06-decision-pipeline.md#step-4--determine-whether-enough-has-been-done-today) (daily stimulus).

## 2.4 User Capability State

Stores the current estimate of user ability, on a 0–100 scale (see [2.3](#23-capability-targets) for targets).

```json
{
  "userId": "user-001",
  "capabilities": {
    "knee_capacity": {
      "score": 22,
      "trend": "improving",
      "lastTrainedAt": "2026-07-04T09:20:00-07:00",
      "fatigue": 12
    },
    "lower_body_strength": {
      "score": 18,
      "trend": "stable",
      "lastTrainedAt": "2026-07-03T16:00:00-07:00",
      "fatigue": 30
    },
    "balance": {
      "score": 28,
      "trend": "improving",
      "lastTrainedAt": "2026-07-04T11:30:00-07:00",
      "fatigue": 4
    }
  }
}
```

Fields:

- `score`: 0–100, measured against the target in [2.3](#23-capability-targets).
- `trend`: improving, stable, declining, unknown.
- `lastTrainedAt`: used for recovery and variation.
- `fatigue`: current decayed fatigue for that capability (see [2.8](./03-exercises-and-recovery.md#28-recovery-classes) for the decay formula).

---

[← Index](../README.md) · Previous: [Purpose & Core Principle](./01-purpose-and-principles.md) · Next: [Exercises & Recovery →](./03-exercises-and-recovery.md)
