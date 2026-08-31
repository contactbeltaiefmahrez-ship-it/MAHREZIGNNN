import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

/**
 * Cross-module reads inside ONE transaction go through the owning module and
 * share the caller's Tx. Ownership of `business` stays here; atomicity is kept.
 */
export async function countNotPublished(
  _actor: ActorContext, tx: Tx, businessIds: readonly string[],
): Promise<number> {
  if (businessIds.length === 0) return 0;
  const r = await tx.query<{ n: string }>(
    `select count(*)::text n from business where id = any($1::uuid[]) and state <> 'PUBLISHED'`,
    [businessIds],
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function countNotVerified(
  _actor: ActorContext, tx: Tx, businessIds: readonly string[],
): Promise<number> {
  if (businessIds.length === 0) return 0;
  const r = await tx.query<{ n: string }>(
    `select count(*)::text n from business where id = any($1::uuid[]) and trust_level <> 'VERIFIED'`,
    [businessIds],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Businesses an owner account controls — used to build ActorContext. */
export async function businessesOwnedBy(
  _actor: ActorContext, tx: Tx, ownerAccountId: string,
): Promise<string[]> {
  const r = await tx.query<{ id: string }>(
    `select id from business where owner_account_id = $1 and deleted_at is null`,
    [ownerAccountId]);
  return r.rows.map((x) => x.id);
}

export interface BusinessQualityCounts {
  total: number; published: number; unclaimed: number; claimed: number;
  verified: number; low_confidence: number; missing_phone: number; median_quality: number;
}

/** Business-side operational counts. The business module owns its own table. */
export async function qualityCounts(
  _actor: ActorContext, tx: Tx,
): Promise<BusinessQualityCounts> {
  const r = await tx.query<Record<string, string>>(`
    select count(*)::text total,
           count(*) filter (where state='PUBLISHED')::text published,
           count(*) filter (where trust_level='UNCLAIMED')::text unclaimed,
           count(*) filter (where trust_level='CLAIMED')::text claimed,
           count(*) filter (where trust_level='VERIFIED')::text verified,
           count(*) filter (where coordinate_confidence in ('LOW','UNKNOWN'))::text low_confidence,
           count(*) filter (where phone_e164 is null)::text missing_phone,
           coalesce(percentile_cont(0.5) within group (order by quality_score),0)::text median_quality
      from business where deleted_at is null`);
  const x = r.rows[0]!;
  const n = (k: string): number => Math.round(Number(x[k] ?? 0));
  return {
    total: n('total'), published: n('published'), unclaimed: n('unclaimed'),
    claimed: n('claimed'), verified: n('verified'),
    low_confidence: n('low_confidence'), missing_phone: n('missing_phone'),
    median_quality: n('median_quality'),
  };
}

/** Snapshot of the currently published set, for a dataset freeze. */
export async function publishedForFreeze(
  _actor: ActorContext, tx: Tx,
): Promise<Array<{ id: string; trust_level: string; quality_score: number }>> {
  const r = await tx.query<{ id: string; trust_level: string; quality_score: number }>(
    `select id, trust_level::text, quality_score from business
      where state='PUBLISHED' and deleted_at is null`);
  return r.rows;
}

/** Ids of REAL businesses. Fixture and test rows can never enter pilot metrics. */
export async function realBusinessIds(
  _actor: ActorContext, tx: Tx,
): Promise<string[]> {
  const r = await tx.query<{ id: string }>(
    `select id from business where origin = 'REAL' and deleted_at is null`);
  return r.rows.map((x) => x.id);
}

export async function originCounts(
  _actor: ActorContext, tx: Tx,
): Promise<Record<string, number>> {
  const r = await tx.query<{ origin: string; n: string }>(
    `select origin::text, count(*)::text n from business
      where deleted_at is null group by origin`);
  return Object.fromEntries(r.rows.map((x) => [x.origin, Number(x.n)]));
}
