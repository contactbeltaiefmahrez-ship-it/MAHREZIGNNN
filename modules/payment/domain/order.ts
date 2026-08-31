/**
 * Seat order state machine (Architecture 13.1). Money never becomes a boolean.
 * `owner_claims_payment` is a CLAIM: it does not move the seat. Only ops
 * confirmation, backed by a payment row, advances the order (R42).
 */
import { AppError } from '../../../platform/errors.ts';
import type { Millimes } from '../../../platform/money.ts';

export type OrderState =
  | 'PENDING_REVIEW' | 'APPROVED_AWAITING_PAYMENT' | 'PAYMENT_CLAIMED' | 'CONFIRMED'
  | 'LIVE' | 'COMPLETED' | 'EXPIRED' | 'REJECTED' | 'CANCELLED' | 'REFUNDED';

export type OrderEvent =
  | 'approve' | 'reject' | 'owner_claims_payment' | 'ops_confirm'
  | 'deadline_passed' | 'publish' | 'cycle_close' | 'cancel' | 'refund';

export type OrderActor = 'OWNER' | 'OPS' | 'ADMIN' | 'SYSTEM';

interface Transition {
  from: OrderState; event: OrderEvent; to: OrderState; actors: readonly OrderActor[];
}

const T: readonly Transition[] = [
  { from: 'PENDING_REVIEW', event: 'approve', to: 'APPROVED_AWAITING_PAYMENT', actors: ['OPS','ADMIN'] },
  { from: 'PENDING_REVIEW', event: 'reject',  to: 'REJECTED',                  actors: ['OPS','ADMIN'] },
  { from: 'APPROVED_AWAITING_PAYMENT', event: 'owner_claims_payment', to: 'PAYMENT_CLAIMED', actors: ['OWNER'] },
  { from: 'APPROVED_AWAITING_PAYMENT', event: 'ops_confirm',      to: 'CONFIRMED', actors: ['OPS','ADMIN'] },
  { from: 'PAYMENT_CLAIMED',           event: 'ops_confirm',      to: 'CONFIRMED', actors: ['OPS','ADMIN'] },
  { from: 'APPROVED_AWAITING_PAYMENT', event: 'deadline_passed',  to: 'EXPIRED',   actors: ['SYSTEM'] },
  { from: 'PAYMENT_CLAIMED',           event: 'deadline_passed',  to: 'EXPIRED',   actors: ['SYSTEM'] },
  { from: 'CONFIRMED', event: 'publish',     to: 'LIVE',      actors: ['SYSTEM'] },
  { from: 'LIVE',      event: 'cycle_close', to: 'COMPLETED', actors: ['SYSTEM'] },
  { from: 'PENDING_REVIEW',             event: 'cancel', to: 'CANCELLED', actors: ['OWNER','OPS','ADMIN'] },
  { from: 'APPROVED_AWAITING_PAYMENT',  event: 'cancel', to: 'CANCELLED', actors: ['OWNER','OPS','ADMIN'] },
  { from: 'PAYMENT_CLAIMED',            event: 'cancel', to: 'CANCELLED', actors: ['OWNER','OPS','ADMIN'] },
  { from: 'CONFIRMED', event: 'refund', to: 'REFUNDED', actors: ['OPS','ADMIN'] },
  { from: 'LIVE',      event: 'refund', to: 'REFUNDED', actors: ['OPS','ADMIN'] },
];

export function nextOrderState(from: OrderState, event: OrderEvent, actor: OrderActor): OrderState {
  const t = T.find((x) => x.from === from && x.event === event);
  if (!t) {
    throw new AppError('INVALID_STATE_TRANSITION', `order cannot ${event} from ${from}`, { from, event });
  }
  if (!t.actors.includes(actor)) {
    throw new AppError('INSUFFICIENT_ROLE', `${actor} may not ${event} an order`, { from, event, actor });
  }
  return t.to;
}

/** A seat only ever goes live from these states. */
export const ORDER_STATES_ALLOWING_LIVE_SEAT: readonly OrderState[] = ['CONFIRMED', 'LIVE'];

export interface ReconciliationInput {
  state: OrderState; amountMillimes: Millimes;
  payments: readonly Millimes[]; refunds: readonly Millimes[];
}

/**
 * The invariant checked hourly in production and asserted in tests:
 * for any settled order, payments - refunds must equal the order amount.
 */
export function reconciles(i: ReconciliationInput): boolean {
  const settled: readonly OrderState[] = ['CONFIRMED', 'LIVE', 'COMPLETED'];
  if (!settled.includes(i.state)) return true;
  const paid = i.payments.reduce((a, b) => a + b, 0n);
  const refunded = i.refunds.reduce((a, b) => a + b, 0n);
  return paid - refunded === i.amountMillimes;
}
