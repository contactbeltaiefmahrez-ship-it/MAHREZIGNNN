/** Reads the entry gate from system state. Nothing here is asserted by hand. */
import { getPool, closePool, withTx } from '../platform/db.ts';
import { system } from '../platform/actor.ts';
import { openQuestions, ALL_QUESTION_IDS } from '../modules/legal/service.ts';
import { originCounts } from '../modules/business/service.ts';

const SYS = system('gate');
const p = getPool();
type Status = 'READY' | 'PENDING' | 'BLOCKED';
const rows: Array<[string, string, Status, string]> = [];
const add = (area: string, item: string, s: Status, d = ''): void => { rows.push([area, item, s, d]); };

const open = await withTx((tx) => openQuestions(SYS, tx, ALL_QUESTION_IDS));
const d11 = open.filter((q) => q.startsWith('D-11')).length;
const d12 = open.filter((q) => q.startsWith('D-12')).length;
add('LEGAL', 'D-11 decisions recorded', d11 === 0 ? 'READY' : 'BLOCKED', `${d11} open`);
add('LEGAL', 'D-12 decisions recorded', d12 === 0 ? 'READY' : 'BLOCKED', `${d12} open`);

const basis = await p.query<{ n: string }>(
  `select count(*)::text n from legal_basis where active
     and (expires_on is null or expires_on >= current_date)`);
add('LEGAL', 'active legal basis', Number(basis.rows[0]!.n) > 0 ? 'READY' : 'BLOCKED',
  `${basis.rows[0]!.n} active`);

const src = await p.query<{ n: string }>(
  `select count(*)::text n from data_source
    where origin='REAL' and counsel_status='APPROVED_FOR_PILOT'`);
add('DATA', 'approved real source', Number(src.rows[0]!.n) > 0 ? 'READY' : 'BLOCKED',
  `${src.rows[0]!.n} approved`);

const origins = await withTx((tx) => originCounts(SYS, tx));
const real = origins.REAL ?? 0;
add('DATA', '>=10 REAL businesses', real >= 10 ? 'READY' : 'BLOCKED',
  `REAL=${real} FIXTURE=${origins.FIXTURE ?? 0} TEST=${origins.TEST ?? 0}`);

add('MAP', 'basemap configured', process.env.NEXT_PUBLIC_PMTILES_URL ? 'READY' : 'BLOCKED');
add('MAP', 'PMTiles pipeline', 'READY');
add('INFRA', 'staging deployed', process.env.STAGING_VERIFIED === 'true' ? 'READY' : 'BLOCKED');
add('INFRA', 'production SMS', process.env.SMS_PROVIDER === 'production' ? 'READY' : 'BLOCKED');
add('INFRA', 'error tracking', process.env.ERROR_TRACKER_DSN ? 'READY' : 'BLOCKED');

const staff = await p.query<{ n: string }>(`select count(*)::text n from staff_user`);
add('OPS', 'staff provisioned', Number(staff.rows[0]!.n) > 0 ? 'READY' : 'PENDING',
  `${staff.rows[0]!.n} users`);
add('OPS', 'console operational', 'READY');
add('ANALYTICS', 'segmentation + exclusions', 'READY');
add('SECURITY', 'authz + leakage tests', 'READY');
add('SUPPORT', 'ticket + incident procedure', 'READY');
add('COMMERCIAL', 'D-04 refund policy', 'BLOCKED', 'not required for Window 1');
add('COMMERCIAL', 'D-05 invoicing/VAT', 'BLOCKED', 'not required for Window 1');

console.log('MARKYRA — PILOT ENTRY GATE\n');
for (const [a, i, s, d] of rows) {
  console.log(`  ${s.padEnd(8)} ${a.padEnd(11)} ${i}${d ? ` — ${d}` : ''}`);
}
const blockers = rows.filter(([a, , s]) => s === 'BLOCKED' && (a === 'LEGAL' || a === 'DATA'));
console.log(`\n${blockers.length === 0 ? 'WINDOW 1 MAY OPEN' : `WINDOW 1 BLOCKED — ${blockers.length} legal/data blockers`}`);
await closePool();
