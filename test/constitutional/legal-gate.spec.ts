import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { getPool, closePool, withTx } from '../../platform/db.ts';
import {
  recordDecision, registerBasis, activateBasis, basisStatus, openQuestions,
  D11_QUESTIONS, D12_QUESTIONS, ALL_QUESTION_IDS,
} from '../../modules/legal/service.ts';
import { stageBatch, type RawRecord } from '../../modules/ops/service.ts';
import { resetDb, seedTaxonomy, SYS } from '../fixtures.ts';

async function registerSource(code: string, origin: string, counsel = 'PENDING_COUNSEL'): Promise<void> {
  await getPool().query(
    `insert into data_source
      (code,kind,display_name,license,attribution_required,commercial_use,redistribution,
       automated_extraction_permitted,reliability,approved_by,approved_at,origin,
       counsel_status,terms_checked_on,terms_evidence)
     values ($1,'FIELD_COLLECTION',$1,'direct-authorisation',false,true,false,true,5,
             'test',now(),$2::data_origin,$3,
             case when $3='APPROVED_FOR_PILOT' then current_date else null end,
             case when $3='APPROVED_FOR_PILOT' then 'evidence on file' else null end)
     on conflict (code) do update set origin=excluded.origin, counsel_status=excluded.counsel_status`,
    [code, origin, counsel]);
}

const rec = (): RawRecord[] => ([{
  name_ar: 'نشاط ميداني', name_fr: 'Commerce terrain', phone: '71234567',
  delegation: 'TUN-MARSA', governorate: 'Tunis', lon: 10.324, lat: 36.878,
  category: 'cafes', coordinate_confidence: 'VERIFIED', source_record_id: 'F-1',
}]);

beforeEach(async () => {
  await resetDb();
  await getPool().query(
    `truncate legal_basis, legal_decision, business_participation,
              staging_business, import_batch, data_source cascade`);
  await seedTaxonomy();
});
afterAll(async () => { await closePool(); });

describe('Legal gate · a REAL batch cannot publish without a registered basis', () => {
  it('rejects an invented legal basis string for a REAL source', async () => {
    await registerSource('FIELD_A', 'REAL', 'APPROVED_FOR_PILOT');
    const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'FIELD_A', rec()));
    await expect(getPool().query(
      `update import_batch set published_at=now(), legal_basis_ref='I-SAY-ITS-FINE' where id=$1`,
      [batchId])).rejects.toThrow(/registered, active legal basis/);
  });

  it('rejects a null legal basis for a REAL source', async () => {
    await registerSource('FIELD_B', 'REAL', 'APPROVED_FOR_PILOT');
    const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'FIELD_B', rec()));
    await expect(getPool().query(
      `update import_batch set published_at=now(), legal_basis_ref=null where id=$1`, [batchId]))
      .rejects.toThrow(/publish_requires_legal_basis|registered, active legal basis/);
  });

  it('rejects a basis that exists but was never activated', async () => {
    await registerSource('FIELD_C', 'REAL', 'APPROVED_FOR_PILOT');
    await withTx((tx) => recordDecision(SYS, tx, {
      decisionRef: 'D-12.Q1/2026-09', questionId: 'D-12.Q1', counselName: 'Test Counsel',
      decidedOn: '2026-09-01', decision: 'permitted with conditions', scope: 'pilot' }));
    await withTx((tx) => registerBasis(SYS, tx, {
      ref: 'LB-PILOT-1', description: 'pilot basis', decisionRefs: ['D-12.Q1/2026-09'],
      dataCategories: ['name', 'category', 'address'] }));
    const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'FIELD_C', rec()));
    await expect(getPool().query(
      `update import_batch set published_at=now(), legal_basis_ref='LB-PILOT-1' where id=$1`,
      [batchId])).rejects.toThrow(/registered, active legal basis/);
  });

  it('accepts publication once a decision is recorded and the basis is activated', async () => {
    await registerSource('FIELD_D', 'REAL', 'APPROVED_FOR_PILOT');
    await withTx((tx) => recordDecision(SYS, tx, {
      decisionRef: 'D-12.Q1/2026-09b', questionId: 'D-12.Q1', counselName: 'Test Counsel',
      decidedOn: '2026-09-01', decision: 'permitted', scope: 'pilot corridors A-C' }));
    await withTx((tx) => registerBasis(SYS, tx, {
      ref: 'LB-PILOT-2', description: 'pilot basis', decisionRefs: ['D-12.Q1/2026-09b'],
      dataCategories: ['name'] }));
    await withTx((tx) => activateBasis(SYS, tx, 'LB-PILOT-2'));
    const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'FIELD_D', rec()));
    await getPool().query(
      `update import_batch set published_at=now(), legal_basis_ref='LB-PILOT-2' where id=$1`,
      [batchId]);
    const s = await withTx((tx) => basisStatus(SYS, tx, 'LB-PILOT-2'));
    expect(s?.active).toBe(true);
  });

  it('refuses to activate a basis built on no recorded decision', async () => {
    await expect(withTx((tx) => registerBasis(SYS, tx, {
      ref: 'LB-EMPTY', description: 'x', decisionRefs: ['D-99.Q9/never'], dataCategories: ['name'],
    }))).rejects.toThrow(/not recorded/);
  });

  it('cannot mark a basis active with an empty decision list', async () => {
    await expect(getPool().query(
      `insert into legal_basis (ref,description,decision_refs,active)
       values ('LB-BARE','no decisions','{}',true)`))
      .rejects.toThrow(/active_requires_decision/);
  });

  it('still allows a TEST batch to carry an honest descriptive label', async () => {
    await registerSource('W0', 'TEST');
    const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'W0', rec()));
    await getPool().query(
      `update import_batch set published_at=now(),
              legal_basis_ref='INTERNAL-TEST-NOT-A-LEGAL-BASIS' where id=$1`, [batchId]);
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from import_batch where id=$1 and published_at is not null`, [batchId]);
    expect(r.rows[0]!.n).toBe('1');
  });
});

describe('Origin integrity · synthetic data can never become real', () => {
  it('refuses a REAL business without a source', async () => {
    const t = await getPool().query<{ id: string }>(`select id from category limit 1`)
      .then((r) => ({ categoryId: r.rows[0]!.id, delegation: 'TUN-MARSA' }));
    await expect(getPool().query(
      `insert into business (name_ar,name_normalized,category_id,delegation_code,location,
         state,trust_level,coordinate_confidence,provenance,origin)
       values ('x','x',$1,$2,ST_SetSRID(ST_MakePoint(10.3,36.8),4326),
               'PUBLISHED','UNCLAIMED','HIGH','{}'::jsonb,'REAL')`,
      [t.categoryId, t.delegation])).rejects.toThrow(/real_requires_source/);
  });

  it('refuses to approve a source for pilot without licence evidence', async () => {
    await expect(getPool().query(
      `insert into data_source
        (code,kind,display_name,license,attribution_required,commercial_use,redistribution,
         automated_extraction_permitted,reliability,origin,counsel_status)
       values ('SLOPPY','OFFICIAL_DIRECTORY','x','unknown',false,true,false,true,3,
               'REAL','APPROVED_FOR_PILOT')`))
      .rejects.toThrow(/approved_requires_evidence/);
  });

  it('keeps FIXTURE and TEST origins out of the REAL population', async () => {
    await registerSource('FX', 'FIXTURE');
    await registerSource('TS', 'TEST');
    const r = await getPool().query<{ n: string }>(
      `select count(*)::text n from data_source where origin='REAL'`);
    expect(r.rows[0]!.n).toBe('0');
  });

  it('an authorisation that names no fields is rejected', async () => {
    await expect(getPool().query(
      `insert into business_participation
        (public_display_name,representative_role,authorisation_method,authorised_fields)
       values ('x','OWNER','IN_PERSON_SIGNED','{}')`))
      .rejects.toThrow(/authorisation_names_fields/);
  });
});

describe('Counsel questions · open until answered', () => {
  it('enumerates every question the gate depends on', () => {
    expect(D11_QUESTIONS.length).toBeGreaterThanOrEqual(8);
    expect(D12_QUESTIONS.length).toBeGreaterThanOrEqual(9);
    for (const q of [...D11_QUESTIONS, ...D12_QUESTIONS]) {
      expect(q.technicalFact.length, q.id).toBeGreaterThan(40);
      expect(q.ifYes.length, q.id).toBeGreaterThan(5);
      expect(q.ifNo.length, q.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('reports all questions open when nothing has been decided', async () => {
    const open = await withTx((tx) => openQuestions(SYS, tx, ALL_QUESTION_IDS));
    expect(open.length).toBe(ALL_QUESTION_IDS.length);
  });

  it('closes only the question a recorded decision actually answers', async () => {
    await withTx((tx) => recordDecision(SYS, tx, {
      decisionRef: 'D-11.Q1/2026-09', questionId: 'D-11.Q1', counselName: 'Test Counsel',
      decidedOn: '2026-09-01', decision: 'permitted', scope: 'basemap only' }));
    const open = await withTx((tx) => openQuestions(SYS, tx, ALL_QUESTION_IDS));
    expect(open).not.toContain('D-11.Q1');
    expect(open).toContain('D-11.Q3');
    expect(open.length).toBe(ALL_QUESTION_IDS.length - 1);
  });

  it('requires a named counsel and a date on every decision', async () => {
    await expect(withTx((tx) => recordDecision(SYS, tx, {
      decisionRef: 'X', questionId: 'D-11.Q1', counselName: '  ',
      decidedOn: '2026-09-01', decision: 'ok', scope: 'x' })))
      .rejects.toThrow(/named counsel/);
  });
});
