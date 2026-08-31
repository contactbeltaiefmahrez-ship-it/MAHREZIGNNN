# Field Collection Protocol — Window 1

**The collector makes no legal promises.** Where anything is uncertain, escalate.

## Per business

| Step | Action | Recorded as |
|---|---|---|
| 1 | Identify the business | staging `name_ar`, `name_fr` |
| 2 | Confirm it physically exists | `evidence_kind = FIELD_OBSERVATION` |
| 3 | Speak to the owner or an authorised representative | `representative_role` |
| 4 | Explain MARKYRA (use the script) | — |
| 5 | Explain pilot participation and what is not guaranteed | — |
| 6 | Collect **only** the required fields | staging fields |
| 7 | Record the source | `source_code` |
| 8 | Record coordinates and how they were obtained | `coordinate_method`, `coordinate_precision_m` |
| 9 | Record evidence | `evidence_kind`, `evidence_media_id` |
| 10 | Record authorisation, naming the fields authorised | `business_participation` |
| 11 | Submit through staging | `stageBatch` |
| 12–15 | validate → deduplicate → legal gate → Ops review | pipeline |
| 16 | Publish **only if permitted** | `publishBatch` |

## Coordinates (§24)

Acceptable: `GPS_ON_SITE` (standing at the premises), `MAP_REFERENCE` (an
authoritative reference confirmed on site), `OWNER_CONFIRMED`.

**Never:** estimate by eye · move a pin so it looks better on the map · use a
two-decimal approximation as if it were exact · reuse a nearby business's point.

Record precision in metres. Two decimal places is roughly 1.1 km — a centroid,
not an address, and the system will refuse to publish it.

## Escalation (§39)

```
COLLECTOR → OPS → PRODUCT → LEGAL
```

Escalate, do not improvise, on: uncertain ownership · disputed information ·
a number that may be a personal mobile · refusal · a suspected duplicate ·
an incorrect address · any legal question.

## Rejection criteria

Missing name, category or coordinates · coordinates outside the pilot area ·
no provenance · no authorisation where the model requires one · a phone that
looks like a personal number where D-12.Q4 is unresolved · an owner who declines.

**An owner who declines is recorded as declined and is not listed.** That is a
valid outcome, not a failure.

## End of day

Upload the batch to staging, run validate → dedupe → gate, and leave anything
ambiguous in the Ops review queue. Do not publish from the field.
