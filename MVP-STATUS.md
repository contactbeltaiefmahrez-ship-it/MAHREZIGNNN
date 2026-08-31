# MARKYRA — MVP STATUS

Verified 28 Aug 2026 against a running system. A feature is **COMPLETE** only if
code exists, runs, is integrated, and is tested.

## Verification actually executed

```
typecheck    PASS   tsc --noEmit, strict
lint         PASS   0 errors, module-boundary rule active
tests        PASS   11 files, 127 tests
web:build    PASS   / = 110 kB First Load JS (budget 120 kB)
e2e browser  PASS   15/15 acceptance checks
```

## Completion matrix

| Capability | Status | Evidence |
|---|---|---|
| Web application (Next.js) | **COMPLETE** | builds, serves, 15/15 browser checks |
| Frontend routing | **COMPLETE** | `/` and `/b/[id]` (SSR) |
| Design tokens implemented | **COMPLETE** | `packages/tokens/tokens.css`, two separate ramps |
| Responsive UI | **PARTIAL** | verified 1280 and 390, no horizontal overflow; bottom sheet not built |
| API (Fastify) | **COMPLETE** | 4 endpoints, error contract, rate limit, CORS |
| Database + migrations | **COMPLETE** | 9 migrations, 44 tables, 397 constraints |
| PostGIS viewport + clustering | **COMPLETE** | tested against real geometry |
| Search (AR/FR/fuzzy) | **COMPLETE** | tested live and in API tests |
| Discovery ranking | **COMPLETE** | deterministic, versioned, explainable |
| Business shopfront | **COMPLETE** | SSR, degrades on missing fields, no internal leakage |
| Map interface | **PARTIAL** | real pins, projection, selection, honest degraded state. **No basemap — BLOCKED** |
| Attention / 1-in-6 | **COMPLETE** | enforced server-side, property-tested, asserted in API tests |
| Sponsored/organic distinction | **COMPLETE** | 29 labels rendered; `مموّل` in payload and UI |
| Trust states | **COMPLETE** | UNCLAIMED/CLAIMED/VERIFIED; no business verified without an owner |
| Market engine | **COMPLETE** | cycle machine, allocation, idempotent publish |
| Payment states | **COMPLETE** | explicit states, reconciliation invariant, no `paid` boolean |
| Ingestion pipeline | **COMPLETE** | 7 steps, gate rejects corrupt batches, rollback preserves claims |
| CORE/GEO separation | **COMPLETE** | separate database, role denied, no dblink/fdw |
| Authorization | **COMPLETE** | ActorContext required by type |
| Loading / empty / error states | **COMPLETE** | skeletons, zero-result, retry, honest basemap banner |
| Claim workflow | **PARTIAL** | state machine tested; **no OTP transport, no sessions** |
| Authentication | **MISSING** | no SMS, no cookies, no login |
| Ops Console UI | **MISSING** | functions and queues exist; no interface |
| Worker (pg-boss) | **MISSING** | jobs defined, not wired |
| Analytics events | **MISSING** | schema only |
| Audit writer | **PARTIAL** | table, trigger, hash columns; no writer wired |
| PMTiles archive | **BLOCKED** | external acquisition unavailable |
| Deployment config | **MISSING** | documented, not built |

## Environment readiness

- **LOCAL READY** — yes, verified by the README steps above.
- **STAGING READY** — no. No deployment configuration, no managed database, no CI.
- **PRODUCTION READY** — no. Authentication, Ops Console, worker, observability
  and a basemap are all absent.

## PILOT BLOCKERS

**Legal** — D-11 (ODbL boundary) and D-12 (lawful basis for seeded listings).
The pipeline refuses to publish a batch without D-12's reference, so this is a
hard stop in code, not a formality.

**Data** — no real businesses. 600–900 field-collected records across three
Grand Tunis corridors is the recommended first dataset.

**Map** — no PMTiles archive. External acquisition blocked.

**Technical** — authentication transport, Ops Console, worker, deployment,
observability.

**Commercial** — D-04 (refund policy) and D-05 (invoicing/VAT) block the first
paid market cycle.

## Final MVP status

> **PARTIALLY READY.**

The application runs, the core discovery journey works end to end against real
database queries, and every constitutional invariant is enforced and tested.
It is not MVP READY: a merchant cannot yet log in, ops cannot yet work, and
there is no real data or basemap.
