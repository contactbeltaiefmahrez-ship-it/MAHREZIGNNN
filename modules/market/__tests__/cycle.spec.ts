import { describe, it, expect } from 'vitest';
import {
  nextState, canTransition, seatPlan, TOTAL_SEATS, SELLABLE_SEATS,
  tierRequiresVerified, tierBelow, selectRising, selectNewcomer,
  type CuratedCandidate,
} from '../service.ts';

describe('market cycle state machine', () => {
  it('walks the canonical lifecycle', () => {
    let s = nextState('DRAFT', 'open');
    expect(s).toBe('APPLICATIONS_OPEN');
    s = nextState(s, 'close_applications'); expect(s).toBe('REVIEW_CLOSED');
    s = nextState(s, 'close_payments');     expect(s).toBe('PAYMENT_CLOSED');
    s = nextState(s, 'lock');               expect(s).toBe('LOCKED');
    s = nextState(s, 'publish');            expect(s).toBe('LIVE');
    s = nextState(s, 'close');              expect(s).toBe('CLOSED');
  });
  it('rejects skipping states', () => {
    expect(() => nextState('DRAFT', 'publish')).toThrow(/cannot publish from DRAFT/);
    expect(() => nextState('LIVE', 'publish')).toThrow();
    expect(canTransition('CLOSED', 'publish')).toBe(false);
  });
  it('lays out 100 seats: 52/20/10 sellable + 10/8 curated', () => {
    const plan = seatPlan();
    expect(plan.length).toBe(TOTAL_SEATS);
    const by = (t: string) => plan.filter((p) => p.tier === t).length;
    expect(by('STANDARD')).toBe(52);
    expect(by('PREMIUM')).toBe(20);
    expect(by('FEATURED')).toBe(10);
    expect(by('RISING')).toBe(10);
    expect(by('NEWCOMER')).toBe(8);
    expect(plan.filter((p) => p.source === 'SELLABLE').length).toBe(SELLABLE_SEATS);
    expect(new Set(plan.map((p) => p.position)).size).toBe(TOTAL_SEATS);
  });
  it('prices out at 19,800 TND/week at full sellable occupancy', () => {
    const price: Record<string, number> = { STANDARD: 150, PREMIUM: 300, FEATURED: 600 };
    const total = seatPlan()
      .filter((p) => p.source === 'SELLABLE')
      .reduce((a, p) => a + (price[p.tier] ?? 0), 0);
    expect(total).toBe(19_800);
  });
  it('gates the expensive tiers behind verification', () => {
    expect(tierRequiresVerified('PREMIUM')).toBe(true);
    expect(tierRequiresVerified('FEATURED')).toBe(true);
    expect(tierRequiresVerified('STANDARD')).toBe(false);
    expect(tierBelow('FEATURED')).toBe('PREMIUM');
    expect(tierBelow('STANDARD')).toBeNull();
  });
});

describe('curated seats are assigned by rule, never by discretion', () => {
  const mk = (id: string, o: Partial<CuratedCandidate>): CuratedCandidate => ({
    businessId: id, completenessAtOpen: 50, completenessNow: 50,
    trustAtOpen: 'CLAIMED', trustNow: 'CLAIMED', claimedAt: null,
    hasHeldSeatBefore: false, hasCompleteMinimumProfile: true, ...o,
  });
  it('ranks RISING by improvement, deterministically', () => {
    const c = [
      mk('b1', { completenessNow: 90 }),                       // +40
      mk('b2', { trustNow: 'VERIFIED' }),                      // +20
      mk('b3', {}),                                            // 0 -> excluded
      mk('b4', { completenessNow: 60, trustNow: 'VERIFIED' }), // +30
    ];
    expect(selectRising(c, 3)).toEqual(['b1', 'b4', 'b2']);
    expect(selectRising(c, 3)).toEqual(selectRising(c, 3));    // stable
  });
  it('excludes businesses that already held a seat from NEWCOMER', () => {
    const c = [
      mk('n1', { claimedAt: '2026-08-20', hasHeldSeatBefore: true }),
      mk('n2', { claimedAt: '2026-08-21' }),
      mk('n3', { claimedAt: '2026-08-22' }),
    ];
    expect(selectNewcomer(c, [], 5)).toEqual(['n3', 'n2']);
  });
  it('never assigns a business to both RISING and NEWCOMER', () => {
    const c = [mk('x', { completenessNow: 99, claimedAt: '2026-08-25' })];
    const rising = selectRising(c, 10);
    const newcomer = selectNewcomer(c, rising, 8);
    expect(rising).toContain('x');
    expect(newcomer).not.toContain('x');
  });
});
