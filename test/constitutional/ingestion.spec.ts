import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool, closePool, withTx } from '../../platform/db.ts';
import {
  stageBatch, normalizeBatch, validateBatch, dedupeBatch, evaluateBatch,
  publishBatch, rollbackBatch, validateCandidate, classify,
  normalizePhoneTN, normalizeUrl, normalizeBusinessName, isLocatable,
  qualityScore, batchAcceptable, type RawRecord,
} from '../../modules/ops/service.ts';
import { resetDb, seedTaxonomy, SYS } from '../fixtures.ts';


async function registerFixtureSource(): Promise<void> {
  await getPool().query(
    `insert into data_source
      (code,kind,display_name,license,attribution_required,attribution_text,
       commercial_use,redistribution,automated_extraction_permitted,reliability,
       approved_by,approved_at,origin)
     values ('FIXTURE','FIXTURE','Synthetic development fixture','internal-fixture',
             false,null,true,false,true,3,'phase-06-test',now(),'FIXTURE')
     on conflict (code) do nothing`);
}

/** Deliberately synthetic. Never presented as real Tunisian businesses. */
function fixtureRecords(n: number, opts: { valid?: boolean } = {}): RawRecord[] {
  const valid = opts.valid ?? true;
  return Array.from({ length: n }, (_, i) => ({
    name_ar: `مَقْهَى تَجْرِيبِيّ ${i}`,
    name_fr: `Commerce fixture ${i}`,
    phone: `2${String(10000000 + i).slice(0, 7)}`,
    website: `example-fixture-${i}.tn`,
    address: `Rue fixture ${i}`,
    governorate: 'Tunis',
    delegation: 'TUN-MARSA',
    lon: valid ? 10.2 + (i % 40) * 0.0031 : 2.35,
    lat: valid ? 36.8 + (i % 40) * 0.0027 : 48.85,
    category: 'cafes',
    coordinate_confidence: 'HIGH' as const,
    source_record_id: `FIXTURE-${i}`,
  }));
}

async function runPipeline(records: RawRecord[]): Promise<string> {
  const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'FIXTURE', records));
  await withTx((tx) => normalizeBatch(SYS, tx, batchId));
  await withTx((tx) => validateBatch(SYS, tx, batchId, 3));
  await withTx((tx) => dedupeBatch(SYS, tx, batchId));
  return batchId;
}

beforeEach(async () => {
  await resetDb();
  await getPool().query('truncate staging_business, duplicate_review, import_batch, data_source cascade');
  await seedTaxonomy();
  await registerFixtureSource();
});
afterAll(async () => { await closePool(); });

describe('Normalisation · Tunisian formats', () => {
  it('normalises every common Tunisian phone form to E.164', () => {
    for (const f of ['71234567', '+21671234567', '0021671234567', '21671234567', '71 234 567', '(71) 234-567']) {
      expect(normalizePhoneTN(f)).toBe('+21671234567');
    }
  });
  it('rejects implausible phone numbers', () => {
    expect(normalizePhoneTN('123')).toBeNull();
    expect(normalizePhoneTN('+3312345678')).toBeNull();
    expect(normalizePhoneTN('11234567')).toBeNull();   // no Tunisian prefix 1
  });
  it('accepts Arabic-Indic digits in phone input', () => {
    expect(normalizePhoneTN('٧١٢٣٤٥٦٧')).toBe('+21671234567');
  });
  it('normalises URLs and rejects malformed ones', () => {
    expect(normalizeUrl('example.tn')).toBe('https://example.tn');
    expect(normalizeUrl('http://a.tn/x/')).toBe('http://a.tn/x');
    expect(normalizeUrl('notaurl')).toBeNull();
  });
  it('expands Tunisian commercial abbreviations before normalising', () => {
    expect(normalizeBusinessName('Sté Ahmed')).toContain('societe');
    expect(normalizeBusinessName('Av. Habib Bourguiba')).toContain('avenue');
  });
  it('preserves the display name — normalisation is a separate value', async () => {
    const b = await runPipeline(fixtureRecords(3));
    const r = await getPool().query<{ name_ar: string; name_normalized: string }>(
      `select name_ar, name_normalized from staging_business where batch_id=$1 limit 1`, [b]);
    expect(r.rows[0]!.name_ar).toMatch(/مَقْهَى/);   // diacritics untouched in display
    expect(r.rows[0]!.name_normalized).not.toBe(r.rows[0]!.name_ar);
    expect(r.rows[0]!.name_normalized).not.toMatch(/[\u064B-\u0652]/);  // stripped
  });
});

describe('Validation · geographic validity is not accuracy', () => {
  const base = {
    nameAr: 'مقهى', nameFr: null, phoneE164: '+21671234567', website: null,
    addressText: 'x', governorate: 'Tunis', delegationCode: 'TUN-MARSA',
    lon: 10.2, lat: 36.85, categorySlug: 'cafes',
    coordinateConfidence: 'HIGH' as const, sourceRecordId: 'r1', sourceCode: 'FIXTURE',
  };
  it('accepts a well-formed record', () => {
    expect(validateCandidate(base).errors).toEqual([]);
  });
  it('rejects coordinates outside Tunisia', () => {
    const v = validateCandidate({ ...base, lon: 2.35, lat: 48.85 });   // Paris
    expect(v.errors.map((e) => e.code)).toContain('COORDINATES_OUTSIDE_TUNISIA');
  });
  it('rejects coordinates inside Tunisia but outside the pilot area', () => {
    const v = validateCandidate({ ...base, lon: 10.76, lat: 34.74 });  // Sfax
    expect(v.errors.map((e) => e.code)).toContain('COORDINATES_OUTSIDE_PILOT_AREA');
  });
  it('rejects Null Island', () => {
    expect(validateCandidate({ ...base, lon: 0, lat: 0 }).errors.map((e) => e.code))
      .toContain('COORDINATES_DEGENERATE');
  });
  it('rejects a record with no provenance', () => {
    expect(validateCandidate({ ...base, sourceCode: null }).errors.map((e) => e.code))
      .toContain('PROVENANCE_MISSING');
  });
  it('DOWNGRADES confidence for low precision rather than rejecting', () => {
    const v = validateCandidate({ ...base, lon: 10.2, lat: 36.85 });
    expect(v.errors).toEqual([]);                    // valid…
    expect(v.confidence).toBe('LOW');                // …but not accurate
    expect(isLocatable('LOW')).toBe(false);
  });
  it('flags an ID-like token as possible personal data', () => {
    const v = validateCandidate({ ...base, addressText: 'chez AB1234567' });
    expect(v.errors.map((e) => e.code)).toContain('POSSIBLE_PERSONAL_IDENTIFIER');
  });
  it('rejects an invalid phone but tolerates a missing one', () => {
    expect(validateCandidate({ ...base, phoneE164: '+3312' }).errors.map((e) => e.code))
      .toContain('PHONE_INVALID');
    expect(validateCandidate({ ...base, phoneE164: null }).errors).toEqual([]);
  });
});

describe('Deduplication · ambiguity is never auto-merged', () => {
  it('confirms on phone match plus a plausible name', () => {
    const v = classify({ nameSimilarity: 0.6, distanceMetres: 400, phoneMatch: true, websiteMatch: false, sameCategory: true });
    expect(v.class).toBe('CONFIRMED');
  });
  it('confirms on near-identical name at the same spot', () => {
    expect(classify({ nameSimilarity: 0.92, distanceMetres: 12, phoneMatch: false, websiteMatch: false, sameCategory: true }).class)
      .toBe('CONFIRMED');
  });
  it('sends a similar name nearby to ops review, not to a merge', () => {
    const v = classify({ nameSimilarity: 0.7, distanceMetres: 60, phoneMatch: false, websiteMatch: false, sameCategory: true });
    expect(['PROBABLE', 'POSSIBLE']).toContain(v.class);
  });
  it('does not call neighbouring shops duplicates just because they are close', () => {
    // Corridor A is a dense commercial street: adjacent shops are normal.
    const v = classify({ nameSimilarity: 0.30, distanceMetres: 8, phoneMatch: false,
                         websiteMatch: false, sameCategory: true });
    expect(v.class).toBe('DISTINCT');
  });
  it('still confirms when a strong identifier agrees, despite a weak name', () => {
    const v = classify({ nameSimilarity: 0.50, distanceMetres: 900, phoneMatch: true,
                         websiteMatch: false, sameCategory: false });
    expect(v.class).toBe('CONFIRMED');
  });
  it('treats a different business at the same address as distinct', () => {
    expect(classify({ nameSimilarity: 0.15, distanceMetres: 10, phoneMatch: false, websiteMatch: false, sameCategory: false }).class)
      .toBe('DISTINCT');
  });
  it('routes probable duplicates to the review queue during a batch run', async () => {
    const first = fixtureRecords(6);
    const b1 = await runPipeline(first);
    await withTx((tx) => evaluateBatch(SYS, tx, b1));
    await withTx((tx) => publishBatch(SYS, tx, b1, 'LEGAL-REF-TEST'));
    // re-import the same set: every record should now be caught as a duplicate
    const b2 = await runPipeline(first);
    const dups = await getPool().query<{ n: string }>(
      `select count(*)::text n from staging_business
        where batch_id=$1 and (state='DUPLICATE' or dup_class in ('PROBABLE','POSSIBLE'))`, [b2]);
    expect(Number(dups.rows[0]!.n)).toBeGreaterThan(0);
  });
});

describe('Batch gate · corrupt batches do not publish', () => {
  it('accepts a clean batch and publishes it', async () => {
    const b = await runPipeline(fixtureRecords(20));
    const g = await withTx((tx) => evaluateBatch(SYS, tx, b));
    expect(g.ok).toBe(true);
    const p = await withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST'));
    expect(p.published).toBeGreaterThan(0);
    const live = await getPool().query<{ n: string }>(
      `select count(*)::text n from business where import_batch_id=$1 and state='PUBLISHED'`, [b]);
    expect(Number(live.rows[0]!.n)).toBe(p.published);
  });

  it('REJECTS a batch whose coordinates are outside Tunisia', async () => {
    const b = await runPipeline(fixtureRecords(20, { valid: false }));
    const g = await withTx((tx) => evaluateBatch(SYS, tx, b));
    expect(g.ok).toBe(false);
    expect(g.reasons.some((r) => r.startsWith('ERROR_RATE_TOO_HIGH'))).toBe(true);
    await expect(withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST')))
      .rejects.toThrow(/only VALIDATED batches publish/);
    const live = await getPool().query<{ n: string }>(
      `select count(*)::text n from business where import_batch_id=$1`, [b]);
    expect(live.rows[0]!.n).toBe('0');           // nothing leaked into production
  });

  it('refuses an unregistered source', async () => {
    await expect(withTx((tx) => stageBatch(SYS, tx, 'SOME_SCRAPER', fixtureRecords(2))))
      .rejects.toThrow(/not registered and approved/);
  });

  it('flags thresholds correctly', () => {
    expect(batchAcceptable({ total: 100, errorRecords: 5, duplicateRecords: 5, medianQuality: 70 }).ok).toBe(true);
    expect(batchAcceptable({ total: 100, errorRecords: 30, duplicateRecords: 5, medianQuality: 70 }).ok).toBe(false);
    expect(batchAcceptable({ total: 0, errorRecords: 0, duplicateRecords: 0, medianQuality: 0 }).ok).toBe(false);
  });
});

describe('Trust and provenance survive import', () => {
  it('imports every business UNCLAIMED and UNVERIFIED', async () => {
    const b = await runPipeline(fixtureRecords(10));
    await withTx((tx) => evaluateBatch(SYS, tx, b));
    await withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST'));
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from business
        where import_batch_id=$1 and trust_level <> 'UNCLAIMED'`, [b]);
    expect(r.rows[0]!.n).toBe('0');
  });

  it('records provenance on every published record', async () => {
    const b = await runPipeline(fixtureRecords(8));
    await withTx((tx) => evaluateBatch(SYS, tx, b));
    await withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST'));
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from business
        where import_batch_id=$1
          and (provenance->>'source' is null or source_code is null)`, [b]);
    expect(r.rows[0]!.n).toBe('0');
  });

  it('refuses to publish without a legal basis reference (D-12)', async () => {
    const b = await runPipeline(fixtureRecords(5));
    await withTx((tx) => evaluateBatch(SYS, tx, b));
    await expect(getPool().query(
      `update import_batch set published_at=now(), legal_basis_ref=null where id=$1`, [b]))
      .rejects.toThrow(/publish_requires_legal_basis/);
  });

  it('never publishes a LOW-confidence coordinate', async () => {
    const recs = fixtureRecords(6).map((r) => ({ ...r, lon: 10.21, lat: 36.85 })); // 2 dp
    const b = await runPipeline(recs);
    await withTx((tx) => evaluateBatch(SYS, tx, b));
    const p = await withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST'))
      .catch(() => ({ published: 0, skippedLowConfidence: recs.length }));
    expect(p.published).toBe(0);
  });
});

describe('Rollback · reversible imports', () => {
  it('unpublishes an entire batch but preserves anything claimed since', async () => {
    const b = await runPipeline(fixtureRecords(12));
    await withTx((tx) => evaluateBatch(SYS, tx, b));
    const p = await withTx((tx) => publishBatch(SYS, tx, b, 'LEGAL-REF-TEST'));
    expect(p.published).toBeGreaterThan(2);

    // one owner claims a business after import
    const acct = await getPool().query<{ id: string }>(
      `insert into owner_account (phone_e164) values ('+21698000001') returning id`);
    await getPool().query(
      `update business set trust_level='CLAIMED', owner_account_id=$2
        where id=(select id from business where import_batch_id=$1 limit 1)`,
      [b, acct.rows[0]!.id]);

    const r = await withTx((tx) => rollbackBatch(SYS, tx, b));
    expect(r.preservedClaimed).toBe(1);
    expect(r.unpublished).toBe(p.published - 1);

    const still = await getPool().query<{ n: string }>(
      `select count(*)::text n from business
        where import_batch_id=$1 and state='PUBLISHED' and deleted_at is null`, [b]);
    expect(still.rows[0]!.n).toBe('1');          // only the claimed one remains
  });
});

describe('Quality scoring', () => {
  it('scores a complete verified record far above a sparse one', () => {
    const rich = qualityScore({ hasNameAr: true, hasNameFr: true, hasPhone: true,
      hasWebsite: true, hasAddress: true, hasDelegation: true, hasCategory: true,
      confidence: 'VERIFIED', sourceReliability: 5, ageDays: 10, warningCount: 0 });
    const sparse = qualityScore({ hasNameAr: true, hasNameFr: false, hasPhone: false,
      hasWebsite: false, hasAddress: false, hasDelegation: false, hasCategory: true,
      confidence: 'LOW', sourceReliability: 1, ageDays: 900, warningCount: 4 });
    expect(rich).toBeGreaterThan(85);
    expect(sparse).toBeLessThan(40);
  });
});
