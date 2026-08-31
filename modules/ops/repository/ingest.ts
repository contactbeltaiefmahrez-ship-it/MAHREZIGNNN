import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { AppError } from '../../../platform/errors.ts';
import { normalizeBusinessName, normalizePhoneTN, normalizeUrl, normalizeAddress, normalizeDelegationCode } from '../domain/normalize-tn.ts';
import { validateCandidate, qualityScore, batchAcceptable, isLocatable, type StagingCandidate } from '../domain/validate.ts';
import { classify, autoMergeable, requiresOpsReview } from '../domain/dedupe.ts';
import type { CoordConfidence } from '../domain/types.ts';
import { findDuplicateCandidates, createImported, countClaimedInBatch, unpublishUnclaimedBatch } from '../../business/service.ts';
import { categoryIdBySlug } from '../../taxonomy/service.ts';
import { sourceOrigin } from './dataset.ts';

export interface RawRecord {
  name_ar?: string | null; name_fr?: string | null;
  phone?: string | null; website?: string | null; address?: string | null;
  governorate?: string | null; delegation?: string | null;
  lon?: number | null; lat?: number | null;
  category?: string | null;
  coordinate_confidence?: CoordConfidence;
  source_record_id?: string | null; source_timestamp?: string | null;
}

/** STEP 1 — land raw records in staging. Never in `business`. */
export async function stageBatch(
  _actor: ActorContext, tx: Tx, sourceCode: string, records: readonly RawRecord[],
): Promise<{ batchId: string; staged: number }> {
  const src = await tx.query<{ code: string }>(
    `select code from data_source where code=$1 and approved_at is not null`, [sourceCode]);
  if (src.rowCount === 0) {
    throw new AppError('VALIDATION_FAILED',
      `source '${sourceCode}' is not registered and approved. Register its licence first.`);
  }
  const b = await tx.query<{ id: string }>(
    `insert into import_batch (source, source_code, record_count)
     values ($1,$1,$2) returning id`, [sourceCode, records.length]);
  const batchId = b.rows[0]!.id;
  for (const r of records) {
    await tx.query(
      `insert into staging_business
         (batch_id, raw, name_ar, name_fr, phone_e164, website, address_text,
          governorate, delegation_code, lon, lat, category_slug,
          coordinate_confidence, source_record_id, source_timestamp)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::coord_confidence,$14,$15)`,
      [batchId, JSON.stringify(r), r.name_ar ?? null, r.name_fr ?? null,
       r.phone ?? null, r.website ?? null, r.address ?? null,
       r.governorate ?? null, r.delegation ?? null, r.lon ?? null, r.lat ?? null,
       r.category ?? null, r.coordinate_confidence ?? 'UNKNOWN',
       r.source_record_id ?? null, r.source_timestamp ?? null],
    );
  }
  return { batchId, staged: records.length };
}

/** STEP 2 — normalise. Display values are preserved; only derived fields change. */
export async function normalizeBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<number> {
  const rows = await tx.query<{ id: string; name_ar: string | null; name_fr: string | null;
    phone_e164: string | null; website: string | null; address_text: string | null;
    delegation_code: string | null }>(
    `select id, name_ar, name_fr, phone_e164, website, address_text, delegation_code
       from staging_business where batch_id=$1 and state='RAW'`, [batchId]);
  for (const r of rows.rows) {
    const display = r.name_ar ?? r.name_fr ?? '';
    await tx.query(
      `update staging_business
          set name_normalized=$2, phone_e164=$3, website=$4,
              address_text=$5, delegation_code=$6, state='NORMALIZED'
        where id=$1`,
      [r.id, normalizeBusinessName(display), normalizePhoneTN(r.phone_e164),
       normalizeUrl(r.website), normalizeAddress(r.address_text),
       normalizeDelegationCode(r.delegation_code)],
    );
  }
  return rows.rowCount ?? 0;
}

/** STEP 3 — validate. Errors reject the record; accuracy doubts downgrade confidence. */
export async function validateBatch(
  _actor: ActorContext, tx: Tx, batchId: string, sourceReliability: number,
): Promise<{ validated: number; rejected: number }> {
  const rows = await tx.query<StagingCandidate & { id: string; source_code: string | null }>(
    `select s.id, s.name_ar as "nameAr", s.name_fr as "nameFr",
            s.phone_e164 as "phoneE164", s.website, s.address_text as "addressText",
            s.governorate, s.delegation_code as "delegationCode",
            s.lon, s.lat, s.category_slug as "categorySlug",
            s.coordinate_confidence as "coordinateConfidence",
            s.source_record_id as "sourceRecordId", b.source_code as "sourceCode"
       from staging_business s join import_batch b on b.id=s.batch_id
      where s.batch_id=$1 and s.state='NORMALIZED'`, [batchId]);
  let validated = 0, rejected = 0;
  for (const r of rows.rows) {
    const v = validateCandidate(r);
    const q = qualityScore({
      hasNameAr: !!r.nameAr, hasNameFr: !!r.nameFr, hasPhone: !!r.phoneE164,
      hasWebsite: !!r.website, hasAddress: !!r.addressText,
      hasDelegation: !!r.delegationCode, hasCategory: !!r.categorySlug,
      confidence: v.confidence, sourceReliability, ageDays: null,
      warningCount: v.warnings.length,
    });
    const ok = v.errors.length === 0;
    if (ok) validated++; else rejected++;
    await tx.query(
      `update staging_business
          set state=$2::staging_state, errors=$3::jsonb, warnings=$4::jsonb,
              quality_score=$5, coordinate_confidence=$6::coord_confidence
        where id=$1`,
      [r.id, ok ? 'VALIDATED' : 'REJECTED', JSON.stringify(v.errors),
       JSON.stringify(v.warnings), q, v.confidence],
    );
  }
  return { validated, rejected };
}

/** STEP 4 — deduplicate against published businesses AND within the batch. */
export async function dedupeBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<{ confirmed: number; review: number; distinct: number }> {
  // The batch's source determines which population it is compared against.
  const src = await tx.query<{ origin: string }>(
    `select s.origin::text as origin from import_batch b
       join data_source s on s.code = b.source_code where b.id = $1`, [batchId]);
  const origin = (src.rows[0]?.origin ?? 'REAL') as 'REAL' | 'FIXTURE' | 'TEST';
  const rows = await tx.query<{ id: string; name_normalized: string; lon: number; lat: number;
    phone_e164: string | null; website: string | null; category_slug: string }>(
    `select id, name_normalized, lon, lat, phone_e164, website, category_slug
       from staging_business where batch_id=$1 and state='VALIDATED'`, [batchId]);
  let confirmed = 0, review = 0, distinct = 0;
  for (const r of rows.rows) {
    const cands = await findDuplicateCandidates(_actor, tx, {
      nameNormalized: r.name_normalized, lon: r.lon, lat: r.lat,
      phone: r.phone_e164, website: r.website,
      categoryId: await categoryIdBySlug(_actor, tx, r.category_slug),
      origin,
    });

    let best: { id: string; verdict: ReturnType<typeof classify> } | null = null;
    for (const c of cands) {
      const v = classify({
        nameSimilarity: Number(c.sim), distanceMetres: c.dist === null ? null : Number(c.dist),
        phoneMatch: c.phone_match, websiteMatch: c.url_match, sameCategory: c.same_cat,
      });
      if (!best || v.score > best.verdict.score) best = { id: c.id, verdict: v };
    }

    if (best && autoMergeable(best.verdict)) {
      confirmed++;
      await tx.query(
        `update staging_business set state='DUPLICATE', dup_class=$2::dup_class,
                dup_of_business_id=$3, dup_score=$4 where id=$1`,
        [r.id, best.verdict.class, best.id, best.verdict.score]);
    } else if (best && requiresOpsReview(best.verdict)) {
      review++;
      await tx.query(
        `update staging_business set dup_class=$2::dup_class, dup_of_business_id=$3, dup_score=$4
          where id=$1`, [r.id, best.verdict.class, best.id, best.verdict.score]);
      await tx.query(
        `insert into duplicate_review (staging_id, business_id, dup_class, score, signals)
         values ($1,$2,$3::dup_class,$4,$5::jsonb)
         on conflict (staging_id, business_id) do nothing`,
        [r.id, best.id, best.verdict.class, best.verdict.score,
         JSON.stringify(best.verdict.signals)]);
    } else {
      distinct++;
      await tx.query(
        `update staging_business set dup_class='DISTINCT' where id=$1`, [r.id]);
    }
  }
  return { confirmed, review, distinct };
}

/** STEP 5 — the gate. A batch that fails does not publish. */
export async function evaluateBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<{ ok: boolean; reasons: string[]; stats: Record<string, number> }> {
  const s = await tx.query<{ total: string; errored: string; dup: string; medq: string | null }>(
    `select count(*)::text total,
            count(*) filter (where state='REJECTED')::text errored,
            count(*) filter (where state='DUPLICATE')::text dup,
            (percentile_cont(0.5) within group (order by quality_score))::text medq
       from staging_business where batch_id=$1`, [batchId]);
  const row = s.rows[0]!;
  const stats = {
    total: Number(row.total), errorRecords: Number(row.errored),
    duplicateRecords: Number(row.dup), medianQuality: Math.round(Number(row.medq ?? 0)),
  };
  const g = batchAcceptable(stats);
  await tx.query(
    `update import_batch set state=$2, stats=$3::jsonb where id=$1`,
    [batchId, g.ok ? 'VALIDATED' : 'REJECTED', JSON.stringify(stats)]);
  return { ...g, stats };
}

/**
 * STEP 6 — publish. Requires an approved gate AND a legal basis reference
 * (D-12), which the schema enforces. Imported businesses are UNCLAIMED and
 * UNVERIFIED: data existing is not a business being verified (Phase 06 §18).
 */
export async function publishBatch(
  _actor: ActorContext, tx: Tx, batchId: string, legalBasisRef: string,
): Promise<{ published: number; skippedLowConfidence: number }> {
  const b = await tx.query<{ state: string }>(
    `select state from import_batch where id=$1 for update`, [batchId]);
  if (b.rows[0]?.state !== 'VALIDATED') {
    throw new AppError('INVALID_STATE_TRANSITION',
      `batch is ${b.rows[0]?.state ?? 'missing'}; only VALIDATED batches publish`);
  }
  const rows = await tx.query<{ id: string; name_ar: string | null; name_fr: string | null;
    name_normalized: string; phone_e164: string | null; website: string | null;
    address_text: string | null; delegation_code: string; lon: number; lat: number;
    category_slug: string; coordinate_confidence: string; quality_score: number;
    source_record_id: string | null; source_timestamp: string | null; source_code: string }>(
    `select s.*, b.source_code from staging_business s join import_batch b on b.id=s.batch_id
      where s.batch_id=$1 and s.state='VALIDATED' and s.dup_class='DISTINCT'`, [batchId]);

  let published = 0, skipped = 0;
  for (const r of rows.rows) {
    if (!isLocatable(r.coordinate_confidence as CoordConfidence)) { skipped++; continue; }
    const newId = await createImported(_actor, tx, {
      nameAr: r.name_ar ?? r.name_fr ?? '', nameFr: r.name_fr,
      nameNormalized: r.name_normalized, categorySlug: r.category_slug,
      delegationCode: r.delegation_code, lon: r.lon, lat: r.lat,
      addressText: r.address_text, phone: r.phone_e164, website: r.website,
      coordinateConfidence: r.coordinate_confidence, sourceCode: r.source_code,
      sourceRecordId: r.source_record_id, sourceTimestamp: r.source_timestamp,
      qualityScore: r.quality_score, batchId,
      origin: await sourceOrigin(_actor, tx, r.source_code),
    });
    if (newId === null) { skipped++; continue; }
    await tx.query(
      `update staging_business set state='PUBLISHED', published_business_id=$2 where id=$1`,
      [r.id, newId]);
    published++;
  }
  await tx.query(
    `update import_batch set state='PUBLISHED', published_at=now(), legal_basis_ref=$2
      where id=$1`, [batchId, legalBasisRef]);
  return { published, skippedLowConfidence: skipped };
}

/** STEP 7 — rollback. Never a manual SQL edit (Phase 06 §48). */
export async function rollbackBatch(
  _actor: ActorContext, tx: Tx, batchId: string,
): Promise<{ unpublished: number; preservedClaimed: number }> {
  // A business claimed since import is NOT reverted: an owner's work outranks
  // our import bookkeeping.
  const preservedClaimed = await countClaimedInBatch(_actor, tx, batchId);
  const unpublished = await unpublishUnclaimedBatch(_actor, tx, batchId);
  await tx.query(
    `update import_batch set state='ROLLED_BACK', rolled_back_at=now() where id=$1`, [batchId]);
  return { unpublished, preservedClaimed };
}
