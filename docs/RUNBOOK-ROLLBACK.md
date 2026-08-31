# Runbook — Rollback

## Batch rollback
```
rollbackBatch(actor, tx, batchId)
```
Sets every **UNCLAIMED** business from the batch to `DRAFT` + `deleted_at`.
**Businesses claimed since import are preserved** — an owner's work outranks our
import bookkeeping. The function returns `{ unpublished, preservedClaimed }`;
`preservedClaimed > 0` means a human must review those records manually.

Never use manual SQL as the normal recovery path (§48).

## Map dataset rollback
PMTiles archives are immutable and date-stamped. Rollback is repointing
`platform_config.basemap_version` at the previous archive. No cache invalidation
is needed because filenames are content-addressed.

## Database recovery
PITR to the moment before the batch. Restore drills are quarterly and timed
against the stated RTO; an untested backup is a hypothesis.
