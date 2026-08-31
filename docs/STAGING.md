# Staging deployment package

**Status: STAGING CONFIGURED — NOT DEPLOYED, NOT VERIFIED.**
No infrastructure credentials are available in this environment. Everything below
is prepared and buildable; none of it has been run against real infrastructure,
and this document does not claim otherwise.

## What staging needs

| Component | Requirement |
|---|---|
| Region | EU (Paris preferred) — ~30–50ms to Tunis |
| CORE database | Managed PostgreSQL 16+ with `postgis`, `pg_trgm`, `btree_gist`, `pgcrypto`; PITR on |
| GEO database | Separate instance. The app role must be **denied** `CONNECT`. |
| Object storage | Three buckets: `public-media`, `private-documents` (no public access, ever), `basemap` |
| CDN | In front of media and the basemap archive |
| Secrets | Managed store; never in the image or the repository |

## Processes

One image, three roles selected by command:

```bash
docker build -t markyra:$(git rev-parse --short HEAD) .
# api
docker run -e DATABASE_URL=... markyra:TAG
# worker
docker run -e DATABASE_URL=... markyra:TAG node --experimental-strip-types apps/worker/index.ts
# web
docker run -e NEXT_PUBLIC_API_URL=... markyra:TAG npx next start apps/web -p 3000
# ops (separate origin)
docker run -e NEXT_PUBLIC_API_URL=... markyra:TAG npx next start apps/ops -p 3001
```

## Deploy sequence

```
BACKUP  → pg_dump / confirm PITR window
MIGRATE → npm run db:migrate          (forward-only; destructive statements are
                                       blocked in CI without a named approver)
VALIDATE→ curl $API/ready             (must return 200 and database.ok = true)
DEPLOY  → roll api, then worker, then web/ops
HEALTH  → /health (liveness) and /ready (dependencies)
```

## Environment separation

| | Development | Staging | Production |
|---|---|---|---|
| Database credentials | local | **distinct** | **distinct** |
| Fixtures | yes (`source_code='FIXTURE'`) | **test data only** | **none — ever** |
| `SMS_PROVIDER` | `dev` (writes to `sms_outbox`, sends nothing) | `dev` or a test gateway | `production` |
| `ERROR_TRACKER_DSN` | unset | set | set |
| `NEXT_PUBLIC_PMTILES_URL` | unset (degraded map) | set once acquired | set |
| `NODE_ENV` | development | production | production |

CI enforces two guards: a destructive migration without an approver marker fails
the build, and a `FIXTURE` reference outside seed/test code fails the build.

## Rollback

| Layer | Mechanism | Limitation |
|---|---|---|
| web / ops / api / worker | redeploy the previous image tag | none |
| Database migration | forward-only; recover by PITR | **an already-applied migration is not automatically reversible** — this is stated, not glossed |
| Basemap | repoint `basemap_version`; archives are immutable and date-stamped | none |
| Search index | rebuild from `business` via the `search.reindex` job | index lag during rebuild |
| Import batch | `rollbackBatch` — preserves businesses claimed since import | claimed records need manual review |

## First staging run

```bash
npm ci && npm run db:migrate
npm run ops:create-staff -- <email> <password> ADMIN
# do NOT run db:seed in staging unless test data is explicitly wanted
```
