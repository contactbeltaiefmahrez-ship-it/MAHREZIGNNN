# MARKYRA — Pilot Operating Manual

## Windows and gates

| Window | Target | Exit gate |
|---|---|---|
| **0** internal verification | 0 real businesses | `npm run pilot:window0` → 14/14 |
| **1** first real businesses | 10–25 | ingestion, legal gate, map, search, discovery, shopfront accuracy, claim, ops, analytics, audit all verified on real records; no critical data-integrity or security issue |
| **2** expansion | 50–100 | data quality stable, duplicate rate acceptable, search quality acceptable, map performance acceptable, ops workload and support volume manageable |
| **3** pilot dataset | 600–900 | same standards; the legal gate is never lowered to increase coverage |

Never move to the next window before the previous one passes. Never reverse the
sequence.

## Corridors (§06)

| Code | Area | Density | Purpose |
|---|---|---|---|
| A | Tunis Centre | DENSE | clustering, duplicate pressure, viewport load |
| B | La Marsa | MEDIUM | the ordinary case |
| C | Ben Arous | DISPERSED | empty states, nearest-density, sparse map |

Selection must not be limited to businesses expected to succeed. Record **why**
each business was included.

## Daily operations

```bash
npm run dev:db && npm run api          # API
npm run web                            # consumer (:3000)
npm run ops                            # ops console (:3001)
npm run worker                         # jobs
```

Ops reviews queues at `/`, businesses and corrections under **الأنشطة**, and the
audit log under **سجل التدقيق** (Admin only).

## Weekly data-quality review (§32)

`GET /ops/data-quality` — check: missing coordinates, low-confidence
coordinates, duplicate candidates pending review, batches blocked by legal
basis, median quality. Record findings in the decision log.

## Incident procedure (§29)

```
DETECT → CONTAIN → INVESTIGATE → FIX → VERIFY → DOCUMENT
```
Record in `pilot_incident`. **Never modify production data to hide a problem** —
`data_modified` exists on the incident record precisely so that doing so is itself
recorded.

## Support severities

**P0** outage, security or data integrity · **P1** major functional failure ·
**P2** usability · **P3** minor. Tracked in `support_ticket`.

## Metric separation (§52)

| Category | Includes | Excludes |
|---|---|---|
| Operational | everything, including fixtures | nothing |
| Product | ORGANIC + TEST_USER, REAL businesses | fixtures, internal, ops, bots |
| **Investor** | **ORGANIC only, REAL businesses only** | everything else |

Enforced in code: `pilotMetrics` filters by traffic segment and by an allowlist
of REAL business ids, and reports the excluded count rather than hiding it.

Never present: imported businesses as customers · claimed as verified ·
interested as paying · fixtures as traction · internal traffic as users.
