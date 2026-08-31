import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import type { SeatTier, SeatSource } from '../domain/cycle.ts';

export interface AllocatedSeat { id: string; position: number }

/**
 * INVARIANT 1 — a seat cannot be sold twice.
 *
 * Compare-and-set against pre-created rows. FOR UPDATE SKIP LOCKED means two
 * concurrent allocations take two DIFFERENT seats without either blocking;
 * when the tier is exhausted, zero rows come back and the caller falls to R27.
 * unique(cycle_id, business_id) catches a double order even if the application
 * layer is bypassed entirely.
 */
export async function allocateSeat(
  _actor: ActorContext,
  tx: Tx,
  cycleId: string,
  tier: SeatTier,
  businessId: string,
  seatOrderId: string,
): Promise<AllocatedSeat | null> {
  const res = await tx.query<AllocatedSeat>(
    `update market_seat
        set business_id = $3, seat_order_id = $4, assigned_at = now()
      where id = (
        select id from market_seat
         where cycle_id = $1 and tier = $2
           and source = 'SELLABLE' and business_id is null
         order by position
         for update skip locked
         limit 1)
      returning id, position`,
    [cycleId, tier, businessId, seatOrderId],
  );
  return res.rows[0] ?? null;
}

export async function createSeatsForCycle(
  _actor: ActorContext,
  tx: Tx,
  cycleId: string,
  plan: ReadonlyArray<{ position: number; tier: SeatTier; source: SeatSource }>,
): Promise<number> {
  const res = await tx.query(
    `insert into market_seat (cycle_id, position, tier, source)
     select $1, p.position, p.tier::seat_tier, p.source::seat_source
       from jsonb_to_recordset($2::jsonb)
            as p(position smallint, tier text, source text)`,
    [cycleId, JSON.stringify(plan)],
  );
  return res.rowCount ?? 0;
}

export async function countOccupied(
  _actor: ActorContext, tx: Tx, cycleId: string,
): Promise<number> {
  const r = await tx.query<{ n: string }>(
    `select count(*)::text as n from market_seat
      where cycle_id = $1 and business_id is not null`,
    [cycleId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function assignCuratedSeat(
  _actor: ActorContext, tx: Tx, cycleId: string, tier: SeatTier, businessId: string,
): Promise<AllocatedSeat | null> {
  const res = await tx.query<AllocatedSeat>(
    `update market_seat
        set business_id = $3, assigned_at = now()
      where id = (
        select id from market_seat
         where cycle_id = $1 and tier = $2
           and source = 'CURATED' and business_id is null
         order by position
         for update skip locked
         limit 1)
      returning id, position`,
    [cycleId, tier, businessId],
  );
  return res.rows[0] ?? null;
}
