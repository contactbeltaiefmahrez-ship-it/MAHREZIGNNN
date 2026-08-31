# MARKYRA — MVP ENGINEERING REPORT
## Phase 05 · Milestone 1 — Foundation and Constitutional Core

**Date** 28 August 2026 · **Scope of this milestone** Phases 5.1–5.2, the four
constitutional invariants, and the two hot-path query layers · **Verified against** PostgreSQL 16.15 + PostGIS 3.4.2

---

## 0 · SCOPE HONESTY

The Phase-05 brief describes the complete MVP: 16 modules, 29 screens, Next.js
web, Fastify API, worker, PWA, Ops Console, deployment. That is a multi-month
build for a team. **This milestone delivers the foundation and the parts that are
hardest to retrofit** — the schema, the module boundaries, and the four
invariants — and it delivers them working, not sketched.

Nothing here is scaffolding or mock. §77 of the brief prohibits fake
implementation, so the honest position is: what exists is real and tested; what
does not exist is listed in §5 with no optimistic language.

---

## 1 · REPOSITORY AUDIT (brief §05)

| Question | Finding |
|---|---|
| A · What already exists | **Nothing.** No repository, no package manager state, no migrations, no CI. Only the four Phase 02–04 documents. |
| B · What is correct | The four documents are internally consistent and implementable as written. |
| C · What must change | PostgreSQL **17 was unavailable**; the environment provides 16.15. PostGIS 3.5 → 3.4.2. Neither affects any feature used. Recorded as ADR-015. |
| D · What is missing | Everything. Greenfield. |
| E · What can be reused | The Arabic normalisation spec, the seat layout, the ranking weights and the state machines transfer verbatim from the documents. |
| F · What to remove | Nothing. |
| G · What to protect | Nothing yet — no production data exists. |

**Environment constraints found:** no Docker; PostgreSQL absent and installed
from apt during the audit; single CPU; network restricted to package registries.
PostgreSQL was obtained so the concurrency and idempotency invariants could be
**proven rather than asserted**, which is the difference between this milestone
and a design document.

---

## 2 · WHAT IS IMPLEMENTED AND TESTED

### 2.1 Database — 38 tables, 329 constraints, 84 indexes, 17 enums

Five forward-only migrations (622 lines). Conventions from Architecture §03.1
applied without exception: uuid v7 primary keys, `timestamptz` in UTC, **bigint
millimes for money**, Postgres enums for every state field, no soft delete on
financial or audit rows.

All eight correctness constraints from the Architecture exist and are tested:

| # | Constraint | Enforces |
|---|---|---|
| 1 | `market_seat unique(cycle_id, position)` | 100 seats exist exactly once |
| 2 | `market_seat unique(cycle_id, business_id)` | R25 · one seat per business per cycle |
| 3 | `seat_curated_tiers` CHECK | R29 · curated seats can never be sold |
| 4 | `seat_sellable_requires_order` CHECK | R42 · no seat goes live without a paid order |
| 5 | `cycle_transition unique(cycle_id, to_state)` | publish idempotency |
| 6 | `seat_order unique(cycle_id, business_id)` | no double ordering |
| 7 | `payment_external_ref_ix` partial unique | one bank reference, one order |
| 8 | `claim_one_active_ix` partial unique | two claims cannot both proceed |

Plus: `audit_entry` append-only triggers (UPDATE and DELETE both raise),
`offer_one_active_ix` (R31), `offer_max_30_days` (R33), the Grand Tunis boundary
as a **literal** CHECK so CORE never depends on GEO at runtime, and
`publish_requires_legal_basis` on `import_batch` — the seeding pipeline cannot
publish without counsel's D-12 reference recorded.

### 2.2 Module boundaries — mechanical, not cultural

16 modules with `module.json` manifests declaring dependencies and table
ownership (39 tables claimed, no table owned twice). A **custom ESLint rule**
(`tools/eslint/module-boundaries.js`) fails the build on:

- SQL in module A touching a table owned by module B
- SQL anywhere outside `modules/*/repository/`
- an import not declared in `module.json`
- an import reaching past another module's `service.ts`
- **`search` or `discovery` importing `attention`** — the constitutional rule,
  not overridable

`Math.random` is banned in domain code by a separate rule: rotation, allocation
and ranking must be reproducible.

**The rule caught a real violation in our own code.** The first `publishCycle`
implementation queried `business`, `seat_order` and `attention_grant` directly.
It was refactored so those modules expose repository functions that accept the
caller's `Tx` — ownership preserved, single transaction preserved. This is the
rule doing the job it was written for on day one.

### 2.3 The four invariants

| Invariant | Mechanism | Test evidence |
|---|---|---|
| **1 · a seat cannot be sold twice** | 100 rows pre-created with the cycle; allocation is `UPDATE … WHERE business_id IS NULL` under `FOR UPDATE SKIP LOCKED`; there is **no code path that inserts a seat** | **30 simultaneous allocations against 10 FEATURED seats → exactly 10 succeed, 10 distinct positions, 20 fail safely.** Second seat for the same business rejected by the database. Occupying a sellable seat without an order rejected. Selling a curated seat rejected. |
| **2 · attention affects neither search nor trust** | lint rule blocks the import path; `TrustInput` contains no money, order, grant, seat or tier field | 5 assertions incl. a source-level scan; a grant moves discovery score by exactly its published 10% weight and nothing else |
| **3 · publish is idempotent** | `unique(cycle_id,to_state)` + `pg_advisory_xact_lock`; all preconditions asserted inside the transaction | sequential double-publish → 4 grants not 8; **two concurrent publishes → exactly one does the work, neither errors**; **a failed publish leaves the previous cycle LIVE with zero partial grants**; unverified PREMIUM blocks publish (R24, third enforcement point) |
| **4 · owners cannot reach other businesses** | `ActorContext` is the required first argument of every repository function — there is no method taking a bare `business_id` | a test walks every repository export and asserts the first parameter is the actor |

### 2.4 Domain logic (pure, property-tested)

- **1-in-6 cap** — full algorithm with deterministic session-bucket rotation.
  The cap is `floor(organic/5)`, derived and commented, because `floor(visible/6)`
  over-delivers grants by ~20%. **Property-tested over 10,000 generated
  viewports**; zero grants below 5 organic pins; every granted item labelled;
  identical output for identical input; surplus grants **deferred, not dropped**.
- **Arabic normalisation** — diacritics, tatweel, alef/ya/ta-marbuta/hamza
  unification, Arabic-Indic → Western digits, Latin case and accent folding,
  definite-article variants. Shared by search and the seeding pipeline so index
  and data are normalised by the same code. Idempotent.
- **Discovery ranking** — deterministic, versioned, weights summing to 1,
  60% stored / 30% distance at request time, with a term-by-term `explain()` so
  "why is he above me?" is answered with arithmetic.
- **State machines** — cycle, seat order, claim. Invalid transitions throw.
  Order transitions are actor-gated: an owner *claiming* payment produces
  `PAYMENT_CLAIMED`, never `CONFIRMED`.
- **Money** — bigint millimes throughout; `pg` int8 parser overridden so bigints
  never silently degrade through `Number()`. **The schema contains no boolean
  `paid` column** — asserted by a test against `information_schema`.

### 2.5 Verification results (actually executed)

```
typecheck   PASS   (tsc --noEmit, strict, noUncheckedIndexedAccess)
lint        PASS   0 errors, module-boundary rule active
tests       PASS   9 files, 84 tests
```

### 2.6 Hot-path query layers (added after the first verification pass)

**PostGIS viewport** — bbox query on the GiST index with zoom-tier weight cuts,
category filter, precomputed ordering, plus grid-snapped clustering and a
nearest-density lookup. Tested against real geometry: bbox containment, tier
filtering, stable ordering, category filter, suspended exclusion, count/render
agreement, deterministic clusters, and index usability.

**Trigram search** — Arabic/French/Latin suggestions over the search projection,
with a prefix-only degraded path and zero-result capture. Tested against real
`pg_trgm`: Arabic name, hamza and diacritics omitted, definite article omitted,
unaccented French, a misspelling, minimum query length, genuine absence,
suspended exclusion, and the constitutional case — **granting a business every
possible boost leaves search results byte-identical**.

---

## 3 · DEFECTS AND CONTRADICTIONS FOUND WHILE BUILDING

### 3.1 uuid v7 prefixes collide

Integration tests failed with duplicate `invoice_number`. Cause: the fixture
derived human references by slicing a UUID — but **uuid v7 is time-ordered**, so
ids minted in the same millisecond share a long prefix. Any scheme that slices a
v7 uuid into a human reference collides under load.

Fixed properly in migration 005: invoice numbers and payment references come from
database sequences, and the payment reference carries a mod-97 checksum so a
mistyped reference fails fast instead of reconciling against the wrong order.
The unique constraints caught this before it could reach a merchant — which is
the argument for putting them there.

### 3.2 The Architecture contradicts its own boundary rule

Architecture §04.2 shows the viewport query LEFT JOINing `offer` and
`attention_grant`; §02.3 forbids a module from touching tables it does not own.
The lint rule caught it immediately. Both cannot hold.

Resolved the way §07.2 already resolves ranking: **precompute**. `has_active_offer`
and `has_active_grant` became stored columns on `business`, maintained by the
owning modules through functions they own. Those two booleans were *already*
inputs to `discovery_score`, so they were already being recomputed on the same
events — storing them costs nothing new. The hottest query in the product now
reads a single table with no joins: boundary-clean **and** faster. (ADR-017)

### 3.3 Search cannot read `business` either

Same class of violation. §02.2 had already declared `search_document` as the
search module's own table, and §06.1 argued search should live in CORE so the
index cannot lag the record. Both hold if the projection is written **in the same
transaction** as the business change. The business module hands search a plain
data object; search owns and queries only its own table. Dependency direction is
business → search, so there is no cycle. (ADR-018)

### 3.4 Word tokens must be indexed, not just whole names

A user searching «شمس» for «مقهى الشمس» found nothing: trigram similarity between
a 3-character token and the whole string falls well below threshold, and a prefix
match does not apply mid-string. Individual word tokens of 3+ characters are now
indexed as aliases. Found by a test written from the MVP Specification's own
search cases, not by inspection.

### 3.5 A test that asserted the wrong thing

The first index test asserted the planner would choose the GiST index. At 60 rows
a sequential scan is genuinely cheaper and Postgres was right. The test now
asserts the index **exists and is usable** (`enable_seqscan=off`), which is the
claim that actually matters at toy volume.

---

## 4 · ARCHITECTURE DECISIONS ADDED

**ADR-015 · PostgreSQL 16 instead of 17.** PG17 was not obtainable in this
environment. Nothing used is 17-only. The one consequence is `uuidv7()`, which
PG18 provides natively; implemented in userland plpgsql with identical ordering
and layout. *Status: accepted, environment-driven. Revisit on production
provisioning, where PG17 should be used.*

**ADR-016 · Cross-module writes share the caller's transaction.** A module needing
to change another module's table calls a repository function exported by the
owning module, passing its own `Tx`. Preserves both ownership and atomicity;
avoids the distributed-saga machinery a service split would have forced.
*Status: accepted.*

**ADR-017 · Denormalised viewport flags.** `has_active_offer` and
`has_active_grant` are stored on `business` and maintained by the offers and
attention modules. Removes two joins from the hot path and keeps the viewport
query inside one module's ownership. *Status: accepted.*

**ADR-018 · Search reads its own projection.** `search_document` is written in
the same transaction as the business change, so it is boundary-clean without
introducing index lag. *Status: accepted.*

---

## 5 · NOT YET BUILT

Stated plainly, with no optimistic language.

| Area | Status |
|---|---|
| Fastify API layer, routes, request validation | **Not started** |
| Next.js web app, SSR shopfront and category pages | **Not started** |
| PWA, service worker, offline states | **Not started** |
| MapLibre + PMTiles, static pin overlay, the load handoff | **Not started** |
| All 29 screens, component library, design tokens as code | **Not started** |
| OTP delivery, session cookies, CSRF, rate limiting | Domain logic only; no transport |
| Search SQL (trgm queries) | **Implemented and tested** — no HTTP layer |
| PostGIS viewport query, clustering | **Implemented and tested** — no HTTP layer |
| Verification, media, notification, receipt, analytics, ops modules | Schema + manifests; behaviour not implemented |
| Offers module | Schema + flag maintenance only; lifecycle not implemented |
| pg-boss jobs, worker entrypoint | **Not started** |
| CI pipeline, Docker, deployment, observability | **Not started** |
| Seed data, OSM pipeline | **Not started** |
| E2E, accessibility, performance tests | **Not started** |

**Realistic remaining effort: 4–6 engineer-months** to the Definition of Done in
brief §74. The foundation plus the two query layers is roughly 15–20% of the MVP by effort, but it is the
part that is expensive to retrofit and cheap to get right now.

---

## 6 · RISKS

| Risk | Note |
|---|---|
| Boundary rule friction | It already forced one refactor. That is the intent, but the team must not be tempted to add exceptions — an exception list is how these rules die. |
| PG16 vs 17 drift | Production should provision 17; the userland `uuid_generate_v7()` becomes redundant and should be dropped in a later migration. |
| Untested surface is large | 84 tests cover the invariants, the domain logic and both hot-path query layers. Everything in §5 is untested because it does not exist. |
| Single-node test DB | Concurrency tests run against one Postgres instance. They prove the locking model, not multi-node behaviour under production load. |

---

## 7 · DECISIONS NEEDED

Only the inherited ones. This milestone raised no new founder decisions.

1. **D-11 · ODbL boundary** — blocks seeding. The schema is built for it (CORE
   holds `delegation_code` text; no FK to any OSM polygon; no GEO connection).
2. **D-12 · Lawful basis for seeded listings** — blocks seeding. `import_batch`
   already refuses to publish without a `legal_basis_ref`.
3. **D-04 / D-05 · Refund policy and invoicing** — block the first paid cycle.
   The refund table and order states exist and are ready for either answer.
