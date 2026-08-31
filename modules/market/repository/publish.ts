import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { AppError } from '../../../platform/errors.ts';
import { countNotPublished, countNotVerified } from '../../business/service.ts';
import { countNotConfirmed, markLive } from '../../payment/service.ts';
import { issueGrants } from '../../attention/service.ts';

export interface PublishResult {
  cycleId: string;
  alreadyPublished: boolean;
  seatsPublished: number;
  grantsIssued: number;
}

interface OccupiedSeat {
  id: string;
  business_id: string;
  seat_order_id: string | null;
  tier: string;
  source: string;
}

/**
 * INVARIANT 3 - publish is idempotent.
 *
 * The advisory lock serialises publishers cluster-wide; unique(cycle_id,to_state)
 * on cycle_transition makes a second attempt a no-op that returns success.
 * If any precondition fails the whole transaction rolls back and the PREVIOUS
 * cycle remains LIVE, so the market page can never render empty.
 *
 * On module boundaries: this function reads only market-owned tables. Facts
 * about businesses, orders and grants come from the modules that own them,
 * sharing this transaction. Ownership is preserved and atomicity is not
 * sacrificed for it.
 */
export async function publishCycle(
  actor: ActorContext, tx: Tx, cycleId: string,
): Promise<PublishResult> {
  await tx.query('select pg_advisory_xact_lock(hashtext($1))', ['market_publish']);

  const claimed = await tx.query(
    `insert into cycle_transition (cycle_id, from_state, to_state, actor_type, actor_id)
     values ($1,'LOCKED','LIVE',$2::actor_type,$3)
     on conflict (cycle_id, to_state) do nothing
     returning id`,
    [cycleId, actor.kind, actor.actorId],
  );

  const occupied = await tx.query<OccupiedSeat>(
    `select id, business_id, seat_order_id, tier::text, source::text
       from market_seat where cycle_id = $1 and business_id is not null
      order by position`,
    [cycleId],
  );

  if (claimed.rowCount === 0) {
    return {
      cycleId, alreadyPublished: true,
      seatsPublished: occupied.rowCount ?? 0, grantsIssued: 0,
    };
  }

  const cyc = await tx.query<{ state: string }>(
    `select state::text from market_cycle where id = $1 for update`, [cycleId],
  );
  if (cyc.rows[0]?.state !== 'LOCKED') {
    throw new AppError('CYCLE_NOT_LOCKED', `cycle is ${cyc.rows[0]?.state ?? 'missing'}`);
  }
  if ((occupied.rowCount ?? 0) === 0) {
    throw new AppError('INVALID_STATE_TRANSITION', 'publish blocked: no occupied seats');
  }

  const rows = occupied.rows;
  const allBusinessIds = rows.map((r) => r.business_id);
  const premiumBusinessIds = rows
    .filter((r) => r.tier === 'PREMIUM' || r.tier === 'FEATURED')
    .map((r) => r.business_id);
  const sellableOrderIds = rows
    .filter((r) => r.source === 'SELLABLE' && r.seat_order_id !== null)
    .map((r) => r.seat_order_id as string);

  const suspended = await countNotPublished(actor, tx, allBusinessIds);
  if (suspended > 0) {
    throw new AppError('INVALID_STATE_TRANSITION',
      `publish blocked: suspended_business (${suspended})`,
      { reason: 'suspended_business', count: suspended });
  }

  // R24, third and final enforcement point (application, payment, publish).
  const unverified = await countNotVerified(actor, tx, premiumBusinessIds);
  if (unverified > 0) {
    throw new AppError('INVALID_STATE_TRANSITION',
      `publish blocked: unverified_premium (${unverified})`,
      { reason: 'unverified_premium', count: unverified });
  }

  // R42: no sellable seat goes live without a confirmed order.
  const unpaid = await countNotConfirmed(actor, tx, sellableOrderIds);
  if (unpaid > 0) {
    throw new AppError('INVALID_STATE_TRANSITION',
      `publish blocked: sellable_without_confirmed_order (${unpaid})`,
      { reason: 'sellable_without_confirmed_order', count: unpaid });
  }

  await tx.query(
    `update market_cycle set state='LIVE', updated_at=now() where id=$1`, [cycleId],
  );

  const grantsIssued = await issueGrants(
    actor, tx,
    rows.map((r) => ({ businessId: r.business_id, cycleId, seatId: r.id, tier: r.tier })),
  );
  await markLive(actor, tx, sellableOrderIds);

  return {
    cycleId, alreadyPublished: false,
    seatsPublished: occupied.rowCount ?? 0, grantsIssued,
  };
}
