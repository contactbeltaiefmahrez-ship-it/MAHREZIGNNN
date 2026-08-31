/**
 * Market cycle state machine (Architecture 12.1) and the seat layout.
 * Pure: transitions are data, so an invalid transition is rejected before any I/O.
 */
import { AppError } from '../../../platform/errors.ts';

export type CycleState =
  | 'DRAFT' | 'APPLICATIONS_OPEN' | 'REVIEW_CLOSED' | 'PAYMENT_CLOSED'
  | 'LOCKED' | 'LIVE' | 'CLOSED';

export type CycleEvent =
  | 'open' | 'close_applications' | 'close_payments' | 'lock' | 'publish' | 'close';

const TRANSITIONS: ReadonlyArray<{ from: CycleState; event: CycleEvent; to: CycleState }> = [
  { from: 'DRAFT',            event: 'open',               to: 'APPLICATIONS_OPEN' },
  { from: 'APPLICATIONS_OPEN', event: 'close_applications', to: 'REVIEW_CLOSED' },
  { from: 'REVIEW_CLOSED',    event: 'close_payments',     to: 'PAYMENT_CLOSED' },
  { from: 'PAYMENT_CLOSED',   event: 'lock',               to: 'LOCKED' },
  { from: 'LOCKED',           event: 'publish',            to: 'LIVE' },
  { from: 'LIVE',             event: 'close',              to: 'CLOSED' },
];

export function nextState(from: CycleState, event: CycleEvent): CycleState {
  const t = TRANSITIONS.find((x) => x.from === from && x.event === event);
  if (!t) {
    throw new AppError(
      'INVALID_STATE_TRANSITION',
      `cycle cannot ${event} from ${from}`,
      { from, event },
    );
  }
  return t.to;
}

export function canTransition(from: CycleState, event: CycleEvent): boolean {
  return TRANSITIONS.some((x) => x.from === from && x.event === event);
}

export type SeatTier = 'STANDARD' | 'PREMIUM' | 'FEATURED' | 'RISING' | 'NEWCOMER';
export type SeatSource = 'SELLABLE' | 'CURATED';

/** Deck canon: 52+20+10 sellable = 19,800 TND/week at full occupancy, +18 curated. */
export const SEAT_LAYOUT: ReadonlyArray<{ tier: SeatTier; source: SeatSource; count: number }> = [
  { tier: 'STANDARD', source: 'SELLABLE', count: 52 },
  { tier: 'PREMIUM',  source: 'SELLABLE', count: 20 },
  { tier: 'FEATURED', source: 'SELLABLE', count: 10 },
  { tier: 'RISING',   source: 'CURATED',  count: 10 },
  { tier: 'NEWCOMER', source: 'CURATED',  count: 8  },
];

export const TOTAL_SEATS = 100;
export const SELLABLE_SEATS = 82;

/** Positions are fixed and assigned with the cycle. Seats are never created later. */
export function seatPlan(): ReadonlyArray<{ position: number; tier: SeatTier; source: SeatSource }> {
  const plan: { position: number; tier: SeatTier; source: SeatSource }[] = [];
  let pos = 1;
  for (const block of SEAT_LAYOUT) {
    for (let i = 0; i < block.count; i++) {
      plan.push({ position: pos++, tier: block.tier, source: block.source });
    }
  }
  if (plan.length !== TOTAL_SEATS) {
    throw new Error(`seat plan must be exactly ${TOTAL_SEATS}, got ${plan.length}`);
  }
  return plan;
}

/** Premium and Featured require VERIFIED (R24). Checked at three points. */
export function tierRequiresVerified(tier: SeatTier): boolean {
  return tier === 'PREMIUM' || tier === 'FEATURED';
}

export const SELLABLE_TIERS: readonly SeatTier[] = ['STANDARD', 'PREMIUM', 'FEATURED'];

/** Next tier down, for R27 (tier full -> offer the tier below). */
export function tierBelow(tier: SeatTier): SeatTier | null {
  if (tier === 'FEATURED') return 'PREMIUM';
  if (tier === 'PREMIUM') return 'STANDARD';
  return null;
}

// ── Curated seat assignment (R29): by published rule, never ops discretion.
export interface CuratedCandidate {
  readonly businessId: string;
  readonly completenessAtOpen: number;
  readonly completenessNow: number;
  readonly trustAtOpen: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
  readonly trustNow: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
  readonly claimedAt: string | null;
  readonly hasHeldSeatBefore: boolean;
  readonly hasCompleteMinimumProfile: boolean;
}

const TRUST_RANK = { UNCLAIMED: 0, CLAIMED: 1, VERIFIED: 2 } as const;

export function improvementScore(c: CuratedCandidate): number {
  const completeness = c.completenessNow - c.completenessAtOpen;
  const trust = (TRUST_RANK[c.trustNow] - TRUST_RANK[c.trustAtOpen]) * 20;
  return completeness + trust;
}

/** RISING: the 10 largest trust+completeness improvements this cycle. */
export function selectRising(candidates: readonly CuratedCandidate[], slots = 10): string[] {
  return candidates
    .filter((c) => improvementScore(c) > 0)
    .sort(
      (a, b) =>
        improvementScore(b) - improvementScore(a) ||
        (a.businessId < b.businessId ? -1 : 1),
    )
    .slice(0, slots)
    .map((c) => c.businessId);
}

/** NEWCOMER: the 8 most recently claimed with a complete profile and no prior seat. */
export function selectNewcomer(
  candidates: readonly CuratedCandidate[], exclude: readonly string[], slots = 8,
): string[] {
  const skip = new Set(exclude);
  return candidates
    .filter(
      (c) =>
        !skip.has(c.businessId) &&
        !c.hasHeldSeatBefore &&
        c.hasCompleteMinimumProfile &&
        c.claimedAt !== null,
    )
    .sort(
      (a, b) =>
        (b.claimedAt ?? '').localeCompare(a.claimedAt ?? '') ||
        (a.businessId < b.businessId ? -1 : 1),
    )
    .slice(0, slots)
    .map((c) => c.businessId);
}
