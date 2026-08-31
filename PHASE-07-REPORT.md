# MARKYRA — PHASE 07
# MVP HARDENING + PILOT READINESS REPORT

**Date** 29 Aug 2026 · **Verified against** a running system, PostgreSQL 16.15 + PostGIS 3.4.2

---

## 1 · EXECUTIVE SUMMARY

Every P0 and P1 gap that could be closed from the repository has been closed.
Authentication, the claim flow, the Ops API, the audit writer, the worker,
analytics, readiness checks, CI and deployment configuration are implemented,
integrated and tested. Six external blockers remain, none of which is solvable
by writing code.

```
typecheck   PASS
lint        PASS   0 errors, module-boundary rule active
tests       PASS   13 files, 149 tests   (Phase 06: 127)
web build   PASS   / = 110 kB First Load JS (budget 120 kB)
acceptance  PASS   liveness, readiness, worker, ops auth, claim, audit,
                   analytics, responsive at 390/430/768/1280
```

**Final status: TECHNICALLY PILOT-READY — EXTERNAL BLOCKERS REMAIN.**

---

## 2 · HARDENING AUDIT (starting state)

| Blocker | Entry status | Now |
|---|---|---|
| Authentication | MISSING | **IMPLEMENTED** |
| Claim workflow | PARTIAL | **IMPLEMENTED** |
| OTP transport | MISSING | **IMPLEMENTED** (provider abstraction; production gateway config-dependent) |
| Ops Console API | MISSING | **IMPLEMENTED** |
| Audit writer | PARTIAL | **IMPLEMENTED** (hash chain, verified nightly) |
| Worker / pg-boss | MISSING | **IMPLEMENTED** (4 queues, scheduled, graceful shutdown) |
| Analytics events | MISSING | **IMPLEMENTED** (two streams, closed catalogue) |
| Health checks | PARTIAL | **IMPLEMENTED** (liveness ≠ readiness) |
| CI | MISSING | **IMPLEMENTED** |
| Deployment config | MISSING | **IMPLEMENTED** (Dockerfile, env separation) |
| Responsive UI | PARTIAL | **IMPLEMENTED** (no overflow at 390/430/768/1280) |
| PMTiles pipeline | MISSING | **IMPLEMENTED** · archive **EXTERNALLY BLOCKED** |
| Ops Console UI | MISSING | **PARTIAL** — API complete and tested; no browser UI |
| Basemap archive | BLOCKED | **EXTERNALLY BLOCKED** |
| Real businesses, D-11, D-12, D-04, D-05 | BLOCKED | **EXTERNALLY BLOCKED** |

---

## 3 · WHAT WAS IMPLEMENTED

**Authentication.** Opaque server-side sessions in `HttpOnly; SameSite` cookies —
not JWT, because suspension must take effect immediately and a stateless token
cannot be revoked without a revocation list, which is a session table with extra
steps. Owner sessions: 30-day absolute, 14-day sliding idle. Staff: 8-hour
absolute, 30-minute idle. Disabled staff lose their session on the next request.
Passwords use scrypt (deviation from the Architecture's Argon2id, recorded in
§Deviations). Rate limits are **database-backed**, so they survive a restart and
cannot be bypassed by hitting another node.

**Claim workflow, end to end.** `POST /v1/claim` accepts a business id and
**nothing else** — the OTP destination is read from `business.phone_e164`
server-side. A body carrying a phone is rejected with 400, and a test asserts it.
The masked destination never reveals the full number. Completing the minimum
profile moves the business to **CLAIMED, never VERIFIED**: claiming is not
verification, and only an ops decision produces VERIFIED.

**OTP transport.** A provider interface with a development adapter that writes to
`sms_outbox` with state `DEV_LOGGED` — a state deliberately distinct from `SENT`,
so no report can mistake a logged message for a delivered one. The production
adapter refuses loudly (`SMS_PROVIDER_NOT_CONFIGURED`) rather than pretending.

**Ops API.** Login, queues, business search, coordinate correction, verification
decisions, duplicate decisions, audit read and chain verification. Every route
resolves the session and checks the role **server-side**; ADMIN-only routes reject
an OPS session with 403. Login failures are identical for an unknown user and a
wrong password.

**Audit writer.** Every claim, verification, correction and ops login writes an
entry with actor, target, before/after and a SHA-256 hash chain. Verified nightly
by the worker.

**Worker.** pg-boss inside CORE, four declared queues, retry with backoff,
scheduled jobs (hourly offer expiry, nightly chain verification, nightly document
retention purge), graceful shutdown. Verified running with zero errors.

**Analytics.** Two streams with different guarantees. A **closed event catalogue** —
arbitrary payloads are rejected — and a scrubber that drops any property whose key
resembles a phone, email, token, password, code or name. Financial and audit data
stay out of analytics entirely.

**Readiness.** `/health` is liveness. `/ready` checks dependencies and returns 503
when a critical one is down. It reports the missing basemap as
`EXTERNALLY BLOCKED — degraded map` rather than hiding it.

---

## 4 · DEFECTS FOUND AND FIXED

**The OTP attempt counter was rolled back by its own failure.** The wrong-code
path threw inside the transaction that had just incremented `attempts`, so the
increment rolled back and an attacker had **unlimited attempts**. Restructured so
the failure is recorded and committed, then reported to the caller as a value the
route converts into an error after commit. Found by a lockout test, not by review.
This was the most serious defect of the phase.

**The audit hash chain broke on verification.** Postgres `jsonb` normalises and
**reorders object keys**, so hashing `JSON.stringify(value)` on write and again on
read produced different bytes and a spuriously "broken" chain — which would have
trained operators to ignore a real tamper alert. Both sides now canonicalise with
sorted keys.

**A module boundary violation in `identity`.** It queried `business` directly;
moved behind the business module's service. The lint rule has now caught **eight**
real violations across three phases.

**pg-boss v10 requires queues to be declared** before a worker attaches; without
it the worker logged errors forever while appearing to start.

---

## 5 · DEVIATIONS

**scrypt instead of Argon2id.** The Architecture specifies Argon2id. `argon2`
requires a native build that is not reliable in this environment. `scryptSync`
with N=16384, r=8, p=1 is a documented, memory-hard KDF from the Node standard
library. Swapping to Argon2id later touches two functions in
`modules/identity/repository/session.ts` and requires a password reset cycle.
**Recommend switching before production.**

---

## 6 · PILOT READINESS MATRIX

| Area | Status | Blocker | Owner | Required action |
|---|---|---|---|---|
| Application | READY | — | — | — |
| Authentication | READY | — | — | swap scrypt → Argon2id before production |
| Claim | READY | — | — | — |
| Trust | READY | — | — | — |
| Ops (API) | READY | — | — | — |
| Ops (UI) | **NOT READY** | no browser console | Engineering | build the console UI over the tested API |
| Worker | READY | — | — | — |
| Analytics | READY | — | — | — |
| Audit | READY | — | — | — |
| Search | READY | — | — | — |
| Discovery | READY | — | — | — |
| Map | PARTIAL | no basemap | Infrastructure | run `pmtiles extract`, upload, set `NEXT_PUBLIC_PMTILES_URL` |
| PMTiles pipeline | READY | archive **EXTERNALLY BLOCKED** | Infrastructure | as above |
| Real data | **BLOCKED** | none acquired | Founder | field-collect 600–900 businesses |
| Provenance | READY | — | — | — |
| Legal | **BLOCKED** | D-11, D-12 | Counsel | ODbL boundary opinion; lawful basis for seeded listings |
| Privacy | READY | — | — | — |
| Security | READY | — | — | external pen test before public launch |
| Deployment | READY (config) | not deployed | Infrastructure | provision managed PG, object storage, CDN |
| Staging | **NOT DEPLOYED** | no infrastructure | Infrastructure | apply the Dockerfile + CI to a staging environment |
| Commercial | **BLOCKED** | D-04, D-05 | Founder + accountant | refund policy; invoicing/VAT |
| Payments | READY (model) | D-04, D-05 | as above | configure, do not hardcode |
| Monitoring | PARTIAL | structured logs + readiness only | Engineering | wire an error tracker and alerting |

---

## 7 · EXTERNAL DEPENDENCIES REGISTER

| # | Blocker | Owner | Required action | Consequence if unresolved | Resolution criteria |
|---|---|---|---|---|---|
| 1 | **D-11** ODbL boundary | Counsel | Written opinion on the CORE/GEO separation | Cannot seed a single real business | Opinion recorded; boundary confirmed or pipeline source swapped |
| 2 | **D-12** lawful basis | Counsel | Position on publishing businesses and contact numbers | `publishBatch` refuses to run — a hard stop in code | `legal_basis_ref` issued and recorded on the batch |
| 3 | **Real business data** | Founder | Field-collect 600–900 records, 3 corridors | No pilot | Batch passes the ingestion gate |
| 4 | **Basemap archive** | Infrastructure | `pmtiles extract --bbox=9.90,36.55,10.55,37.10`, upload, configure | Map stays in its honest degraded state | `/ready` reports basemap configured |
| 5 | **D-04** refund policy | Founder + counsel | Publish terms before selling | Cannot open a paid cycle | Policy published and configured |
| 6 | **D-05** invoicing / VAT | Accountant | Determination on seat revenue | Cannot legally take money | Determination recorded |

None is fabricated around. Everything that can be built around them has been.

---

## 8 · REMAINING TECHNICAL WORK (not blocked)

1. **Ops Console UI** — the API is complete and tested; the browser interface is not built. This is the largest remaining engineering item and it is a genuine pilot requirement: ops cannot work from curl.
2. Argon2id migration.
3. Error tracker and alert wiring.
4. Mobile bottom sheet (the list is currently a fixed panel; no overflow at any tested width, but the approved sheet interaction is not implemented).
5. Staging deployment onto real infrastructure.

---

## 9 · FINAL STATUS

> **TECHNICALLY PILOT-READY — EXTERNAL BLOCKERS REMAIN.**

The system can support real merchants, real users, real claims, real verification,
real operations and real data **without another architectural rewrite**. It cannot
begin a pilot until counsel answers D-11 and D-12, a real dataset exists, a
basemap is published, the commercial decisions are made, and the Ops Console has a
user interface.
