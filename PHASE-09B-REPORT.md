# MARKYRA — PHASE 09B
# LEGAL READINESS · SOURCE REGISTRATION · FIELD PREPARATION · WINDOW 1 PACKAGE

**Date** 29 Aug 2026 · Verified against a running system

---

## FINAL STATUS

> **WINDOW 1 READY — AWAITING LEGAL/DATA ACTIVATION**

The counsel dossier is prepared, the legal-decision machinery is built and
enforced, the field package is written, and the Window 1 entry gate reads live
system state. **D-11 and D-12 remain unresolved. Zero real businesses exist.**
Neither was invented.

```
typecheck PASS · lint PASS · 177 tests PASS (was 162) · web + ops builds PASS
WINDOW 0: 14/14 · data-origin audit: FIXTURE 240 · TEST 0 · REAL 0
PILOT ENTRY GATE: WINDOW 1 BLOCKED — 5 legal/data blockers
```

---

## 1 · THE GAP THIS PHASE CLOSED

`import_batch.legal_basis_ref` accepted **any string**. Window 0 published with
the literal `WINDOW0-INTERNAL-TEST-NOT-A-LEGAL-BASIS` and the gate was satisfied,
because it only checked for non-null.

For test data that is honest labelling. For real data it would have been a
**fabricated legal basis passing a gate designed to prevent exactly that** — and
nothing in the system would have noticed.

Now: a `REAL` batch may publish only against a `legal_basis` that is registered,
active, unexpired, and built from at least one `legal_decision` recorded with a
named counsel and a date. Enforced by a database trigger, tested seven ways
(invented string, null, registered-but-inactive, expired, no decisions, the
accepted path, and the still-permitted honest test label).

There is no path from an opinion in an email to a published record.

## 2 · A SECOND DEFECT, FOUND BY TEST

Two CHECK constraints written this phase silently passed the exact case they
existed to reject. `array_length('{}', 1)` returns **NULL**, not 0, and
`NULL >= 1` evaluates to NULL — which a CHECK treats as satisfied.

So a legal basis could be marked active with **zero** decisions, and an
authorisation could name **zero** fields. Both now use
`coalesce(array_length(...), 0)`. Migration 014.

This is worth naming because the constraint *looked* correct in review and only
failed under a test that asserted the rejection.

## 3 · DELIVERABLES

| | Document | Note |
|---|---|---|
| A | `docs/legal/COUNSEL-DECISION-PACK.md` | The packet to send. Concise enough to read; architecture, data flows, both question sets, and what we need back. |
| B | `docs/legal/D11-ODBL-COUNSEL-PACK.md` | 8 questions, each with the technical fact **as implemented** and the consequence of each answer. **Generated from the same code the entry gate reads**, so document and system cannot drift. |
| C | `docs/legal/D12-DATA-PUBLICATION-COUNSEL-PACK.md` | 9 questions, per data category. |
| D | `docs/legal/COUNSEL-DECISION-MATRIX.md` | Decision → what changes in code, data, UI, publication — under **both** answers. |
| E/F | `docs/legal/SOURCE-LICENSING-REGISTER.md` | Unknown stays UNKNOWN. A source cannot reach APPROVED_FOR_PILOT without recorded evidence — a CHECK constraint. |
| G/H | `docs/pilot/PILOT-WINDOW-1.md` | Sampling matrix demanding variation, including businesses **expected to fail**. The 25-row register is deliberately empty. |
| I | `docs/pilot/FIELD-COLLECTION-PROTOCOL.md` | 16 steps, coordinate rules, escalation path, rejection criteria. |
| J | `docs/pilot/BUSINESS-PARTICIPATION-DRAFT.md` | **DRAFT — SUBJECT TO COUNSEL REVIEW**, marked as such, with the review points listed. |
| K/L | `docs/pilot/PILOT-ENTRY-GATE.md` + `npm run pilot:gate` | Reads live system state; nothing is READY by assertion. |
| M | `docs/pilot/PILOT-DATASET-REGISTER.md` | Empty. v0.1 exists only when a real batch does. |
| N | 15 new tests | Legal gate, origin integrity, counsel questions. |

## 4 · WHAT WAS BUILT IN CODE

**`legal_decision`** — counsel decisions as returned: reference, question id,
name, firm, date, decision, scope, conditions, review date, document *pointer*.
The document itself is never stored.

**`legal_basis`** — a named permission built from recorded decisions; cannot be
active with none.

**`business_participation`** — authorisation records naming which fields the
representative approved. An authorisation naming no fields is rejected.

**Field collection columns on staging** — collector, collected_at, coordinate
method and precision, evidence kind, participation link, selection reason.

**Source licensing evidence** — url, terms checked date, evidence, derivative
database status, counsel status.

**`npm run pilot:gate`** — the entry gate computed from state: open counsel
questions, active bases, approved sources, REAL count, infrastructure env.

## 5 · THE QUESTION WE CANNOT ENGINEER AROUND

**D-12.Q4.** Among sole traders in the eight pilot categories, the business phone
is frequently the owner's personal mobile. **The system has no technical signal
that distinguishes them.** If they require different legal treatment, we need a
rule a field collector can apply while standing in the shop — not a rule that
depends on knowing something the collector cannot observe.

Everything else in D-12 can be handled by filtering on `contact_source`, which
the pipeline already records per field. This one needs a human answer.

## 6 · WHAT REMAINS — BY OWNER

**Lawyer decides:** D-11 Q1–Q8 · D-12 Q1–Q9 · D-13 operating entity.
Record via `recordDecision` → `registerBasis` → `activateBasis`.

**Field team collects:** 10–25 businesses across corridors A/B/C per the sampling
matrix, including businesses not expected to succeed, each with a written
selection reason.

**Company decides:** the alternative contact mechanism if D-12.Q3/Q4 forbid phone
publication (a product decision, deliberately not specified here) · whether to
proceed if D-11.Q6 restricts commercial use.

**Infrastructure procures:** basemap archive · staging · production SMS gateway
(Window 1 needs real OTP delivery for claims) · error tracker.

**Already done and verified:** ingestion, legal enforcement, origin integrity,
ops console, analytics segmentation, audit, security, dataset versioning,
rollback, field-data schema, entry gate.

## 7 · WHAT WAS NOT DONE, DELIBERATELY

No legal conclusion. No licence asserted. No business collected. No authorisation
signed. No coordinate recorded. No fixture relabelled REAL. The Window 1 register
is empty and the dataset register has no v0.1.

Every one of those could have been filled convincingly. Each would have been
indistinguishable from the real thing in this report — which is the reason none
of them was.
