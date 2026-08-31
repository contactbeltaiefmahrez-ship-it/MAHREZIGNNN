import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { getPool, closePool, withTx } from '../../platform/db.ts';
import { allocateSeat } from '../../modules/market/repository/seat.ts';
import { publishCycle } from '../../modules/market/repository/publish.ts';
import { seatPlan, TOTAL_SEATS, SELLABLE_SEATS } from '../../modules/market/domain/cycle.ts';
import {
  resetDb, seedTaxonomy, seedBusiness, seedCycle, seedStaff, seedConfirmedOrder, SYS, OPS,
} from '../fixtures.ts';

let categoryId: string;
let delegation: string;
let staffId: string;

beforeAll(async () => { await resetDb(); });
beforeEach(async () => {
  await resetDb();
  const t = await seedTaxonomy();
  categoryId = t.categoryId; delegation = t.delegation;
  staffId = await seedStaff();
});
afterAll(async () => { await closePool(); });

describe('INVARIANT 1 · a seat cannot be sold twice', () => {
  it('creates exactly 100 seats with the canonical layout', async () => {
    const cycleId = await seedCycle();
    const r = await getPool().query<{ tier: string; source: string; n: string }>(
      `select tier::text, source::text, count(*)::text n from market_seat
        where cycle_id=$1 group by 1,2 order by 1`, [cycleId],
    );
    const total = r.rows.reduce((a, x) => a + Number(x.n), 0);
    expect(total).toBe(TOTAL_SEATS);
    const sellable = r.rows.filter((x) => x.source === 'SELLABLE')
      .reduce((a, x) => a + Number(x.n), 0);
    expect(sellable).toBe(SELLABLE_SEATS);
    expect(seatPlan().length).toBe(TOTAL_SEATS);
  });

  it('gives two racing transactions two DIFFERENT seats, never the same one', async () => {
    const cycleId = await seedCycle();
    const bizA = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const bizB = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const orderA = await seedConfirmedOrder(cycleId, bizA, 'STANDARD', staffId);
    const orderB = await seedConfirmedOrder(cycleId, bizB, 'STANDARD', staffId);

    const [a, b] = await Promise.all([
      withTx((tx) => allocateSeat(SYS, tx, cycleId, 'STANDARD', bizA, orderA)),
      withTx((tx) => allocateSeat(SYS, tx, cycleId, 'STANDARD', bizB, orderB)),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.position).not.toBe(b!.position);
  });

  it('survives 30 simultaneous allocations against 10 FEATURED seats', async () => {
    const cycleId = await seedCycle();
    const jobs = await Promise.all(
      Array.from({ length: 30 }, async () => {
        const biz = await seedBusiness({ categoryId, delegation, trust: 'VERIFIED' });
        const order = await seedConfirmedOrder(cycleId, biz, 'FEATURED', staffId, 600000n);
        return { biz, order };
      }),
    );
    const results = await Promise.all(
      jobs.map((j) =>
        withTx((tx) => allocateSeat(SYS, tx, cycleId, 'FEATURED', j.biz, j.order))
          .catch(() => null),
      ),
    );
    const won = results.filter((r) => r !== null);
    expect(won.length).toBe(10);                                  // exactly the tier size
    expect(new Set(won.map((w) => w!.position)).size).toBe(10);   // all distinct
    expect(results.filter((r) => r === null).length).toBe(20);    // the rest fail safely

    const check = await getPool().query<{ n: string; distinct: string }>(
      `select count(*)::text n, count(distinct business_id)::text distinct
         from market_seat where cycle_id=$1 and tier='FEATURED' and business_id is not null`,
      [cycleId],
    );
    expect(check.rows[0]!.n).toBe('10');
    expect(check.rows[0]!.distinct).toBe('10');
  });

  it('refuses a second seat for the same business in one cycle', async () => {
    const cycleId = await seedCycle();
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const o1 = await seedConfirmedOrder(cycleId, biz, 'STANDARD', staffId);
    await withTx((tx) => allocateSeat(SYS, tx, cycleId, 'STANDARD', biz, o1));
    // unique(cycle_id, business_id) rejects it at the database
    await expect(
      withTx((tx) => allocateSeat(SYS, tx, cycleId, 'STANDARD', biz, o1)),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('refuses to occupy a SELLABLE seat without an order (R42)', async () => {
    const cycleId = await seedCycle();
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    await expect(
      getPool().query(
        `update market_seat set business_id=$2, assigned_at=now()
          where cycle_id=$1 and source='SELLABLE' and business_id is null
            and position=(select min(position) from market_seat
                           where cycle_id=$1 and source='SELLABLE')`,
        [cycleId, biz],
      ),
    ).rejects.toThrow(/seat_sellable_requires_order/);
  });

  it('refuses to sell a CURATED seat (R29)', async () => {
    const cycleId = await seedCycle();
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const order = await seedConfirmedOrder(cycleId, biz, 'STANDARD', staffId);
    await expect(
      getPool().query(
        `update market_seat set business_id=$2, seat_order_id=$3, assigned_at=now()
          where cycle_id=$1 and source='CURATED' and position=83`,
        [cycleId, biz, order],
      ),
    ).rejects.toThrow(/seat_sellable_requires_order|seat_curated_tiers/);
  });
});

describe('INVARIANT 3 · market publish is idempotent', () => {
  async function lockedCycleWithSeats(n: number): Promise<string> {
    const cycleId = await seedCycle('LOCKED');
    for (let i = 0; i < n; i++) {
      const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
      const order = await seedConfirmedOrder(cycleId, biz, 'STANDARD', staffId);
      await withTx((tx) => allocateSeat(SYS, tx, cycleId, 'STANDARD', biz, order));
    }
    return cycleId;
  }

  it('publishes once and reports the seat count', async () => {
    const cycleId = await lockedCycleWithSeats(4);
    const r = await withTx((tx) => publishCycle(OPS, tx, cycleId));
    expect(r.alreadyPublished).toBe(false);
    expect(r.seatsPublished).toBe(4);
    expect(r.grantsIssued).toBe(4);
    const s = await getPool().query<{ state: string }>(
      `select state::text from market_cycle where id=$1`, [cycleId]);
    expect(s.rows[0]!.state).toBe('LIVE');
  });

  it('running publish twice sequentially is a safe no-op', async () => {
    const cycleId = await lockedCycleWithSeats(4);
    await withTx((tx) => publishCycle(OPS, tx, cycleId));
    const second = await withTx((tx) => publishCycle(OPS, tx, cycleId));
    expect(second.alreadyPublished).toBe(true);

    const grants = await getPool().query<{ n: string }>(
      `select count(*)::text n from attention_grant where cycle_id=$1`, [cycleId]);
    expect(grants.rows[0]!.n).toBe('4');            // not 8
    const trans = await getPool().query<{ n: string }>(
      `select count(*)::text n from cycle_transition where cycle_id=$1 and to_state='LIVE'`,
      [cycleId]);
    expect(trans.rows[0]!.n).toBe('1');
  });

  it('two CONCURRENT publishes leave exactly one set of grants', async () => {
    const cycleId = await lockedCycleWithSeats(5);
    const [a, b] = await Promise.allSettled([
      withTx((tx) => publishCycle(OPS, tx, cycleId)),
      withTx((tx) => publishCycle(OPS, tx, cycleId)),
    ]);
    const ok = [a, b].filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBe(2);                       // neither errors
    const fresh = ok.filter(
      (r) => (r as PromiseFulfilledResult<{ alreadyPublished: boolean }>).value.alreadyPublished === false);
    expect(fresh.length).toBe(1);                    // exactly one did the work

    const grants = await getPool().query<{ n: string }>(
      `select count(*)::text n from attention_grant where cycle_id=$1`, [cycleId]);
    expect(grants.rows[0]!.n).toBe('5');
  });

  it('a failed publish leaves the PREVIOUS cycle live and rolls back completely', async () => {
    // week 0 goes live legitimately
    const live = await lockedCycleWithSeats(3);
    await withTx((tx) => publishCycle(OPS, tx, live));

    // week 1 is locked but its only seat holds a SUSPENDED business
    const next = await seedCycle('LOCKED', 1);
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' });
    const order = await seedConfirmedOrder(next, biz, 'STANDARD', staffId);
    await withTx((tx) => allocateSeat(SYS, tx, next, 'STANDARD', biz, order));
    await getPool().query(`update business set state='SUSPENDED' where id=$1`, [biz]);

    await expect(withTx((tx) => publishCycle(OPS, tx, next)))
      .rejects.toThrow(/suspended_business/);

    // the previous cycle is untouched and still LIVE — the market never goes empty
    const states = await getPool().query<{ id: string; state: string }>(
      `select id, state::text from market_cycle order by week_number`);
    expect(states.rows.find((r) => r.id === live)!.state).toBe('LIVE');
    expect(states.rows.find((r) => r.id === next)!.state).toBe('LOCKED');
    // and no partial grants were written for the failed cycle
    const g = await getPool().query<{ n: string }>(
      `select count(*)::text n from attention_grant where cycle_id=$1`, [next]);
    expect(g.rows[0]!.n).toBe('0');
  });

  it('blocks publish when a PREMIUM seat holds an unverified business (R24)', async () => {
    const cycleId = await seedCycle('LOCKED');
    const biz = await seedBusiness({ categoryId, delegation, trust: 'CLAIMED' }); // not VERIFIED
    const order = await seedConfirmedOrder(cycleId, biz, 'PREMIUM', staffId, 300000n);
    await withTx((tx) => allocateSeat(SYS, tx, cycleId, 'PREMIUM', biz, order));
    await expect(withTx((tx) => publishCycle(OPS, tx, cycleId)))
      .rejects.toThrow(/unverified_premium/);
  });
});
