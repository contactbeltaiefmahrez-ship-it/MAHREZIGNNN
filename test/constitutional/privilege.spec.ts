import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/api/server.ts';
import { getPool, closePool, withTx } from '../../platform/db.ts';
import { hashPassword } from '../../modules/identity/service.ts';
import { resetDb, seedTaxonomy, seedBusiness, SYS } from '../fixtures.ts';
import { reindex } from '../../modules/search/service.ts';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let bizId: string;
let opsCookie = '';
let adminCookie = '';

beforeAll(async () => {
  await resetDb();
  const t = await seedTaxonomy();
  bizId = await seedBusiness({ categoryId: t.categoryId, delegation: t.delegation, name: 'واجهة اختبار' });
  await withTx((tx) => reindex(SYS, tx, {
    businessId: bizId, nameAr: 'واجهة اختبار', nameFr: 'Test Vitrine', aliases: [],
    delegationCode: t.delegation, categoryId: t.categoryId, trustLevel: 'UNCLAIMED', searchable: true }));
  await getPool().query(
    `insert into staff_user (email,password_hash,role) values
       ('ops@markyra.tn',$1,'OPS'), ('admin@markyra.tn',$1,'ADMIN')`,
    [await hashPassword('correct-horse-battery')]);
  app = await buildServer(); await app.ready();

  const login = async (email: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/ops/login',
      payload: { email, password: 'correct-horse-battery' } });
    return /mk_ops=([^;]+)/.exec(r.headers['set-cookie'] as string)?.[1] ?? '';
  };
  opsCookie = await login('ops@markyra.tn');
  adminCookie = await login('admin@markyra.tn');
});
afterAll(async () => { await app.close(); await closePool(); });

const call = (method: 'GET'|'POST', url: string, cookie?: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as object,
    headers: cookie ? { cookie: `mk_ops=${cookie}` } : {} });

describe('Privilege · ops routes are not reachable without a staff session', () => {
  const OPS_ROUTES: [('GET'|'POST'), string][] = [
    ['GET', '/ops/me'], ['GET', '/ops/businesses'], ['GET', '/ops/queues'],
    ['GET', '/ops/audit'], ['GET', '/ops/audit/verify'],
    ['POST', '/ops/businesses/x/location'], ['POST', '/ops/verifications/x/decision'],
    ['POST', '/ops/duplicates/x/decision'],
  ];
  it('rejects every ops route for an unauthenticated caller', async () => {
    for (const [m, u] of OPS_ROUTES) {
      const r = await call(m, u);
      expect([401, 403], `${m} ${u}`).toContain(r.statusCode);
    }
  });
  it('rejects every ops route for a forged cookie', async () => {
    for (const [m, u] of OPS_ROUTES) {
      const r = await call(m, u, 'not-a-real-token');
      expect([401, 403], `${m} ${u}`).toContain(r.statusCode);
    }
  });
  it('allows OPS onto operational routes', async () => {
    expect((await call('GET', '/ops/queues', opsCookie)).statusCode).toBe(200);
    expect((await call('GET', '/ops/businesses', opsCookie)).statusCode).toBe(200);
  });
  it('denies OPS the ADMIN-only audit log', async () => {
    expect((await call('GET', '/ops/audit', opsCookie)).statusCode).toBe(403);
    expect((await call('GET', '/ops/audit', adminCookie)).statusCode).toBe(200);
  });
  it('rejects bad credentials identically to an unknown user', async () => {
    const a = await app.inject({ method: 'POST', url: '/ops/login',
      payload: { email: 'ops@markyra.tn', password: 'wrong' } });
    const b = await app.inject({ method: 'POST', url: '/ops/login',
      payload: { email: 'ghost@markyra.tn', password: 'wrong' } });
    expect(a.statusCode).toBe(b.statusCode);
    const code = (r: string): string => (JSON.parse(r) as { error: { code: string } }).error.code;
    expect(code(a.body)).toBe(code(b.body));   // request_id differs by design
  });
  it('revokes a session on logout', async () => {
    const r = await app.inject({ method: 'POST', url: '/ops/login',
      payload: { email: 'ops@markyra.tn', password: 'correct-horse-battery' } });
    const c = /mk_ops=([^;]+)/.exec(r.headers['set-cookie'] as string)?.[1] ?? '';
    expect((await call('GET', '/ops/me', c)).statusCode).toBe(200);
    await call('POST', '/ops/logout', c);
    expect((await call('GET', '/ops/me', c)).statusCode).toBe(401);
  });
});

describe('Claim · the OTP destination is never client-supplied', () => {
  it('refuses a body carrying a phone number', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/claim',
      payload: { business_id: bizId, phone: '+21699999999' } });
    expect(r.statusCode).toBe(400);
  });
  it('sends the code to the LISTED number and masks it', async () => {
    const r = await app.inject({ method: 'POST', url: '/v1/claim', payload: { business_id: bizId } });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body) as { destination_masked: string };
    expect(body.destination_masked).toContain('•');
    expect(body.destination_masked).not.toMatch(/\d{8}/);   // never the full number
  });
  it('locks out after three wrong codes and never leaks the right one', async () => {
    const start = await app.inject({ method: 'POST', url: '/v1/claim',
      payload: { business_id: await seedBusiness({
        categoryId: (await getPool().query(`select id from category limit 1`)).rows[0].id,
        delegation: 'TUN-MARSA', name: 'قفل اختبار' }) } });
    const claimId = (JSON.parse(start.body) as { claim_id: string }).claim_id;
    const codes = ['000001', '000002', '000003'];
    const seen: number[] = [];
    for (const c of codes) {
      const r = await app.inject({ method: 'POST', url: `/v1/claim/${claimId}/verify`, payload: { code: c } });
      seen.push(r.statusCode);
      expect(r.body).not.toMatch(/code_hash|"code":"\d{6}"/);
    }
    expect(seen[2]).toBe(429);        // OTP_LOCKED
  });
  it('completes a claim to CLAIMED and NOT to VERIFIED', async () => {
    const catId = (await getPool().query(`select id from category limit 1`)).rows[0].id;
    const b = await seedBusiness({ categoryId: catId, delegation: 'TUN-MARSA', name: 'مطالبة اختبار' });
    const start = await app.inject({ method: 'POST', url: '/v1/claim', payload: { business_id: b } });
    const claimId = (JSON.parse(start.body) as { claim_id: string }).claim_id;
    const dev = await getPool().query<{ body_preview: string }>(
      `select body_preview from sms_outbox order by created_at desc limit 1`);
    const code = /(\d{6})/.exec(dev.rows[0]!.body_preview)![1]!;
    const v = await app.inject({ method: 'POST', url: `/v1/claim/${claimId}/verify`, payload: { code } });
    expect(v.statusCode).toBe(200);
    const cookie = /mk_sess=([^;]+)/.exec(v.headers['set-cookie'] as string)?.[1];
    expect(cookie).toBeTruthy();
    const done = await app.inject({ method: 'POST', url: `/v1/claim/${claimId}/complete`,
      payload: { category_confirmed: true }, headers: { cookie: `mk_sess=${cookie}` } });
    expect(done.statusCode).toBe(200);
    const trust = await getPool().query<{ t: string }>(
      `select trust_level::text t from business where id=$1`, [b]);
    expect(trust.rows[0]!.t).toBe('CLAIMED');   // claiming is NOT verification
  });
  it('writes an audit entry for every claim decision', async () => {
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from audit_entry where action like 'claim.%'`);
    expect(Number(r.rows[0]!.n)).toBeGreaterThan(0);
  });
  it('keeps the audit hash chain intact', async () => {
    const r = await call('GET', '/ops/audit/verify', adminCookie);
    const body = JSON.parse(r.body) as { checked: number; broken: string[] };
    expect(body.broken).toEqual([]);
    expect(body.checked).toBeGreaterThan(0);
  });
});

describe('Leakage · public responses expose no internal state', () => {
  it('never returns internal or private fields', async () => {
    const r = await app.inject({ method: 'GET', url: `/v1/business/${bizId}` });
    const raw = r.body;
    for (const f of ['discovery_score', 'quality_score', 'provenance', 'attention_weight',
                     'owner_account_id', 'source_code', 'password', 'token_hash', 'code_hash']) {
      expect(raw, f).not.toContain(f);
    }
  });
  it('never leaks a database error or stack trace', async () => {
    const r = await app.inject({ method: 'GET', url: "/v1/business/'; drop table business;--" });
    expect(r.statusCode).toBe(404);
    expect(r.body).not.toMatch(/syntax|relation|column|at .*\.ts:/i);
    const still = await getPool().query(`select count(*) from business`);
    expect(still.rowCount).toBe(1);   // table still there
  });
  it('readiness distinguishes liveness from dependency health', async () => {
    const live = await app.inject({ method: 'GET', url: '/health' });
    expect(live.statusCode).toBe(200);
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    const body = JSON.parse(ready.body) as { ready: boolean; checks: Record<string, {ok:boolean; detail?:string}> };
    expect(body.checks['database']?.ok).toBe(true);
    // the blocked basemap is reported honestly, not hidden
    expect(body.checks['basemap']?.detail).toContain('EXTERNALLY BLOCKED');
  });
});
