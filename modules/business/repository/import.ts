import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { categoryIdBySlug } from '../../taxonomy/service.ts';

export interface DuplicateCandidate {
  id: string; sim: number; dist: number | null;
  phone_match: boolean; url_match: boolean; same_cat: boolean;
}

/**
 * Candidate matches for an incoming record.
 *
 * Scoped BY ORIGIN, deliberately. Found in Window 0: comparing a real import
 * against every row in the database meant development fixtures flagged genuine
 * records as probable duplicates, and nothing could be published. Real data must
 * be deduplicated against real data; test data against test data.
 */
export async function findDuplicateCandidates(
  _actor: ActorContext, tx: Tx,
  p: { nameNormalized: string; lon: number; lat: number;
       phone: string | null; website: string | null; categoryId: string | null;
       /** Compare only within the same data origin. See the note below. */
       origin: 'REAL' | 'FIXTURE' | 'TEST' },
): Promise<DuplicateCandidate[]> {
  const r = await tx.query<DuplicateCandidate>(
    `select b.id,
            similarity(b.name_normalized, $1) as sim,
            ST_DistanceSphere(b.location, ST_SetSRID(ST_MakePoint($2,$3),4326)) as dist,
            (b.phone_e164 is not null and b.phone_e164 = $4) as phone_match,
            (b.external_url is not null and b.external_url = $5) as url_match,
            (b.category_id = $6::uuid) as same_cat
       from business b
      where b.deleted_at is null
        and b.origin = $7::data_origin
        and (b.name_normalized % $1
             or (b.phone_e164 is not null and b.phone_e164 = $4)
             or ST_DWithin(b.location::geography,
                           ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, 150))
      order by similarity(b.name_normalized, $1) desc
      limit 5`,
    [p.nameNormalized, p.lon, p.lat, p.phone, p.website, p.categoryId, p.origin]);
  return r.rows;
}

export interface ImportedBusinessSpec {
  nameAr: string; nameFr: string | null; nameNormalized: string;
  categorySlug: string; delegationCode: string; lon: number; lat: number;
  addressText: string | null; phone: string | null; website: string | null;
  coordinateConfidence: string; sourceCode: string; sourceRecordId: string | null;
  sourceTimestamp: string | null; qualityScore: number; batchId: string;
  /** Supplied by the caller from the source registry (ops owns `data_source`). */
  origin: 'REAL' | 'FIXTURE' | 'TEST';
}

/**
 * Imported businesses are created UNCLAIMED and UNVERIFIED. Data existing is
 * not a business being verified (Phase 06 §18); trust stays earned.
 * Returns null when the category slug is unknown, so the caller can count it.
 */
export async function createImported(
  _actor: ActorContext, tx: Tx, s: ImportedBusinessSpec,
): Promise<string | null> {
  const categoryId = await categoryIdBySlug(_actor, tx, s.categorySlug);
  if (categoryId === null) return null;
  const r = await tx.query<{ id: string }>(
    `insert into business
       (name_ar, name_fr, name_normalized, category_id, delegation_code, location,
        address_text, phone_e164, external_url, state, trust_level,
        coordinate_confidence, source_code, source_record_id, source_timestamp,
        quality_score, import_batch_id, provenance, origin)
     values ($1,$2,$3,$4,$5, ST_SetSRID(ST_MakePoint($6,$7),4326),
             $8,$9,$10,'PUBLISHED','UNCLAIMED',
             $11::coord_confidence,$12,$13,$14,$15,$16,$17::jsonb,$18::data_origin)
     returning id`,
    [s.nameAr, s.nameFr, s.nameNormalized, categoryId, s.delegationCode,
     s.lon, s.lat, s.addressText, s.phone, s.website, s.coordinateConfidence,
     s.sourceCode, s.sourceRecordId, s.sourceTimestamp, s.qualityScore, s.batchId,
     JSON.stringify({ source: s.sourceCode, batch: s.batchId,
       source_record_id: s.sourceRecordId, imported_at: new Date().toISOString() }),
     s.origin]);
  return r.rows[0]!.id;
}

export async function countClaimedInBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<number> {
  const r = await tx.query<{ n: string }>(
    `select count(*)::text n from business
      where import_batch_id = $1 and trust_level <> 'UNCLAIMED'`, [batchId]);
  return Number(r.rows[0]!.n);
}

/**
 * Batch rollback. A business CLAIMED since import is never reverted: an owner's
 * work outranks our import bookkeeping.
 */
export async function unpublishUnclaimedBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<number> {
  const r = await tx.query(
    `update business set state='DRAFT', deleted_at=now()
      where import_batch_id = $1 and trust_level = 'UNCLAIMED' and deleted_at is null`,
    [batchId]);
  return r.rowCount ?? 0;
}
