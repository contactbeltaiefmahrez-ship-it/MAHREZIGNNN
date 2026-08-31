# MARKYRA — PHASE 09
# PILOT EXECUTION REPORT

**Date** 29 Aug 2026 · Verified against a running system, PostgreSQL 16.15 + PostGIS 3.4.2

---

## 1 · EXECUTIVE SUMMARY

The Pilot did not start. Not one of the nine external blockers from Phase 08 has
been resolved, so there are no real businesses, no lawful basis to publish any,
and no basemap. Per §04, everything around those blockers was built and verified
instead.

```
typecheck  PASS   lint PASS   162 tests PASS   web + ops builds PASS
WINDOW 0   14/14 checks PASS, reproducible across consecutive runs
```

**Final status: PILOT READY — AWAITING ACTIVATION.**

Real businesses in the system: **0**. That is the honest number and it is now
structurally enforced rather than asserted.

---

## 2 · PILOT ENTRY GATE

| Dimension | Requirement | Status |
|---|---|---|
| **Legal** | D-11 ODbL opinion | **BLOCKED** |
| | D-12 lawful basis | **BLOCKED** — the database refuses publication without it |
| **Data** | ≥10 real businesses | **BLOCKED** — 0 |
| | approved non-fixture source | **BLOCKED** — 0 registered |
| **Infrastructure** | basemap archive | **BLOCKED** |
| | production SMS gateway | **BLOCKED** — dev outbox, sends nothing |
| | error-tracking provider | **BLOCKED** — dev stderr |
| | staging deployed | **BLOCKED** — configured, not deployed |
| **Commercial** | D-04 refund policy | **BLOCKED** |
| | D-05 invoicing / VAT | **BLOCKED** |
| **Operational** | ingestion pipeline | READY, verified in Window 0 |
| | ops console | READY, driven in a browser |
| | traffic segmentation | **READY** (built this phase) |
| | pilot windows, corridors, freeze | **READY** (built this phase) |
| | activation definitions | **READY** (executable, tested) |

Ten of fifteen requirements are blocked. The Pilot cannot begin.

---

## 3 · THE FINDING THAT MATTERED MOST

The entry-gate audit reported **40 "real" businesses**. There were none.

Metrics excluded `source_code = 'FIXTURE'`, but the test suite's businesses
carried **no source at all**. A null source was silently treated as real. Any
pilot or investor metric computed that way would have counted test data as
traction — precisely what §52 forbids, and undetectable in a dashboard.

Fixed structurally, not by patching a query: `data_origin` is now a NOT NULL
enum (`REAL | FIXTURE | TEST`) on every business, defaulting to `TEST`. There is
no null case. A `REAL` business must name an approved source
(`real_requires_source` CHECK) — real data cannot be anonymous. Metrics take an
allowlist of REAL ids and **report the excluded count** rather than hiding it.

Current classification: **FIXTURE 240 · TEST 10 · REAL 0.**

---

## 4 · WINDOW 0 — EXECUTED

The one window executable without external inputs. A labelled TEST batch driven
through the **real** ingestion path. 14/14, reproducible.

| # | Check | Result |
|---|---|---|
| 1–2 | staging accepts an approved source; normalisation preserves display values | PASS |
| 3 | validation **rejects** the out-of-country record | PASS — 12 valid, 1 rejected |
| 4 | deduplication classifies every record | PASS — 12 distinct |
| 5 | batch gate evaluates | PASS |
| **6** | **legal gate blocks publication without a lawful basis** | **PASS — database constraint** |
| 7 | publish path works end to end | PASS — 10 published |
| 8 | published records are TEST origin, never REAL | PASS |
| 9 | imported businesses are UNCLAIMED — import is not verification | PASS |
| 10 | published records reach the search index | PASS |
| 11 | pilot metrics exclude non-REAL data by construction | PASS |
| 12 | rollback reverses the batch, preserving claims | PASS — 10 unpublished |
| 13 | configuration freeze recorded | PASS |
| 14 | windows defined, Window 0 frozen | PASS |

No real businesses were created. No pilot metrics were produced.

---

## 5 · TWO DEFECTS WINDOW 0 EXPOSED

**Deduplication compared across data origins.** A real import was matched against
development fixtures, so nothing could be published — check 7 failed with 0
published. Real data must be deduplicated against real data. Now scoped by
origin.

**Proximity alone nearly made every neighbour a duplicate.** With no meaningful
name agreement, distance plus same-category reached POSSIBLE. On a dense
commercial street — Corridor A, the pilot's densest area — every adjacent shop
would have entered the ops review queue. Two shops next door are the **normal**
case, not an anomaly. A name-similarity floor of 0.35 now applies before
geography contributes at all; a matching phone or website still overrides it,
because that is genuine evidence of the same business.

Neither would have surfaced without running the pipeline. That is what an
internal verification window is for.

---

## 6 · WHAT WAS BUILT

**Data origin classification** — §3 above.

**Traffic segmentation (§42)** — `traffic_segment` on both event streams
(INTERNAL · OPS · BUSINESS · TEST_USER · ORGANIC · BOT), plus a
`traffic_exclusion` register. Investor metrics admit **ORGANIC only**; product
metrics admit ORGANIC + TEST_USER. Enforced in code and tested.

**Executable activation definitions (§43, §44)** — a business is activated when
claimed **and** ≥60% complete **and** updated since claiming; claiming alone is
not activation. A user is activated by a contact or directions tap, or two
shopfront opens; a homepage visit is not activation.

**Pre-registered hypotheses (§21, §54)** — five, each with a success threshold, a
failure threshold and a written justification, fixed in code before any
measurement. **Below 30 observations the verdict is INCONCLUSIVE regardless of
the rate** — a ratio from four events is not evidence.

**Windows, corridors, freeze (§34, §50)** — four windows with targets and exit
decisions; three corridors as data; `freezeWindow` snapshots migrations, config,
ranking version, basemap state and SMS provider.

**Support and incidents (§28, §29)** — `support_ticket` with P0–P3 severities and
`pilot_incident` carrying a `data_modified` flag, so hiding a problem by editing
data is itself recorded.

**Documentation** — Pilot Operating Manual, Experiment Protocol, Analytics
Dictionary, alongside the existing source registry and runbooks.

---

## 7 · WHAT WAS NOT PRODUCED

No business dataset. No claims. No verifications. No user behaviour. No search,
discovery or map performance figures. No business value. No feedback. No
willingness to pay. No success stories.

All of these require real participants. Producing any of them from fixtures
would be fabrication under §64, and the resulting numbers would be indistinguishable
from real ones in a report — which is exactly why they are absent.

---

## 8 · HYPOTHESIS STATUS

| ID | Verdict | Evidence |
|---|---|---|
| H1–H5 | **INCONCLUSIVE** | No measurement window has opened. Sample = 0. |

The verdict function returns INCONCLUSIVE below the minimum sample, so this is
the system's own answer, not an editorial choice.

---

## 9 · EXTERNAL DEPENDENCIES

| # | Blocker | Owner | Status | Resolution criteria |
|---|---|---|---|---|
| 1 | D-11 ODbL boundary | Counsel | OPEN | written opinion recorded |
| 2 | D-12 lawful basis | Counsel | OPEN | `legal_basis_ref` issued; `publishBatch` runs |
| 3 | Real business data | Founder | OPEN | 10–25 records pass the ingestion gate |
| 4 | Basemap archive | Infrastructure | OPEN | `/ready` reports basemap configured |
| 5 | D-04 refund policy | Founder + counsel | OPEN | policy published and configured |
| 6 | D-05 invoicing / VAT | Accountant | OPEN | determination recorded |
| 7 | Staging infrastructure | Infrastructure | OPEN | staging verified running |
| 8 | Production SMS gateway | Infrastructure | OPEN | a real OTP delivers |
| 9 | Error-tracking provider | Infrastructure | OPEN | errors appear in the provider |

---

## 10 · PILOT DECISION

**CONTINUE — pending external inputs.** Window 0 passed; the system is ready to
receive Window 1 the day a lawful basis and ten real records exist.

Recorded conditions that would change this: any stop condition in
`STOP_CONDITIONS`, or a Window 1 exit gate failure.

---

## 11 · EXACT NEXT STEPS

1. **Counsel: D-11 and D-12.** Blocking for a fourth consecutive phase. The
   database physically refuses publication without D-12 — this is not a checklist
   item.
2. **Register the first real source** in `data_source` with its actual licence.
   Unknown stays UNKNOWN.
3. **Field-collect 10–25 businesses** across the three corridors, deliberately
   including businesses not expected to succeed, and record why each was chosen.
4. **Run Window 1**: import → validate → review → publish → open the window →
   freeze configuration → measure.
5. **Procure** the basemap, staging, SMS gateway and error tracker.
6. **Do not sell.** D-04 and D-05 are unresolved; willingness to pay may be
   asked about, never charged for.

---

## 12 · FINAL STATUS

> **PILOT READY — AWAITING ACTIVATION.**

The software, the operating procedures, the experiment design and the
measurement framework are complete and verified. What is missing is a legal
opinion, a field team's work, and four procurement decisions — none of which
code can supply, and none of which was invented here.
