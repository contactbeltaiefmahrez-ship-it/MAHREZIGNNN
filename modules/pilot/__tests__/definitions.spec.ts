import { describe, it, expect } from 'vitest';
import {
  isBusinessActivated, isUserActivated, countsForInvestorMetrics,
  verdictFor, HYPOTHESES, STOP_CONDITIONS,
} from '../service.ts';

describe('Pilot definitions are executable, not prose', () => {
  it('does not activate a business merely for existing', () => {
    expect(isBusinessActivated({ trustLevel: 'UNCLAIMED', completenessScore: 90, ownerUpdatedAfterClaim: true })).toBe(false);
    expect(isBusinessActivated({ trustLevel: 'CLAIMED', completenessScore: 40, ownerUpdatedAfterClaim: true })).toBe(false);
    expect(isBusinessActivated({ trustLevel: 'CLAIMED', completenessScore: 80, ownerUpdatedAfterClaim: false })).toBe(false);
    expect(isBusinessActivated({ trustLevel: 'CLAIMED', completenessScore: 80, ownerUpdatedAfterClaim: true })).toBe(true);
  });
  it('does not activate a user for a page view', () => {
    expect(isUserActivated([])).toBe(false);
    expect(isUserActivated(['map_open', 'search'])).toBe(false);
    expect(isUserActivated(['business_open'])).toBe(false);           // interest
    expect(isUserActivated(['contact_click'])).toBe(true);            // intent
    expect(isUserActivated(['business_open', 'business_open'])).toBe(true);
  });
  it('admits only organic traffic to investor metrics', () => {
    expect(countsForInvestorMetrics('ORGANIC')).toBe(true);
    for (const s of ['INTERNAL', 'OPS', 'BUSINESS', 'TEST_USER', 'BOT'] as const) {
      expect(countsForInvestorMetrics(s), s).toBe(false);
    }
  });
  it('returns INCONCLUSIVE below the minimum sample, never a verdict', () => {
    expect(verdictFor(80, 35, 15, 5)).toBe('INCONCLUSIVE');
    expect(verdictFor(null, 35, 15, 500)).toBe('INCONCLUSIVE');
    expect(verdictFor(40, 35, 15, 100)).toBe('SUPPORTED');
    expect(verdictFor(20, 35, 15, 100)).toBe('PARTIALLY_SUPPORTED');
    expect(verdictFor(9, 35, 15, 100)).toBe('NOT_SUPPORTED');
  });
  it('pre-registers every hypothesis with a threshold and a justification', () => {
    expect(HYPOTHESES.length).toBe(5);
    for (const h of HYPOTHESES) {
      expect(h.successThreshold.length, h.id).toBeGreaterThan(10);
      expect(h.failureThreshold.length, h.id).toBeGreaterThan(2);
      expect(h.justification.length, h.id).toBeGreaterThan(30);
    }
  });
  it('defines stop conditions that outrank any metric', () => {
    expect(STOP_CONDITIONS).toContain('publication without a lawful basis');
    expect(STOP_CONDITIONS.length).toBeGreaterThanOrEqual(5);
  });
});
