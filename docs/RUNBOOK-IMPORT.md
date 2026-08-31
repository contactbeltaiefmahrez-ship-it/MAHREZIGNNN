# Runbook — Real data import

## Preconditions
1. Source registered in `data_source` with `approved_at` set.
2. `legal_basis_ref` available for the batch (counsel's D-12 determination).
3. A tested restore point (see RUNBOOK-ROLLBACK).

## Procedure
```
stageBatch(actor, tx, sourceCode, records)   → staging only, never `business`
normalizeBatch(actor, tx, batchId)           → display values preserved
validateBatch(actor, tx, batchId, srcRel)    → errors reject; accuracy downgrades confidence
dedupeBatch(actor, tx, batchId)              → CONFIRMED auto; PROBABLE/POSSIBLE → ops queue
evaluateBatch(actor, tx, batchId)            → THE GATE. ok=false means stop.
publishBatch(actor, tx, batchId, legalRef)   → only VALIDATED batches; needs legalRef
```

## Gate thresholds
- error rate > 10% → the source mapping is wrong, not the data. Fix the mapping.
- duplicate rate > 25% → you are re-importing an existing set.
- median quality < 45 → the source is too sparse to be useful.

## What publish does NOT do
- It does not verify anything. Every imported business is `UNCLAIMED` / `UNVERIFIED`.
- It does not publish LOW or UNKNOWN coordinate confidence. Those are skipped and counted.
- It cannot run without `legal_basis_ref` — the database rejects it.

## After publish
Reindex search for the batch, refresh `delegation_density`, and spot-check 10
random records against reality before announcing coverage.
