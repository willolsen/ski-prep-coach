# 8. MVP Development Order

[← Index](../README.md) · Previous: [MVP Exercise Set](./09-mvp-exercises.md) · Next: [Resolved Parameters Reference →](./11-parameters-reference.md)

1. Stand up PostgreSQL locally and apply the schema ([Section 11](./12-data-layer.md)) — reference tables (`users`, `capabilities`, `recovery_classes`, `exercises`) plus `events`, `readiness_entries`, `pending_recommendations`.
2. Seed reference data: capability definitions (2.2), recovery classes (2.8), and the initial exercise set (Section 7) with full metadata.
3. Scaffold the Hono app and local entry point ([Section 12](./13-server-framework.md)).
4. Implement the derivation queries (Section 5): capability score (the recursive fold, [11.5](./12-data-layer.md#115-deriving-capability-score-the-recursive-fold)), fatigue and warmth ([11.6](./12-data-layer.md#116-deriving-fatigue-and-warmth)), substitutes/regressions/progressions ([11.7](./12-data-layer.md#117-substitutes-regressions-and-progressions)), recovery eligibility/pain risk/daily progress ([11.8](./12-data-layer.md#118-the-rest-recovery-eligibility-pain-risk-daily-progress)).
5. Implement the safety veto ([Step 3](./06-decision-pipeline.md#step-3--safety-veto)).
6. Implement candidate generation and eligibility ([Step 6](./06-decision-pipeline.md#step-6--generate-candidate-actions)).
7. Implement candidate scoring ([Step 7](./06-decision-pipeline.md#step-7--score-candidate-actions)) and variation/dose selection ([Steps 8–9](./06-decision-pipeline.md#step-8--apply-variation-rules)).
8. Implement `GET /next` ([3.1](./05-server-api.md#31-get-next-action)), including the `recommendationId` pinning behavior.
9. Implement `POST /result` ([3.2](./05-server-api.md#32-submit-result)) and `POST /log` ([3.3](./05-server-api.md#33-logging-without-a-recommendation)) — both reduce to "store the event."
10. Add explanations from reason codes ([Step 10](./06-decision-pipeline.md#step-10--build-explanation)).
11. Use `POST /log` (`source: "onboarding"`) to backfill your own recent history, then run the loop for real.
12. Deploy: AWS Lambda ([12.5](./13-server-framework.md#125-aws-lambda-deployment)) or Azure ([12.6](./13-server-framework.md#126-azure-deployment)).

Deliberately **not** in this list: authentication ([12.8](./13-server-framework.md#128-known-gap-authentication)) is a known gap, out of scope until the API needs to be exposed beyond a single trusted client.

---

[← Index](../README.md) · Previous: [MVP Exercise Set](./09-mvp-exercises.md) · Next: [Resolved Parameters Reference →](./11-parameters-reference.md)
