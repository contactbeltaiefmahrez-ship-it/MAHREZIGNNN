import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { AppError } from '../../../platform/errors.ts';
import { qualityCounts, publishedForFreeze } from '../../business/service.ts';

export interface QualityMetrics {
  total: number; published: number; unclaimed: number; claimed: number; verified: number;
  low_confidence: number; missing_phone: number; median_quality: number;
  staged_total: number; staged_rejected: number; staged_duplicate: number;
  pending_duplicate_review: number; batches_blocked_by_legal_basis: number;
}

/** Operational metrics. Never investor metrics — synthetic fixtures are counted. */
export async function qualityMetrics(
  actor: ActorContext, tx: Tx,
): Promise<QualityMetrics> {
  // Business counts come from the module that owns `business`; ingestion
  // counts come from the tables ops owns. Neither reaches across.
  const b = await qualityCounts(actor, tx);
  const r = await tx.query<Record<string, string>>(`
    select
      (select count(*) from staging_business)::text staged_total,
      (select count(*) from staging_business where state='REJECTED')::text staged_rejected,
      (select count(*) from staging_business where state='DUPLICATE')::text staged_duplicate,
      (select count(*) from duplicate_review where decision is null)::text pending_duplicate_review,
      (select count(*) from import_batch where state='VALIDATED'
         and legal_basis_ref is null)::text batches_blocked_by_legal_basis`);
  const x = r.rows[0]!;
  const n = (k: string): number => Math.round(Number(x[k] ?? 0));
  return {
    ...b,
    staged_total: n('staged_total'), staged_rejected: n('staged_rejected'),
    staged_duplicate: n('staged_duplicate'),
    pending_duplicate_review: n('pending_duplicate_review'),
    batches_blocked_by_legal_basis: n('batches_blocked_by_legal_basis'),
  };
}

/**
 * Freeze a dataset version. Metrics computed later must be attributable to an
 * exact set of businesses at an exact moment, or they are not reproducible.
 */
export async function freezeDataset(
  actor: ActorContext, tx: Tx, label: string, notes?: string,
): Promise<{ versionId: string; count: number }> {
  const exists = await tx.query(`select 1 from pilot_dataset_version where label=$1`, [label]);
  if (exists.rowCount) throw new AppError('VALIDATION_FAILED', `dataset '${label}' already exists`);
  const v = await tx.query<{ id: string }>(
    `insert into pilot_dataset_version (label, notes, frozen_at, frozen_by)
     values ($1,$2,now(),$3) returning id`, [label, notes ?? null, actor.actorId]);
  const versionId = v.rows[0]!.id;
  const members = await publishedForFreeze(actor, tx);
  for (const m of members) {
    await tx.query(
      `insert into pilot_dataset_member
         (version_id, business_id, trust_at_freeze, quality_at_freeze)
       values ($1,$2,$3::trust_level,$4)`,
      [versionId, m.id, m.trust_level, m.quality_score]);
  }
  const count = members.length;
  await tx.query(`update pilot_dataset_version set business_count=$2 where id=$1`,
    [versionId, count]);
  return { versionId, count };
}

export async function listDatasets(
  _actor: ActorContext, tx: Tx,
): Promise<Array<{ id: string; label: string; business_count: number; frozen_at: string }>> {
  const r = await tx.query<{ id: string; label: string; business_count: number; frozen_at: string }>(
    `select id, label, business_count, frozen_at from pilot_dataset_version
      order by created_at desc limit 20`);
  return r.rows;
}

/** Platform configuration + migration state, for a window freeze (§50). */
export async function configSnapshot(
  _actor: ActorContext, tx: Tx,
): Promise<{ config: Record<string, unknown>; migrations: number; last_migration: string }> {
  const cfg = await tx.query<{ key: string; value_json: unknown }>(
    `select key, value_json from platform_config`);
  const m = await tx.query<{ n: string; last: string }>(
    `select count(*)::text n, max(filename) last from schema_migration`);
  return {
    config: Object.fromEntries(cfg.rows.map((c) => [c.key, c.value_json])),
    migrations: Number(m.rows[0]!.n), last_migration: m.rows[0]!.last,
  };
}

/** Origin classification of a registered source. Ops owns `data_source`. */
export async function sourceOrigin(
  _actor: ActorContext, tx: Tx, sourceCode: string,
): Promise<'REAL' | 'FIXTURE' | 'TEST'> {
  const r = await tx.query<{ origin: string }>(
    `select origin::text as origin from data_source where code = $1`, [sourceCode]);
  return (r.rows[0]?.origin ?? 'TEST') as 'REAL' | 'FIXTURE' | 'TEST';
}
