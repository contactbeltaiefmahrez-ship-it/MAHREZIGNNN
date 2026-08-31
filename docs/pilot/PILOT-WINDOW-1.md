# Pilot Window 1 — activation package

**Target:** 10–25 real businesses across three corridors.
**Status:** BLOCKED — awaiting counsel (D-11, D-12) and field collection.

## Sampling matrix (§21)

Variation is the objective, not coverage. **Include businesses where success is
not expected** — a dataset of only promising businesses answers nothing.

| Axis | Required spread |
|---|---|
| Corridor | A dense (≥8) · B medium (≥6) · C dispersed (≥4) |
| Category | ≥5 of the 8, including at least one *call* category (home services or repair) |
| Size | at least 3 single-operator; at least 2 with staff |
| Digital presence | at least 4 with no website or page at all |
| Expected claim likelihood | at least 3 expected **not** to claim |
| Expected discovery value | at least 3 expected to receive little traffic |

Every record must carry `selection_reason`. "Looked promising" is not a reason.

## Field sample register

| ID | Corridor | Category | Business | Source | Selection reason | Expected outcome | Data | Owner contact | Authorisation | Coordinates | Provenance | Legal | Claim | Verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W1-01 … W1-25 | — | — | — | — | — | — | **PENDING FIELD COLLECTION** | — | — | — | — | **PENDING COUNSEL** | — | — |

**Deliberately empty.** Populating this table from imagination would be
fabrication under §54. It fills from the field, one row at a time.

## Entry conditions

| | Requirement | Status |
|---|---|---|
| Legal | D-11 answered sufficiently for the implemented architecture | **BLOCKED** |
| Legal | D-12 answered sufficiently for the field list | **BLOCKED** |
| Legal | a `legal_basis` registered and activated | **BLOCKED** (depends on the above) |
| Data | an approved real source in `data_source` | **BLOCKED** — 0 registered |
| Data | 10–25 collected records passing every gate | **BLOCKED** |
| Map | basemap archive published and configured | **BLOCKED** |
| Infrastructure | staging deployed and verified | **BLOCKED** |
| Infrastructure | production SMS gateway | **BLOCKED** — claims need real OTP delivery |
| Infrastructure | error tracking configured | **BLOCKED** |
| Ops | console operational | **READY** |
| Analytics | events, segmentation, exclusions | **READY** |
| Security | authorization and leakage tests | **READY** |
| Support | ticket and incident procedure | **READY** |
| Commercial | D-04, D-05 | **BLOCKED** — not required for Window 1; required before any paid seat |

## Pilot-critical vs post-pilot (§36)

**Pilot-critical:** legal basis · real source · real records · SMS delivery ·
staging · ops console · analytics segmentation · audit.
**Not blocking Window 1:** basemap (map degrades honestly) · error-tracking
provider (structured logs exist) · D-04/D-05 (no selling during Window 1).

The basemap is *not* a Window 1 blocker: the map renders real pins over a neutral
canvas with an honest banner. That tests discovery; it does not test the map's
final quality, which is a Window 2 concern.

## Running Window 1

```bash
# 1 record the counsel decisions, then register and activate a basis
# 2 register the real source with its licence evidence
# 3 stage the collected batch, then:
#    normalise → validate → dedupe → evaluate → ops review → publish
# 4 open and freeze the window
npm run pilot:window0     # re-verify the pipeline first
```

## Exit gate (§35)

Ingestion · legal gate · map · search · discovery · shopfront accuracy · claim ·
Ops workflow · analytics · audit all verified on real records, with no critical
data-integrity or security issue. Otherwise: fix before expanding.
