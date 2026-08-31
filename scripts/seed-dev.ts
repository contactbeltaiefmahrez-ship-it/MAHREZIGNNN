/**
 * DEVELOPMENT FIXTURES ONLY.
 *
 * These are synthetic records with obviously fictional names, created solely so
 * the UI, map and search can be exercised locally. They are NOT real Tunisian
 * businesses, must never appear in the pilot dataset, in investor metrics, or in
 * any production database. Every record carries source_code = 'FIXTURE' and is
 * removable with: npm run db:unseed
 */
import { getPool, withTx, closePool } from '../platform/db.ts';
import { system } from '../platform/actor.ts';
import { reindex } from '../modules/search/service.ts';

const SYS = system('seed');
type Cat = readonly [string,string,string,string];
type Del = readonly [string,string,string,string,number,number];
const CATS: readonly Cat[] = [
  ['cafes', 'مقاهي ومطاعم', 'Cafés et restaurants', '#6D3BF5'],
  ['beauty', 'حلاقة وتجميل', 'Coiffure et beauté', '#FF56A5'],
  ['clothing', 'ملابس وأحذية', 'Vêtements et chaussures', '#12C2E9'],
  ['bakery', 'حلويات ومخابز', 'Pâtisseries et boulangeries', '#FF8A3D'],
  ['gyms', 'قاعات رياضة', 'Salles de sport', '#16D2A0'],
  ['home', 'خدمات منزلية', 'Services à domicile', '#2B6BFF'],
  ['creative', 'تصوير وإبداع', 'Photo et création', '#E0A800'],
  ['repair', 'إصلاح وصيانة', 'Réparation et entretien', '#FF5C72'],
];
const DELEGATIONS: readonly Del[] = [
  ['TUN-CENTRE', 'تونس المدينة', 'Tunis Centre', 'Tunis', 10.181, 36.800],
  ['TUN-MARSA', 'المرسى', 'La Marsa', 'Tunis', 10.324, 36.878],
  ['ARI-MENZAH', 'المنزه', 'El Menzah', 'Ariana', 10.171, 36.840],
  ['BEN-RADES', 'رادس', 'Radès', 'Ben Arous', 10.276, 36.768],
];
// Deliberately fictional: no real establishment is called this.
const AR = ['واجهة تجريبية', 'محل نموذجي', 'نموذج اختبار', 'واجهة عيّنة'];
const FR = ['Vitrine Fixture', 'Commerce Modele', 'Test Echoppe', 'Exemple Boutique'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = Number(process.env.SEED_COUNT ?? 240);
const rnd = mulberry32(20260828);      // deterministic: same fixtures every run
const p = getPool();

await p.query(`delete from business where source_code='FIXTURE'`);
for (const [slug, ar, fr, hex] of CATS) {
  await p.query(
    `insert into category (slug,name_ar,name_fr,color_hex,sort_order)
     values ($1,$2,$3,$4,$5) on conflict (slug) do nothing`,
    [slug, ar, fr, hex, CATS.findIndex((c) => c[0] === slug) + 1]);
}
for (const [code, ar, fr, gov] of DELEGATIONS) {
  await p.query(
    `insert into delegation (code,name_ar,name_fr,governorate)
     values ($1,$2,$3,$4) on conflict (code) do nothing`, [code, ar, fr, gov]);
}
await p.query(
  `insert into data_source (code,kind,display_name,license,attribution_required,
     commercial_use,redistribution,automated_extraction_permitted,reliability,approved_by,approved_at)
   values ('FIXTURE','FIXTURE','Synthetic development fixture','internal-fixture',
           false,true,false,true,3,'seed-dev',now())
   on conflict (code) do nothing`);
await p.query(`update data_source set origin='FIXTURE' where code='FIXTURE'`);

let made = 0;
for (let i = 0; i < N; i++) {
  const cat = CATS[Math.floor(rnd() * CATS.length)]!;
  const del = DELEGATIONS[Math.floor(rnd() * DELEGATIONS.length)]!;
  // clustered around each delegation centre so density varies realistically
  const lon = Number((del[4] + (rnd() - 0.5) * 0.045).toFixed(6));
  const lat = Number((del[5] + (rnd() - 0.5) * 0.035).toFixed(6));
  const nameAr = `${AR[i % AR.length]} ${i + 1}`;
  const nameFr = `${FR[i % FR.length]} ${i + 1}`;
  const trust = rnd() < 0.12 ? 'VERIFIED' : rnd() < 0.3 ? 'CLAIMED' : 'UNCLAIMED';
  // CLAIMED/VERIFIED require a real owner account — the schema refuses otherwise.
  let ownerId: string | null = null;
  if (trust !== 'UNCLAIMED') {
    const o = await p.query<{ id: string }>(
      `insert into owner_account (phone_e164) values ($1)
       on conflict (phone_e164) do update set updated_at=now() returning id`,
      [`+2169${String(2000000 + i).slice(0, 7)}`]);
    ownerId = o.rows[0]!.id;
  }
  const completeness = 40 + Math.floor(rnd() * 60);
  const catRow = await p.query<{ id: string }>(`select id from category where slug=$1`, [cat[0]]);
  const categoryId = catRow.rows[0]!.id;
  const r = await p.query<{ id: string }>(
    `insert into business
       (name_ar,name_fr,name_normalized,category_id,delegation_code,location,
        address_text,phone_e164,state,trust_level,completeness_score,
        attention_weight,discovery_score,coordinate_confidence,source_code,
        source_record_id,quality_score,has_active_offer,owner_account_id,provenance,origin)
     select $1,$2,$3,c.id,$4, ST_SetSRID(ST_MakePoint($5,$6),4326),
            $7,$8,'PUBLISHED',$9::trust_level,$10,$11,$12,'HIGH',
            'FIXTURE',$13,70,$14,$16,
            '{"source":"FIXTURE","note":"synthetic development data"}'::jsonb,'FIXTURE'
       from category c where c.slug=$15
     returning id`,
    [nameAr, nameFr, nameAr.replace(/[\u064B-\u0652]/g, ''), del[0], lon, lat,
     `${del[2]}, fixture ${i + 1}`, `+2167${String(1000000 + i).slice(0, 7)}`,
     trust, completeness, 1 + Math.floor(rnd() * 5), Number(rnd().toFixed(6)),
     `FIXTURE-${i}`, rnd() < 0.18, cat[0], ownerId]);
  const id = r.rows[0]!.id;
  // No silent catch: a business that is not indexed is a business nobody can
  // find, and swallowing that error hid it for an entire test cycle.
  await withTx((tx) => reindex(SYS, tx, {
    businessId: id, nameAr, nameFr, aliases: [], delegationCode: del[0],
    categoryId, trustLevel: trust as 'CLAIMED', searchable: true,
  }));
  made++;
}
const cnt = await p.query<{ n: string }>(
  `select count(*)::text n from business where source_code='FIXTURE'`);
console.log(`seeded ${made} DEVELOPMENT FIXTURES (total fixture rows: ${cnt.rows[0]!.n})`);
console.log('WARNING: synthetic data. Not real businesses. Never ship to production.');

// ── A LIVE market cycle with grants, so the sponsored/organic distinction is
//    actually demonstrable end to end. Fixture data, same warning applies.
{
  const now = Date.now();
  const at = (h: number): string => new Date(now + h * 36e5).toISOString();
  await p.query(`delete from market_cycle where week_number = 9001`);
  const cyc = await p.query<{ id: string }>(
    `insert into market_cycle
      (week_number,opens_at,applications_close_at,payment_deadline_at,lock_at,live_at,closes_at,state)
     values (9001,$1,$2,$3,$4,$5,$6,'LIVE') returning id`,
    [at(-120), at(-72), at(-48), at(-24), at(-12), at(120)]);
  const cycleId = cyc.rows[0]!.id;
  const { seatPlan } = await import('../modules/market/service.ts');
  const { createSeatsForCycle } = await import('../modules/market/service.ts');
  await withTx((tx) => createSeatsForCycle(SYS, tx, cycleId, seatPlan()));

  // 14 fixture businesses receive a grant for this cycle.
  const winners = await p.query<{ id: string }>(
    `select id from business where source_code='FIXTURE' order by id limit 14`);
  for (const w of winners.rows) {
    await p.query(
      `update market_seat set business_id=$2, assigned_at=now()
        where id = (select id from market_seat
                     where cycle_id=$1 and source='CURATED' and business_id is null
                     order by position limit 1)`, [cycleId, w.id]);
    await p.query(
      `insert into attention_grant (business_id,cycle_id,tier)
       values ($1,$2,'RISING') on conflict do nothing`, [w.id, cycleId]);
    await p.query(`select set_business_grant_flag($1::uuid)`, [w.id]);
  }
  console.log(`seeded 1 LIVE fixture market cycle with ${winners.rowCount} attention grants`);
}

await closePool();
