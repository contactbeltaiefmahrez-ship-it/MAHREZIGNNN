# MARKYRA — COUNSEL DECISION PACK

**Prepared for company counsel. Nothing in this document is a legal conclusion.**
Every item is labelled FACT, ASSUMPTION, OPEN QUESTION or DECISION REQUIRED.
Where a decision has not been made, the system records `PENDING COUNSEL DECISION`
and refuses to publish.

---

## 1 · What MARKYRA is

**FACT.** A mobile-web discovery layer for Grand Tunis. People open a map and
browse local businesses by category. Businesses can claim their listing and buy a
week of visibility in a weekly 100-seat market. Revenue is paid visibility for
business records — never for geographic data, never for trust.

**FACT.** Nothing has launched. There are currently **zero real businesses** in
the system: 240 development fixtures and 10 test records, all structurally
classified so they cannot be counted as real.

## 2 · The two decisions blocking launch

| | |
|---|---|
| **D-11** | The ODbL / OpenStreetMap boundary between our geographic data and our business database. |
| **D-12** | The lawful basis for publishing business records and contact numbers. |

The system **cannot publish real data without your answer**: a database trigger
refuses any real batch whose legal basis is not a registered, active decision
recorded against your name and date. This is enforced, not procedural — see §6.

## 3 · Architecture, as actually implemented

```
   OSM-DERIVED SIDE                          MARKYRA PROPRIETARY SIDE
   ────────────────                          ────────────────────────
   upstream OSM extract                      field collection / business
        │                                    participation
        ▼                                         │
   GEO database  (separate instance)               ▼
   · admin boundaries only                   STAGING  (never production)
   · app role DENIED connect                       │  normalise
   · no dblink, no postgres_fdw                    ▼  validate
        │                                    dedupe · quality · provenance
        │  offline, once, code only               │
        ├──── delegation_code (text) ───────►     ▼
        │                                    ►  LEGAL GATE  ◄  trigger:
        ▼                                       real batch requires a
   PMTiles archive (static file)                 registered active basis
        │                                         │
        ▼                                         ▼
   CDN ──► MapLibre ──► browser              CORE database
                  ▲                          · business records
                  │                          · claims, verification
                  └── pins fetched from ─────┤ · orders, payments, audit
                      the CORE API at             │
                      runtime, never baked        ▼
                      into the tile archive   search · discovery · shopfront
```

**FACT — where OSM data exists:** the GEO database and the PMTiles archive.
**FACT — where MARKYRA business data exists:** the CORE database.
**FACT — where they interact:** visually in the browser, and once offline when a
`delegation_code` string is assigned during seeding.
**FACT — where they do not interact:** at runtime. The application role is denied
`CONNECT` on GEO. No `dblink` or `postgres_fdw` extension is installed in CORE.
Both are verifiable by query.

## 4 · D-11 — questions

Full technical context per question in `D11-ODBL-COUNSEL-PACK.md`. Summary:

| ID | Question |
|---|---|
| D-11.Q1 | May we use an OSM-derived extract as the basemap? |
| D-11.Q2 | May we render our own business records on top of it? |
| D-11.Q3 | Does that combination create a **Derivative Database** under ODbL? |
| D-11.Q4 | If so, which elements become subject to share-alike? |
| D-11.Q5 | What attribution text, placement and persistence are required? |
| D-11.Q6 | May we monetise paid visibility while using an OSM-derived basemap? |
| D-11.Q7 | What obligations attach to the PMTiles archive and its caches? |
| D-11.Q8 | What exact CORE/GEO separation must we maintain? |

**The pivotal one is Q3.** If a derivative database exists, share-alike may
attach to part of our business database — the company's core asset. We have built
the strongest separation we could and need to know whether it is the right one.

## 5 · D-12 — questions

Full per-field table in `D12-DATA-PUBLICATION-COUNSEL-PACK.md`. Summary:

| ID | Question |
|---|---|
| D-12.Q1 | May we publish name, category and address from a third party without prior consent? |
| D-12.Q2 | May we publish coordinates we collected ourselves? |
| D-12.Q3 | May we publish a number the business already displays publicly? |
| D-12.Q4 | **Where that number is the owner's personal mobile — common among sole traders in our categories — does it become personal data?** |
| D-12.Q5 | Does a third-party-sourced number need different treatment from an owner-supplied one? |
| D-12.Q6 | What notice and objection route must a listed business receive? |
| D-12.Q7 | Does this require a declaration under Loi 2004-63 / INPDP practice, and who is the controller? |
| D-12.Q8 | What lawful basis covers claimant data, and what retention applies? |
| D-12.Q9 | How long may verification documents be retained after a decision? |

**Q4 is the one we cannot engineer around.** The system has no technical signal
distinguishing a business line from a personal mobile used for business. If they
require different treatment, we need a rule a field collector can apply on the
spot.

## 6 · How the system enforces your answer

**FACT.** `legal_decision` stores each decision: reference, question id, your
name, firm, date, decision, scope, conditions, review date, and a pointer to the
document. **The document itself is not stored in the database.**

**FACT.** A `legal_basis` is a named permission built from one or more recorded
decisions. It cannot be activated with zero decisions — a database constraint.

**FACT.** Publishing a real batch fires a trigger that requires an active,
unexpired basis. Publishing with an invented string fails with an error. We
tested this: five tests cover invented strings, null values, unactivated bases,
and the accepted path.

**FACT.** Test and fixture batches may carry an honest descriptive label such as
`INTERNAL-TEST-NOT-A-LEGAL-BASIS`, because labelling test data is not claiming a
permission. Only `REAL` origin triggers the requirement.

## 7 · Trust states — what we do and do not assert

| State | Meaning | Asserted publicly |
|---|---|---|
| UNCLAIMED | We list it; nobody has claimed it | Nothing about the owner |
| CLAIMED | Someone proved control of the number **already on the listing** via OTP | Ownership claimed, not verified |
| VERIFIED | Ops approved a document or a field visit | Verified |

**CLAIMED is never treated as VERIFIED.** Import never produces either. The Ops
console states this on screen so an operator cannot infer otherwise.

## 8 · Corrections, deletion, audit

**FACT.** Every unclaimed listing carries a visible removal request, honoured
within 5 business days. Corrections require a reason and are written to an
append-only audit log with a hash chain. A whole import batch can be rolled back,
**except** businesses claimed since import — an owner's work outranks our
bookkeeping. Provenance is mandatory and is never overwritten.

## 9 · Decisions required from you

1. **D-11.Q1–Q8** — the ODbL boundary.
2. **D-12.Q1–Q9** — the publication basis, especially Q4 (sole-trader phone).
3. **D-13** — the operating entity and data controller.
4. **D-04 / D-05** — refund policy and invoicing/VAT (needed before any paid seat, not before the pilot).

## 10 · What we need back

For each answered question: a decision reference, the decision, its scope, any
conditions, and a review date. We record it verbatim. We do not implement a legal
decision before it is documented.
