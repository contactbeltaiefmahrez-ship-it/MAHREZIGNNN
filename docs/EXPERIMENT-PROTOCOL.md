# MARKYRA — Pilot Experiment Protocol

Pre-registered before any measurement. Thresholds are fixed in
`modules/pilot/domain/definitions.ts` and cannot be edited after a window opens
without a recorded decision.

## Hypotheses

| ID | Statement | Primary metric | Success | Failure |
|---|---|---|---|---|
| H1 | Users can discover relevant local businesses | search → business open | ≥35% | <15% |
| H2 | Businesses receive measurable value | open → action | ≥12% | <5% |
| H3 | Owners understand and trust the claim model | claim completion | ≥60% | <30% |
| H4 | Map and discovery improve local discovery | map-assisted open share | ≥30% | <10% |
| H5 | Businesses would continue after the Pilot | willingness to continue | ≥50% | <25% |

Thresholds are justified in code, not asserted here. H5 is self-reported and is
recorded as **intent**, never as revenue.

## Verdicts

`SUPPORTED · PARTIALLY_SUPPORTED · NOT_SUPPORTED · INCONCLUSIVE`.
**Below 30 observations the verdict is INCONCLUSIVE regardless of the rate.**
A ratio computed from four events is not evidence.

## Activation definitions

**Business activated** = claimed **and** completeness ≥60 **and** the owner has
updated something since claiming. Claiming alone is not activation.

**User activated** = a contact or directions tap, **or** two or more shopfront
opens. A homepage visit is not activation.

## Stop conditions (§55)

Critical security incident · systematic data corruption · publication without a
lawful basis · repeated claim fraud · sustained instability · inability to
maintain data quality. Any one of these pauses the Pilot regardless of how the
metrics look.

## Change freeze (§50)

`freezeWindow(ordinal)` snapshots migrations, platform config, ranking version,
basemap state and SMS provider into `pilot_window.frozen_config`. Metrics are
reported against a frozen configuration or they are not reported.
