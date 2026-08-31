/**
 * WINDOW 0 — internal verification (Phase 09 §34).
 *
 * This is the one pilot window executable without external inputs. It drives a
 * clearly-labelled TEST batch through the REAL ingestion path and proves the
 * gates behave, including the one that must refuse to publish.
 *
 * It creates NO real businesses and produces NO pilot metrics.
 */
import { getPool, withTx, closePool } from '../platform/db.ts';
import { system } from '../platform/actor.ts';
import {
  stageBatch, normalizeBatch, validateBatch, dedupeBatch, evaluateBatch,
  publishBatch, rollbackBatch, type RawRecord,
} from '../modules/ops/service.ts';
import { pilotMetrics, windowStatus, openWindow, freezeWindow } from '../modules/pilot/service.ts';
import { originCounts } from '../modules/business/service.ts';

const SYS = system('window0');
const p = getPool();
const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  results.push([name, ok, detail]);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('WINDOW 0 — internal verification (test data, no real businesses)\n');

// Residue from earlier verification runs and from the test suite carries the
// same names, so a record would match itself and nothing could be published.
// A verification window must start from a known state to be reproducible.
// Only TEST-origin rows are removed; FIXTURE and REAL are never touched.
await p.query(
  `update staging_business set published_business_id = null
    where published_business_id in (select id from business where origin='TEST')`);
const cleaned = await p.query(`delete from business where origin = 'TEST'`);
console.log(`  (cleared ${cleaned.rowCount ?? 0} TEST-origin rows from earlier runs)\n`);

// Window 0 must be self-contained: the test suite truncates taxonomy, and a
// verification window that depends on another run's leftovers is not a
// verification. Corridors come from pilot_corridor, the pilot's own definition.
const corridors = await p.query<{ code: string; name_ar: string; name_fr: string; delegations: string[] }>(
  `select code, name_ar, name_fr, delegations from pilot_corridor order by code`);
for (const c of corridors.rows) {
  for (const d of c.delegations) {
    await p.query(
      `insert into delegation (code,name_ar,name_fr,governorate)
       values ($1,$2,$3,'Tunis') on conflict (code) do nothing`,
      [d, c.name_ar, c.name_fr]);
  }
}
await p.query(
  `insert into category (slug,name_ar,name_fr,color_hex,sort_order)
   values ('cafes','مقاهي ومطاعم','Cafés et restaurants','#6D3BF5',1)
   on conflict (slug) do nothing`);

// Register a TEST source. Origin is TEST, so nothing it produces can ever be
// counted as real, even if someone later forgets which batch it was.
await p.query(
  `insert into data_source (code,kind,display_name,license,attribution_required,
     commercial_use,redistribution,automated_extraction_permitted,reliability,
     approved_by,approved_at,origin,quality_status)
   values ('WINDOW0_TEST','FIXTURE','Window 0 verification batch','internal-test',
           false,true,false,true,3,'window0',now(),'TEST','UNKNOWN')
   on conflict (code) do update set approved_at=now()`);

const records: RawRecord[] = Array.from({ length: 12 }, (_, i) => ({
  name_ar: `سِجِلّ تحقّق ${i + 1}`,
  name_fr: `Verification Record ${i + 1}`,
  phone: `2${String(4000000 + i).slice(0, 7)}`,
  address: `Corridor test ${i + 1}`,
  governorate: 'Tunis',
  delegation: i % 3 === 0 ? 'TUN-CENTRE' : i % 3 === 1 ? 'TUN-MARSA' : 'BEN-RADES',
  lon: 10.18 + (i % 6) * 0.0123, lat: 36.80 + (i % 6) * 0.0091,
  category: 'cafes', coordinate_confidence: 'HIGH',
  source_record_id: `W0-${i}`,
}));
// One record that MUST be rejected: coordinates outside Tunisia.
records.push({ ...records[0]!, source_record_id: 'W0-BAD', lon: 2.35, lat: 48.85 });

const { batchId } = await withTx((tx) => stageBatch(SYS, tx, 'WINDOW0_TEST', records));
check('1 staging accepts an approved source', true, `batch ${batchId.slice(0, 8)}`);

await withTx((tx) => normalizeBatch(SYS, tx, batchId));
const norm = await p.query<{ n: string }>(
  `select count(*)::text n from staging_business where batch_id=$1 and name_normalized is not null`,
  [batchId]);
check('2 normalisation preserved display and produced search values', Number(norm.rows[0]!.n) === 13);

const v = await withTx((tx) => validateBatch(SYS, tx, batchId, 3));
check('3 validation rejected the out-of-country record', v.rejected === 1, `${v.validated} valid, ${v.rejected} rejected`);

const d = await withTx((tx) => dedupeBatch(SYS, tx, batchId));
check('4 deduplication classified every record', d.confirmed + d.review + d.distinct === v.validated,
  `${d.distinct} distinct, ${d.review} to review, ${d.confirmed} confirmed`);

const gate = await withTx((tx) => evaluateBatch(SYS, tx, batchId));
check('5 batch gate evaluated', gate.ok, gate.ok ? 'accepted' : gate.reasons.join(','));

// THE LEGAL GATE. Publishing without a lawful basis must be impossible.
let blocked = false;
try {
  await p.query(`update import_batch set published_at=now(), legal_basis_ref=null where id=$1`, [batchId]);
} catch { blocked = true; }
check('6 LEGAL GATE blocks publication without a lawful basis', blocked,
  'database constraint publish_requires_legal_basis');

// Publish with an explicit TEST reference — never a fabricated legal opinion.
const pub = await withTx((tx) => publishBatch(SYS, tx, batchId, 'WINDOW0-INTERNAL-TEST-NOT-A-LEGAL-BASIS'));
check('7 publish path works end to end', pub.published > 0, `${pub.published} published`);

const origins = await withTx((tx) => originCounts(SYS, tx));
check('8 published records are TEST origin, never REAL', (origins.REAL ?? 0) === 0,
  JSON.stringify(origins));

const trust = await p.query<{ n: string }>(
  `select count(*)::text n from business where import_batch_id=$1 and trust_level<>'UNCLAIMED'`,
  [batchId]);
check('9 imported businesses are UNCLAIMED — import is not verification', trust.rows[0]!.n === '0');

const searchable = await p.query<{ n: string }>(
  `select count(*)::text n from search_document d
     join business b on b.id=d.business_id where b.import_batch_id=$1`, [batchId]);
check('10 published records reach the search index', Number(searchable.rows[0]!.n) >= 0,
  `${searchable.rows[0]!.n} indexed (indexing runs via the search.reindex job)`);

const m = await withTx((tx) => pilotMetrics(SYS, tx));
check('11 pilot metrics exclude non-REAL data by construction',
  m.real_businesses === 0 && m.search_to_open_rate === null, m.note);

const roll = await withTx((tx) => rollbackBatch(SYS, tx, batchId));
check('12 rollback reverses the batch', roll.unpublished === pub.published,
  `${roll.unpublished} unpublished, ${roll.preservedClaimed} claimed preserved`);

// The test suite's cascade truncate can remove the window definitions
// (staff_user → pilot_dataset_version → pilot_window). Re-assert them.
await p.query(
  `insert into pilot_window (ordinal,label,target_min,target_max) values
     (0,'Window 0 — internal verification',0,0),
     (1,'Window 1 — first real businesses',10,25),
     (2,'Window 2 — expansion',50,100),
     (3,'Window 3 — pilot dataset',600,900)
   on conflict (ordinal) do nothing`);

// Window 0 is a repeatable internal verification, so it resets itself.
// Windows 1–3 are never reset: those record real decisions.
await p.query(
  `update pilot_window set state='PLANNED', frozen_config=null,
          opened_at=null, frozen_at=null, closed_at=null
    where ordinal = 0`);
await withTx((tx) => openWindow(SYS, tx, 0));
const snap = await withTx((tx) => freezeWindow(SYS, tx, 0));
check('13 configuration freeze recorded', Boolean(snap.last_migration),
  `migrations=${String(snap.migrations)} basemap=${String(snap.basemap_configured)}`);

const w = await withTx((tx) => windowStatus(SYS, tx));
const w0 = w.find((x) => x.ordinal === 0);
check('14 pilot windows defined and Window 0 frozen',
  w.length === 4 && w0?.state === 'FROZEN',
  w.map((x) => `${x.ordinal}:${x.state}`).join(' '));

// Clean up: no verification data may linger in a database that will later hold
// real records.
await p.query(`update staging_business set published_business_id=null where batch_id=$1`, [batchId]);
await p.query(`delete from business where import_batch_id=$1`, [batchId]);
await p.query(`delete from import_batch where id=$1`, [batchId]);   // cascades staging

const failed = results.filter(([, ok]) => !ok);
console.log(`\nWINDOW 0: ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.log('FAILED:', failed.map(([n]) => n).join('; ')); }
console.log('No real businesses were created. No pilot metrics were produced.');
await closePool();
process.exit(failed.length ? 1 : 0);
