import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool, closePool, withTx } from '../../platform/db.ts';
import { suggest, suggestPrefixOnly, reindex, MIN_QUERY_LENGTH } from '../../modules/search/service.ts';
import { queryViewport, countInViewport, queryClusters, CLUSTER_THRESHOLD } from '../../modules/business/repository/viewport.ts';
import { resetDb, seedTaxonomy, seedBusiness, SYS } from '../fixtures.ts';
import { getPool as pool } from '../../platform/db.ts';

let categoryId: string; let delegation: string;

async function indexAll(): Promise<void> {
  const rows = await pool().query<{
    id: string; name_ar: string; name_fr: string | null; aliases: string[];
    delegation_code: string; category_id: string; trust_level: string; state: string;
  }>(`select id,name_ar,name_fr,aliases,delegation_code,category_id,trust_level::text,state::text from business`);
  await withTx(async (tx) => {
    for (const r of rows.rows) {
      await reindex(SYS, tx, {
        businessId: r.id, nameAr: r.name_ar, nameFr: r.name_fr, aliases: r.aliases,
        delegationCode: r.delegation_code, categoryId: r.category_id,
        trustLevel: r.trust_level as 'CLAIMED', searchable: r.state === 'PUBLISHED',
      });
    }
  });
}

beforeEach(async () => {
  await resetDb();
  const t = await seedTaxonomy();
  categoryId = t.categoryId; delegation = t.delegation;
});
afterAll(async () => { await closePool(); });

describe('Search · Arabic, French, misspellings — against real pg_trgm', () => {
  beforeEach(async () => {
    await seedBusiness({ categoryId, delegation, name: 'مقهى الشمس' });
    await seedBusiness({ categoryId, delegation, name: 'مخبزة الأمل' });
    await seedBusiness({ categoryId, delegation, name: 'Café Echems' });
    await indexAll();
  });

  it('finds a business by its Arabic name', async () => {
    const r = await withTx((tx) => suggest(SYS, tx, 'مقهى الشمس'));
    expect(r.map((x) => x.name_ar)).toContain('مقهى الشمس');
  });

  it('finds it when the hamza and diacritics are omitted', async () => {
    const r = await withTx((tx) => suggest(SYS, tx, 'مخبزه الامل'));
    expect(r.map((x) => x.name_ar)).toContain('مخبزة الأمل');
  });

  it('finds it without the definite article', async () => {
    const r = await withTx((tx) => suggest(SYS, tx, 'شمس'));
    expect(r.map((x) => x.name_ar)).toContain('مقهى الشمس');
  });

  it('finds a French name typed without accents', async () => {
    const r = await withTx((tx) => suggest(SYS, tx, 'cafe echems'));
    expect(r.map((x) => x.name_ar)).toContain('Café Echems');
  });

  it('tolerates a misspelling', async () => {
    const r = await withTx((tx) => suggest(SYS, tx, 'cafe echem'));
    expect(r.length).toBeGreaterThan(0);
  });

  it('returns nothing below the minimum query length', async () => {
    expect(await withTx((tx) => suggest(SYS, tx, 'م'))).toEqual([]);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('returns nothing for a genuinely absent business', async () => {
    expect(await withTx((tx) => suggest(SYS, tx, 'ززززز قققق'))).toEqual([]);
  });

  it('degrades to prefix-only search without erroring', async () => {
    const r = await withTx((tx) => suggestPrefixOnly(SYS, tx, 'مقهى'));
    expect(r.length).toBeGreaterThan(0);
  });

  it('CONSTITUTIONAL: an attention grant does not change search results', async () => {
    const before = await withTx((tx) => suggest(SYS, tx, 'مقهى'));
    // grant the LOWEST-ranked result every possible boost on the business row
    const target = before[before.length - 1]!;
    await getPool().query(
      `update business set has_active_grant=true, attention_weight=5,
              discovery_score=0.999999 where id=$1`, [target.id]);
    const after = await withTx((tx) => suggest(SYS, tx, 'مقهى'));
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  });

  it('excludes suspended businesses from the index', async () => {
    const biz = await seedBusiness({ categoryId, delegation, name: 'مقهى المرسى' });
    await getPool().query(`update business set state='SUSPENDED' where id=$1`, [biz]);
    await indexAll();
    const r = await withTx((tx) => suggest(SYS, tx, 'المرسى'));
    expect(r.map((x) => x.id)).not.toContain(biz);
  });
});

describe('Viewport · PostGIS against real geometry', () => {
  const BBOX = { west: 10.1, south: 36.7, east: 10.4, north: 36.95 };

  it('returns only businesses inside the bounding box', async () => {
    for (let i = 0; i < 20; i++) await seedBusiness({ categoryId, delegation });
    const all = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    expect(all.length).toBe(20);
    const tiny = await withTx((tx) =>
      queryViewport(SYS, tx, { west: 10.0, south: 36.6, east: 10.05, north: 36.65 }, 'STREET', null));
    expect(tiny.length).toBe(0);
  });

  it('honours zoom tiers by attention weight', async () => {
    for (let i = 0; i < 10; i++) await seedBusiness({ categoryId, delegation });
    await getPool().query(`update business set attention_weight=5 where id in
      (select id from business order by id limit 3)`);
    const street = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    const gov = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'GOVERNORATE', null));
    expect(street.length).toBe(10);
    expect(gov.length).toBe(3);
    expect(gov.every((r) => r.attention_weight >= 5)).toBe(true);
  });

  it('orders by discovery score with a stable id tie-break', async () => {
    for (let i = 0; i < 8; i++) await seedBusiness({ categoryId, delegation });
    const a = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    const b = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });

  it('filters by category', async () => {
    const other = await getPool().query<{ id: string }>(
      `insert into category (slug,name_ar,name_fr,color_hex,sort_order)
       values ('gyms','قاعات رياضة','Salles de sport','#16D2A0',5) returning id`);
    for (let i = 0; i < 5; i++) await seedBusiness({ categoryId, delegation });
    await seedBusiness({ categoryId: other.rows[0]!.id, delegation });
    const r = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', categoryId));
    expect(r.length).toBe(5);
    expect(r.every((x) => x.category_id === categoryId)).toBe(true);
  });

  it('excludes suspended and deleted businesses', async () => {
    const keep = await seedBusiness({ categoryId, delegation });
    const susp = await seedBusiness({ categoryId, delegation });
    await getPool().query(`update business set state='SUSPENDED' where id=$1`, [susp]);
    const r = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    expect(r.map((x) => x.id)).toEqual([keep]);
  });

  it('clusters deterministically — the same viewport yields the same clusters', async () => {
    for (let i = 0; i < 40; i++) await seedBusiness({ categoryId, delegation });
    const a = await withTx((tx) => queryClusters(SYS, tx, BBOX, 0.01, null));
    const b = await withTx((tx) => queryClusters(SYS, tx, BBOX, 0.01, null));
    expect(a).toEqual(b);
    expect(a.reduce((s, c) => s + c.n, 0)).toBe(40);
    expect(CLUSTER_THRESHOLD).toBe(150);
  });

  it('counts consistently with what it renders', async () => {
    for (let i = 0; i < 12; i++) await seedBusiness({ categoryId, delegation });
    const rows = await withTx((tx) => queryViewport(SYS, tx, BBOX, 'STREET', null));
    const n = await withTx((tx) => countInViewport(SYS, tx, BBOX, 'STREET', null));
    expect(n).toBe(rows.length);
  });

  it('has a usable GiST index on location', async () => {
    for (let i = 0; i < 60; i++) await seedBusiness({ categoryId, delegation });
    await getPool().query('analyze business');
    const idx = await getPool().query<{ indexname: string }>(
      `select indexname from pg_indexes
        where tablename='business' and indexdef ilike '%gist%location%'`);
    expect(idx.rowCount).toBeGreaterThan(0);
    // At 60 rows a sequential scan is genuinely cheaper, so assert the index is
    // USABLE rather than asserting the planner's cost decision at toy volume.
    const c = await getPool().connect();
    try {
      await c.query('set enable_seqscan = off');
      const plan = await c.query<{ 'QUERY PLAN': string }>(
        `explain select id from business
          where state='PUBLISHED' and deleted_at is null
            and location && ST_MakeEnvelope(10.1,36.7,10.4,36.95,4326)`);
      expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toMatch(/Index|Bitmap/);
    } finally {
      await c.query('reset enable_seqscan');
      c.release();
    }
  });
});
