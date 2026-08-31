# MARKYRA

A discovery layer for local commerce in Grand Tunis. People open a map and wander
through the businesses around them; a business can claim its shopfront and buy a
week of visibility in a weekly 100-seat market.

**Money buys visibility, never trust.** That rule is enforced in code, not policy.

---

## See it in one command

```bash
npm install
npm run dev            # http://localhost:3000
```

**No database required.** With no API running, the app serves clearly-labelled
demo data and shows a permanent banner saying so. You will see the real product —
discovery home, map, search, categories, shopfront, claim flow, and the weekly
market — with the interaction design, typography, colour system, states and
Arabic RTL exactly as they ship.

To run against the real API and database instead:

```bash
npm run dev:db         # local PostgreSQL for development
npm run db:migrate
npm run db:seed        # synthetic development fixtures
npm run dev:full       # API on :4000 + web on :3000
npm run ops            # ops console on :3001
```

### What you are looking at

| Screen | Route |
|---|---|
| Discovery home | `/` |
| Map + list | `/map` |
| Search | `/search` |
| Category | `/category/cafes` |
| Shopfront | `/business/demo-002` |
| Claim a business | `/claim/demo-002` |
| For business owners + the weekly market | `/for-business` |

---

## ⚠️ Data warning

**There are zero real businesses in this system.** Everything visible is either
demo data (frontend, `origin: DEMO`) or development fixtures (database,
`origin: FIXTURE`). Real data can only enter through staging → validation →
deduplication → **legal gate** → publish, and a database trigger refuses to
publish real records without a registered counsel decision.

The market grid on `/for-business` is an **illustrative layout**. No business has
bought a seat; the page says so on screen rather than showing an invented number.

The map has no basemap: no PMTiles archive has been acquired. The map renders its
designed degraded state — real pin positions over a neutral surface with an honest
banner — rather than pretending.

## Architecture

Modular monolith. TypeScript throughout. Three entrypoints, three databases.

```
apps/web      Next.js — discovery home (map + list), SSR shopfront
apps/api      Fastify — /v1 REST, error contract, rate limiting
modules/      17 domain modules, each owning its own tables
platform/     ActorContext, typed errors, money (bigint millimes), db
packages/     arabic normalisation · design tokens
db/migrations forward-only SQL
docs/         data source registry, import + rollback runbooks
test/         constitutional, concurrency, API, ingestion
```

**CORE / GEO separation is physical.** OSM-derived geodata lives in a separate
database the application role cannot connect to. No `dblink`, no `postgres_fdw`.
Verified in `docs/` and by role grants.

### Constitutional invariants (enforced, tested)

| Invariant | Mechanism |
|---|---|
| A seat cannot be sold twice | pre-created seat rows + unique constraints + `FOR UPDATE SKIP LOCKED` |
| Attention affects neither search nor trust | ESLint rule forbids `search`/`discovery` importing `attention`; `TrustInput` has no money field |
| Market publish is idempotent | `unique(cycle_id, to_state)` + `pg_advisory_xact_lock` |
| Owners cannot reach other businesses | `ActorContext` required as the first argument of every repository function |
| No unlabelled paid visibility | every sponsored pin carries `مموّل` in the API payload; grants suppressed where a label would be illegible |

The module-boundary lint rule fails the build on a cross-module table query.
It has caught seven real violations during development.

---

## Known limitations

- **No basemap.** No PMTiles archive exists; the map renders its designed
  degraded state (neutral canvas + real pins + an honest banner).
- **No authentication transport.** OTP state machines exist; SMS delivery,
  sessions and cookies do not.
- **No Ops Console UI.** Ingestion, duplicate review and moderation exist as
  tested functions and database state, with no interface.
- **No worker process.** Jobs are defined; pg-boss is not wired.
- Verification, media, notification, receipt and analytics modules are schema
  and domain logic only.

Full status: `MVP-STATUS.md`.
