import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/api/server.ts';
import { getPool, closePool } from '../../platform/db.ts';
import type { FastifyInstance } from 'fastify';
import { resetDb, seedTaxonomy, seedBusiness, seedCycle, SYS } from '../fixtures.ts';
import { reindex } from '../../modules/search/service.ts';
import { withTx } from '../../platform/db.ts';

let app: FastifyInstance;
const BBOX = 'west=10.10&south=36.74&east=10.40&north=36.92';

/** Self-seeding: this suite must not depend on the order other suites run in. */
beforeAll(async () => {
  await resetDb();
  const t = await seedTaxonomy();
  const cycleId = await seedCycle('LIVE');
  for (let i = 0; i < 40; i++) {
    const trust = i % 7 === 0 ? 'VERIFIED' : i % 3 === 0 ? 'CLAIMED' : 'UNCLAIMED';
    const id = await seedBusiness({
      categoryId: t.categoryId, delegation: t.delegation,
      trust, name: i % 2 === 0 ? `واجهة تجريبية ${i}` : `Vitrine Fixture ${i}`,
    });
    await withTx((tx) => reindex(SYS, tx, {
      businessId: id, nameAr: `واجهة تجريبية ${i}`, nameFr: `Vitrine Fixture ${i}`,
      aliases: [], delegationCode: t.delegation, categoryId: t.categoryId,
      trustLevel: trust, searchable: true,
    }));
    // a handful of grants so the sponsored/organic distinction is exercised
    if (i < 6) {
      await getPool().query(
        `insert into attention_grant (business_id,cycle_id,tier) values ($1,$2,'RISING')`,
        [id, cycleId]);
      await getPool().query(`select set_business_grant_flag($1::uuid)`, [id]);
    }
  }
  app = await buildServer();
  await app.ready();
});
afterAll(async () => { await app.close(); await closePool(); });

async function json(url: string, headers: Record<string, string> = {}) {
  const r = await app.inject({ method: 'GET', url, headers });
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, unknown> };
}

describe('API · contract and constitutional behaviour', () => {
  it('separates liveness from dependency readiness', async () => {
    const live = await json('/health');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('ok');
    const ready = await json('/ready');
    expect(ready.status).toBe(200);
    const checks = ready.body.checks as Record<string, { ok: boolean }>;
    expect(checks['database']?.ok).toBe(true);
    expect(ready.body.ready).toBe(true);
  });

  it('rejects a missing bbox with a stable error code', async () => {
    const r = await json('/v1/map/viewport');
    expect(r.status).toBe(400);
    expect((r.body.error as Record<string, string>).code).toBe('VALIDATION_FAILED');
  });

  it('rejects a degenerate bbox', async () => {
    const r = await json('/v1/map/viewport?west=10.4&south=36.9&east=10.1&north=36.7');
    expect(r.status).toBe(400);
  });

  it('returns pins AND clusters so the list works at any density', async () => {
    const r = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': 'test-1' });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.pins)).toBe(true);
    expect((r.body.pins as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(r.body.clusters)).toBe(true);
  });

  it('CONSTITUTIONAL: enforces 1-in-6 in the API response', async () => {
    for (const dev of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const r = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': dev });
      const granted = r.body.grantedCount as number;
      const visible = r.body.visibleCount as number;
      expect(granted * 6).toBeLessThanOrEqual(visible);
    }
  });

  it('CONSTITUTIONAL: every sponsored pin carries a label in the payload', async () => {
    const r = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': 'test-2' });
    const pins = r.body.pins as { sponsored: boolean; sponsoredLabel: { ar: string } | null }[];
    for (const p of pins) {
      if (p.sponsored) expect(p.sponsoredLabel?.ar).toBe('مموّل');
      else expect(p.sponsoredLabel).toBeNull();
    }
    expect(pins.some((p) => p.sponsored)).toBe(true);   // fixtures include grants
  });

  it('is deterministic for a given session', async () => {
    const a = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': 'stable' });
    const b = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': 'stable' });
    expect(JSON.stringify(a.body.pins)).toBe(JSON.stringify(b.body.pins));
  });

  it('CONSTITUTIONAL: search results carry no sponsorship field at all', async () => {
    const r = await json('/v1/search/suggest?q=Vitrine');
    const results = r.body.results as Record<string, unknown>[];
    expect(results.length).toBeGreaterThan(0);
    for (const x of results) {
      expect(x).not.toHaveProperty('sponsored');
      expect(x).not.toHaveProperty('sponsoredLabel');
    }
  });

  it('finds businesses by Arabic and by French name', async () => {
    expect(((await json('/v1/search/suggest?q=%D9%88%D8%A7%D8%AC%D9%87%D8%A9')).body.results as unknown[]).length).toBeGreaterThan(0);
    expect(((await json('/v1/search/suggest?q=Vitrine')).body.results as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns an empty result set, not an error, for nonsense', async () => {
    const r = await json('/v1/search/suggest?q=zzzqqqxxx');
    expect(r.status).toBe(200);
    expect(r.body.results).toEqual([]);
  });

  it('serves a shopfront without leaking internal fields', async () => {
    const vp = await json(`/v1/map/viewport?${BBOX}&zoom=16`, { 'x-device-id': 'test-3' });
    const id = (vp.body.pins as { id: string }[])[0]!.id;
    const r = await json(`/v1/business/${id}`);
    expect(r.status).toBe(200);
    const keys = Object.keys(r.body);
    for (const forbidden of ['discovery_score', 'quality_score', 'provenance',
                             'attention_weight', 'source_code', 'owner_account_id']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(JSON.stringify(r.body)).not.toContain('provenance');
  });

  it('returns 404 for a malformed id without revealing why', async () => {
    const r = await json('/v1/business/not-a-uuid');
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toMatch(/uuid|syntax|postgres/i);
  });

  it('never exposes a stack trace or database error', async () => {
    const r = await app.inject({ method: 'GET', url: '/v1/business/00000000-0000-0000-0000-000000000000' });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toMatch(/at .*\.ts:|relation|column/i);
  });

  it('no business is VERIFIED without an owner — trust is never granted by data', async () => {
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from business
        where trust_level <> 'UNCLAIMED' and owner_account_id is null`);
    expect(r.rows[0]!.n).toBe('0');
  });
});
