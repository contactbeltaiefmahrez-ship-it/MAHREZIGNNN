# MARKYRA — PHASE 08
# REAL DATA + MAP ACTIVATION REPORT

**Date** 29 Aug 2026 · Verified against a running system on PostgreSQL 16.15 + PostGIS 3.4.2

---

## 1 · EXECUTIVE SUMMARY

Every remaining engineering item from Phase 07 is closed. The Ops Console UI
exists and was driven through a real browser. Argon2id replaced scrypt with
transparent upgrade of legacy hashes. Error tracking, the mobile bottom sheet,
pilot dataset versioning and the staging package are implemented.

```
typecheck   PASS   (now includes apps/ — it did not before)
lint        PASS   0 errors, module-boundary rule active
tests       PASS   14 files, 154 tests   (Phase 07: 149)
builds      PASS   web 111 kB · ops 107 kB First Load JS
acceptance  PASS   21/21 browser checks incl. full Ops workflow
```

**Final status: REAL DATA + MAP TECHNICALLY READY — EXTERNAL BLOCKERS REMAIN.**

No real Tunisian business exists in the system, and no basemap is installed,
because neither can be legitimately obtained here. Nothing was fabricated to
close that gap.

---

## 2 · WHAT WAS IMPLEMENTED

### Ops Console UI (P0, was the blocking item)
A separate Next.js app on its own origin, built entirely over the **existing**
tested API — no second backend, no duplicated rules. Login, queue dashboard,
business search and review with provenance, detail panel, coordinate correction
with a **mandatory reason** and a confirmation step, audit view with live hash-chain
verification, and logout.

Verified in a browser: an OPS session is **denied** the ADMIN-only audit log
(11), the correction button stays disabled until a reason is given (8), the
destructive action confirms before writing (9), and the change appears in the
audit log (10, 13). The panel states plainly that **claiming is not verification**
(7) so no operator can infer otherwise from the UI.

### Argon2id — deviation closed
`argon2` installs and verifies in this environment, so the Phase 07 deviation is
resolved rather than re-documented. Existing scrypt hashes are still accepted and
**transparently upgraded on next successful login** — no user is locked out and no
password reset cycle is required. Verified: both staff rows now carry `$argon2id$`.

### Error tracking
A provider boundary with a development adapter (structured stderr) and a
production adapter gated on `ERROR_TRACKER_DSN`. **Scrubbing runs before the
adapter**, so no adapter — including one connected later — can receive a password,
token, OTP, phone number or email. Five tests cover the scrubber. `/ready` reports
the tracker's real configuration state.

### Mobile bottom sheet
Three detents (lip / half / full), 1:1 finger tracking, keyboard-operable handle
with `aria-expanded`. Verified at 390px: sheet present, cards visible, detent
toggles, no horizontal overflow — and desktop still uses the side list (15–19).

### Pilot dataset versioning
`pilot_dataset_version` and `pilot_dataset_member` capture which businesses were
in the dataset, at which trust and quality, at which moment. Metrics computed
later are attributable to an exact set, or they are not reproducible.

### Operational data-quality metrics
`/ops/data-quality` reports totals, trust distribution, low-confidence
coordinates, missing phones, median quality, staging rejects, duplicates pending
review, and **batches blocked by a missing legal basis**. Labelled operational,
never investor metrics — the current numbers count development fixtures.

---

## 3 · DEFECTS FOUND

**The root typecheck was not checking `apps/`.** `tsconfig.json` included
`platform`, `modules`, `packages`, `test`, `scripts` and `tools` — but not the
applications. `npm run typecheck` had been passing while the web and ops apps
were unchecked. Fixed; it immediately surfaced a real worker error. This means
Phase 05–07's "typecheck PASS" covered less than it appeared to.

**Password hashing sat in a repository.** The Invariant-4 test walks every
repository export and requires an `ActorContext` first argument; `hashPassword`
failed it. The test was right — pure crypto is not data access. Moved to
`modules/identity/domain/password.ts`.

**Boundary rule caught two more violations** (ops querying `business`, and the
metrics query). Split across owning modules. **Ten** real violations across four
phases now.

**A discriminated union broke the ops build** while the root typecheck passed,
because Next generates its own tsconfig for each app. Replaced with a flat result
type that does not rely on cross-boundary narrowing.

---

## 4 · REAL DATA — STATUS

**Zero real businesses.** The 240 records in the development database are
synthetic fixtures with fictional names, all carrying `source_code='FIXTURE'`,
removable with `npm run db:unseed`. They are not real Tunisian businesses and
must never appear in pilot reporting or investor metrics.

The ingestion path is complete and unchanged: source → staging → normalisation →
validation → deduplication → quality → provenance → **legal gate** → approval →
publish → search → discovery → map. The legal gate still refuses to publish a
batch without `legal_basis_ref`, enforced by a database constraint.

**Recommended first import remains 10–25 records**, validated end to end, then
50–100, then the 600–900 pilot dataset across the three Tunis corridors. Not the
reverse.

---

## 5 · MAP AND PMTILES

Everything technically possible is done: MapLibre integration, PostGIS viewport
queries, clustering, map/list synchronisation, selection, and the honest degraded
state. The PMTiles build pipeline, validation gate, versioning and publish plan
are implemented and tested (6 tests).

**The basemap archive remains EXTERNALLY BLOCKED.** `build.protomaps.com` and
`download.geofabrik.de` are unreachable from this environment. `/ready` reports
`basemap: EXTERNALLY BLOCKED — degraded map` rather than hiding it. The exact
external step is documented in `pipelines/pmtiles/build.ts`:

```
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles \
  markyra-basemap-<YYYYMMDD>.pmtiles --bbox=9.90,36.55,10.55,37.10
```

Setting `NEXT_PUBLIC_PMTILES_URL` activates it with no code change.

---

## 6 · EXTERNAL DEPENDENCIES REGISTER

| # | Blocker | Owner | Status | Exact action | Resolution criteria |
|---|---|---|---|---|---|
| 1 | **D-11** ODbL boundary | Counsel | OPEN | Written opinion on CORE/GEO separation | Opinion recorded |
| 2 | **D-12** lawful basis | Counsel | OPEN | Position on publishing businesses + contact numbers | `legal_basis_ref` issued; `publishBatch` runs |
| 3 | **Real business data** | Founder | OPEN | Field-collect 10–25, then 50–100, then 600–900 | Batches pass the ingestion gate |
| 4 | **Basemap archive** | Infrastructure | OPEN | `pmtiles extract` + upload + configure | `/ready` reports basemap configured |
| 5 | **D-04** refund policy | Founder + counsel | OPEN | Publish terms before selling | Policy published and configured |
| 6 | **D-05** invoicing / VAT | Accountant | OPEN | Determination on seat revenue | Determination recorded |
| 7 | **Staging infrastructure** | Infrastructure | OPEN | Provision managed PG, storage, CDN; apply `docs/STAGING.md` | Staging verified running |
| 8 | **Production SMS gateway** | Infrastructure | OPEN | Contract a Tunisian gateway, set `SMS_PROVIDER=production` | A real OTP delivers |
| 9 | **Error tracking provider** | Infrastructure | OPEN | Set `ERROR_TRACKER_DSN`, wire the SDK | Errors appear in the provider |

---

## 7 · PILOT READINESS REASSESSMENT

| Dimension | Status | Gap |
|---|---|---|
| **Technical** | **READY** | none blocking |
| **Operational** | **READY** | Ops Console exists and was driven end to end |
| **Data** | **NOT READY** | zero real businesses (#3) |
| **Legal** | **NOT READY** | D-11, D-12 (#1, #2) |
| **Commercial** | **NOT READY** | D-04, D-05 (#5, #6) |
| **Infrastructure** | **NOT READY** | staging not deployed; no SMS gateway; no error provider (#4, #7, #8, #9) |

Staging is **CONFIGURED**, not **DEPLOYED**, and not **VERIFIED**. The
distinction is deliberate.

---

## 8 · EXACT NEXT STEPS

1. **Counsel: D-11 and D-12.** Blocking for the third phase running. The pipeline
   refuses to publish without D-12's reference — a hard stop in code.
2. **Infrastructure: provision staging** per `docs/STAGING.md`, then verify.
3. **Infrastructure: acquire the basemap** with the documented one-line extract.
4. **Founder: field-collect 10–25 real records** and run the full pipeline before
   scaling. Never mass-import before a sample has passed.
5. **Contract an SMS gateway and an error-tracking provider.**
6. **Founder + accountant: D-04 and D-05** before any paid market cycle.

Items 2, 3 and 5 are procurement. Item 1 is legal. Item 4 is fieldwork. None is
engineering — which is the point this phase set out to reach.

---

## 9 · FINAL STATUS

> **REAL DATA + MAP TECHNICALLY READY — EXTERNAL BLOCKERS REMAIN.**

The system can receive real businesses and a real basemap without an
architectural change. It cannot begin a pilot until counsel, procurement and
fieldwork deliver what code cannot.
