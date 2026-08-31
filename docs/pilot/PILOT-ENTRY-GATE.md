# Pilot Entry Gate

Machine-checkable via `npm run pilot:gate`. Human-readable below.
Each item is READY, PENDING or BLOCKED. **No item may be marked READY by
assertion** — the script reads system state.

| Area | Item | Status |
|---|---|---|
| **LEGAL** | D-11 decisions recorded | BLOCKED |
| | D-12 decisions recorded | BLOCKED |
| | active legal basis registered | BLOCKED |
| **DATA** | approved real source | BLOCKED |
| | ≥10 REAL businesses | BLOCKED (0) |
| | provenance complete on every REAL record | n/a — none exist |
| **MAP** | basemap configured | BLOCKED |
| | PMTiles pipeline ready | READY |
| **INFRASTRUCTURE** | staging deployed | BLOCKED |
| | production SMS | BLOCKED |
| | error tracking | BLOCKED |
| **OPS** | console operational | READY |
| | staff provisioned | READY |
| | queues and correction workflow | READY |
| **ANALYTICS** | event catalogue and segmentation | READY |
| | fixture/test exclusion enforced | READY |
| **SECURITY** | authorization tests | READY |
| | leakage tests | READY |
| | audit hash chain | READY |
| **SUPPORT** | ticket and incident procedure | READY |
| **COMMERCIAL** | D-04 refund policy | BLOCKED (not required for Window 1) |
| | D-05 invoicing / VAT | BLOCKED (not required for Window 1) |

**Window 1 may not open while any LEGAL or DATA item is BLOCKED.**
