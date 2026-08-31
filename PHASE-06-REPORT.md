# MARKYRA — REAL DATA + MAP REPORT
## Phase 06

**Date** 28 August 2026 · **Status** Pipeline delivered; real data NOT acquired
**Verified against** PostgreSQL 16.15 + PostGIS 3.4.2, 113 passing tests

---

## 0 · TWO FACTS THAT DETERMINE THIS PHASE

The Phase-06 brief opens by stating that MVP development is complete and asks me
to activate real data and the real map on top of it. Both halves of that premise
fail against the actual repository, and saying so is the first duty of this phase.

### Fact 1 — MVP development is not complete

Audit of the repository (§05 requires this before touching data):

| | Finding |
|---|---|
| `apps/` — web, api, worker | **Do not exist.** No Next.js, no Fastify, no worker. |
| MapLibre, PMTiles, any frontend | **Do not exist.** Zero frontend files. |
| Modules with behaviour | 10 of 17. `identity`, `media`, `notification`, `receipt`, `analytics`, `audit`, `verification` are **schema only**. |
| Deployment configuration | Does not exist. |

Phase 05 delivered the foundation and the constitutional core — roughly 15–20% of
the MVP. **There is no map to activate**, because MapLibre and PMTiles were never
built. §21 ("activate the REAL MAP", "do not replace the stack") cannot be
executed against a stack that does not yet exist.

### Fact 2 — real Tunisian data cannot be acquired from this environment

Every external source is blocked by the network egress policy:

```
download.geofabrik.de     403      build.protomaps.com       403
overpass-api.de           403      nominatim.openstreetmap   403
data.gov.tn               403
```

No OSM extract, no Protomaps build, no geocoder, no Tunisian open data.

**The tempting response would be to generate 300 plausible Tunisian cafés with
coordinates and call it a pilot dataset. That is precisely what §55 forbids**
— "Never fabricate accuracy… Never confuse imported data with verified
businesses" — and it is the single most damaging thing this phase could produce,
because fabricated data with no provenance looks exactly like success and would
silently poison the pilot, the metrics and the investor demo downstream.

So: **no business data was invented.** What was built is the machinery that makes
real data safe when it arrives, which is the part that requires engineering.
Acquisition is a field and legal operation, not a sandbox operation.

---

## 1 · REAL DATA READINESS AUDIT

| | Area |
|---|---|
| **A · Already ready** | CORE schema, PostGIS geometry + GiST indexes, viewport and clustering queries, trigram search with the Arabic normaliser, discovery ranking, the four invariants, module boundaries, audit log |
| **B · Partially ready** | `business.provenance` and `import_batch` existed but had no pipeline behind them; `search_document` existed but nothing populated it from an import |
| **C · Missing** | GEO database · staging layer · source registry · coordinate confidence · quality scoring · duplicate classification · batch gate · rollback · **the entire map stack** · **all application entrypoints** |
| **D · Incorrect** | Nothing incorrect found in the existing schema |
| **E · Dangerous** | Production `business` was writable by any import path. **Now closed**: nothing external writes to `business`; only `createImported` behind the business module's service does. |
| **F · Needs migration** | Applied: 009 (staging, provenance, confidence, quality, source registry, geo lineage) |
| **G · Needs operational tooling** | Duplicate review queue (built) · coordinate correction UI (not built — needs the Ops Console) · import runbooks (written) |

---

## 2 · WHAT WAS BUILT AND TESTED

### 2.1 The CORE/GEO fence, now physical

`markyra_geo` is a **separate database** holding OSM-derived delegation
boundaries with extract version, licence and attribution columns. Proven:

```
app role connecting to GEO  →  FATAL: permission denied for database "markyra_geo"
dblink / postgres_fdw in CORE  →  0
```

The application literally cannot reach GEO. The only crossing remains the
delegation code, assigned offline in the pipeline (D-11).

### 2.2 The seven-step ingestion pipeline

```
stage → normalise → validate → dedupe → GATE → publish → rollback
```

Nothing external ever touches `business`. Every step is a tested function.

**Normalisation (§11)** — Tunisian phone forms (`71234567`, `+216…`, `00216…`,
Arabic-Indic digits) all fold to E.164; URLs normalised; commercial
abbreviations expanded (`Sté`→societe, `Av.`→avenue). **Display values are never
destroyed** — `name_ar` keeps its diacritics; `name_normalized` is a separate
column.

**Validation (§13, §40)** — the distinction the brief insists on is implemented
literally: *geographic validity is an error; geographic accuracy is a confidence
downgrade.* Coordinates outside Tunisia, outside the pilot area, at Null Island,
non-finite, or missing → **rejected**. Coordinates with only 2 decimal places
(≈1.1 km — a centroid, not an address) → **valid but downgraded to LOW**, and
LOW cannot be published (enforced by a CHECK constraint, not by convention).

**Coordinate confidence (§14)** — `VERIFIED | HIGH | MEDIUM | LOW | UNKNOWN`.
Confidence only ever moves down through validation, never up.

**Deduplication (§12)** — four classes. `CONFIRMED` (phone or website match plus
a plausible name, or near-identical name within 30 m) may be auto-actioned.
`PROBABLE` and `POSSIBLE` go to `duplicate_review` for a human. **Ambiguous
records are never merged automatically.**

**The gate (§35, §40)** — a batch that exceeds 10% error rate, 25% duplicate
rate, or falls below median quality 45 is marked `REJECTED` and `publishBatch`
refuses it. Tested: a batch of 20 records with Paris coordinates is rejected and
**zero rows reach `business`**.

**Publish (§18)** — every imported business is created `UNCLAIMED` and
`UNVERIFIED`. Data existing is not a business being verified. Publishing without
a `legal_basis_ref` is rejected by the database (D-12).

**Rollback (§48)** — `rollbackBatch` reverts the batch, **except businesses
claimed since import**. An owner's work outranks our import bookkeeping; those
are returned as `preservedClaimed` for manual review.

### 2.3 Privacy (§37)
Validation rejects ID-like tokens in free text and warns on bare 8-digit numbers
that were not parsed as a business phone. Only contact details a business already
displays publicly may be imported, recorded per record in provenance.

### 2.4 Verification results

```
typecheck   PASS
lint        PASS   0 errors — every module boundary respected
tests       PASS   10 files, 113 tests   (Phase 05: 84)
```
44 tables · 397 constraints · 3,455 lines TypeScript · 820 lines SQL.

---

## 3 · DEFECTS FOUND WHILE BUILDING

**Abbreviation matching silently failed on accents.** `\bsté\b` never matches in
JavaScript: `\b` is defined over `[A-Za-z0-9_]`, so there is no word boundary
after `é`. Every accented French abbreviation was passing through unexpanded.
Fixed by folding Latin accents *before* expansion and using Unicode-aware
lookarounds. Found by a test, not by reading the code.

**The boundary rule caught two more ownership violations**, in the ingestion
pipeline (`ops` writing to `business`) and in the duplicate query (`business`
reading `category`). Both refactored behind service interfaces. That rule has now
caught five real violations across two phases.

**The new coordinate-confidence constraint immediately rejected 33 existing
tests** whose fixtures published businesses without declaring confidence. That is
the constraint working: it is now impossible to publish a business whose location
nobody vouched for.

---

## 4 · PILOT DATASET

**Businesses: 0.** No real dataset exists, for the reasons in §0.

**Recommended acquisition plan**, per §16–§17 — quality over quantity:

| | Recommendation |
|---|---|
| Geography | 3 Grand Tunis corridors, not the whole metro: Tunis centre (dense), La Marsa/Gammarth (mid), Ben Arous (sparse). Density variety is what makes clustering, empty states and viewport queries testable. |
| Size | **600–900 businesses.** Enough to exercise clustering, ranking, search variety and map density; small enough that one person can audit every record and correct errors. The MVP Specification's 3,000 is the launch figure; the *first* dataset should be auditable. |
| Categories | All 8, deliberately unbalanced — a real map is not uniform. |
| Method | **Field collection, primary.** Highest coordinate confidence, unambiguous provenance, no licence risk, and the agent visit doubles as the claim conversation. |
| OSM | Geographic reference layer only. Never promoted to a business record. |
| Verification | All imports `UNCLAIMED`. Trust stays earned. |
| Quality bar | Median quality ≥ 60; zero records below MEDIUM coordinate confidence. |

---

## 5 · DEFINITION OF DONE — HONEST STATUS

| Item | Status |
|---|---|
| Data provenance recorded | **Done** (mandatory column + per-record) |
| Sources documented · licensing documented | **Done** (registry + runbooks) |
| CORE/GEO separation preserved | **Done and proven at the role level** |
| Ingestion repeatable · duplicate detection · quality validation · geographic validation · coordinate confidence | **Done and tested** |
| Data rollback possible | **Done and tested** |
| Privacy boundaries respected | **Done** |
| No production data silently overwritten | **Done** — structurally impossible |
| Arabic / French / transliteration search | **Done** (Phase 05, tested) |
| Viewport queries · clustering | **Done** (Phase 05, tested) |
| **Real business data available** | **NOT DONE** — cannot be acquired here |
| **OSM pipeline operational** | **NOT DONE** — no network access to any extract |
| **MapLibre · PMTiles · map/list sync · mobile map · map accessibility** | **NOT DONE** — the map stack does not exist yet |
| **Real-data performance measured** | **NOT DONE** — no real dataset to measure |
| **Ops can correct data** | **PARTIAL** — queue and functions exist; no Ops Console UI |
| **Real end-to-end discovery** | **NOT DONE** — no API, no web app |

**Phase 06 is not complete**, and the §52 acceptance test cannot be run: it
requires a user opening MARKYRA, and there is no application to open.

---

## 6 · WHAT ACTUALLY UNBLOCKS THIS PHASE

In order. None of it is sandbox work.

1. **D-11 and D-12 answered by counsel.** Still blocking, now for the third
   phase running. The pipeline physically refuses to publish without D-12's
   reference, so this is not a formality — it is a hard stop in code.
2. **Finish the MVP application** — API, web, MapLibre, PMTiles. Roughly 4–6
   engineer-months. Phase 06 was sequenced before this work existed.
3. **Field collection of 600–900 businesses** across the three corridors. This
   is the pilot's real cost and its real moat; it is also the only source with
   clean provenance and high coordinate confidence.
4. **Then** run the pipeline, measure with real data, and run the §52 acceptance
   test.

---

## 7 · RISKS

| Risk | Note |
|---|---|
| Pressure to fabricate a dataset to show progress | The highest risk in this phase. Fabricated data is undetectable in a demo and fatal in a pilot. The gate thresholds and provenance requirements exist partly to make fabrication inconvenient. |
| OSM POIs promoted to business records | Would violate ODbL and confuse geographic presence with business existence. The GEO fence makes it architecturally hard; keep it that way. |
| Field collection cost underestimated | 600–900 verified records is weeks of agent time. It is the honest cost of the only clean source. |
| Phase sequencing | Phases 06–07 assume an application that Phase 05 did not finish. The roadmap should be re-cut before more phases are run against a false premise. |
