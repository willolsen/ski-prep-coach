# MVP Development Order

[← Index](../README.md) · Previous: [MVP Exercise Set](./09-mvp-exercises.md) · Next: [Resolved Parameters Reference →](./12-parameters-reference.md)

1. Stand up PostgreSQL locally and apply the schema ([Data Layer](./13-data-layer.md)) — reference tables (`users`, `capabilities`, `recovery_classes`, `exercises`) plus `events`, `readiness_entries`, `pending_recommendations`.
2. Seed reference data: [capability definitions](./02-capabilities.md#capability-definitions), [recovery classes](./03-exercises-and-recovery.md#recovery-classes), and the [initial exercise set](./09-mvp-exercises.md) with full metadata.
3. Scaffold the Hono app and local entry point ([Server Framework & Deployment](./14-server-framework.md)).
4. Implement the [derivation queries](./07-result-processing.md): capability score (the recursive fold, [Deriving Capability Score: the Recursive Fold](./13-data-layer.md#deriving-capability-score-the-recursive-fold)), fatigue and warmth ([Deriving Fatigue and Warmth](./13-data-layer.md#deriving-fatigue-and-warmth)), substitutes/regressions/progressions ([Substitutes, Regressions, and Progressions](./13-data-layer.md#substitutes-regressions-and-progressions)), recovery eligibility/pain risk/daily progress ([The Rest: Recovery Eligibility, Pain Risk, Daily Progress](./13-data-layer.md#the-rest-recovery-eligibility-pain-risk-daily-progress)).
5. Implement the safety veto ([Safety Veto](./06-decision-pipeline.md#safety-veto)).
6. Implement candidate generation and eligibility ([Generate Candidate Actions](./06-decision-pipeline.md#generate-candidate-actions)).
7. Implement candidate scoring ([Score Candidate Actions](./06-decision-pipeline.md#score-candidate-actions)) and variation/dose selection ([Apply Variation Rules](./06-decision-pipeline.md#apply-variation-rules), [Select Dose](./06-decision-pipeline.md#select-dose)).
8. Implement `GET /next` ([Get Next Action](./05-server-api.md#get-next-action)), including the `recommendationId` pinning behavior.
9. Implement `POST /result` ([Submit Result](./05-server-api.md#submit-result)) and `POST /log` ([Logging Without a Recommendation](./05-server-api.md#logging-without-a-recommendation)) — both reduce to "store the event."
10. Add explanations from reason codes ([Build Explanation](./06-decision-pipeline.md#build-explanation)).
11. Use `POST /log` (`source: "onboarding"`) to backfill your own recent history, then run the loop for real.
12. Deploy: AWS Lambda ([AWS Lambda Deployment](./14-server-framework.md#aws-lambda-deployment)) or Azure ([Azure Deployment](./14-server-framework.md#azure-deployment)).

Deliberately **not** in this list: authentication ([Known Gap: Authentication](./14-server-framework.md#known-gap-authentication)) is a known gap, out of scope until the API needs to be exposed beyond a single trusted client.

---

[← Index](../README.md) · Previous: [MVP Exercise Set](./09-mvp-exercises.md) · Next: [Resolved Parameters Reference →](./12-parameters-reference.md)
