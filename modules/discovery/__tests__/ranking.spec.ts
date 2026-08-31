import { describe, it, expect } from 'vitest';
import { storedScore, attentionWeight, finalScore, explain, freshnessTerm, WEIGHTS } from '../service.ts';

const base = {
  trustLevel: 'CLAIMED' as const, completenessScore: 60,
  daysSinceOwnerUpdate: 10, hasActiveOffer: false, hasAttentionGrant: false,
};

describe('deterministic discovery ranking', () => {
  it('sums to the published weights', () => {
    expect(WEIGHTS.distance + WEIGHTS.trust + WEIGHTS.completeness
         + WEIGHTS.freshness + WEIGHTS.offer + WEIGHTS.grant).toBeCloseTo(1, 10);
  });
  it('is reproducible for identical input', () => {
    expect(storedScore(base)).toBe(storedScore(base));
  });
  it('increases monotonically with trust and completeness', () => {
    expect(storedScore({ ...base, trustLevel: 'VERIFIED' })).toBeGreaterThan(storedScore(base));
    expect(storedScore({ ...base, completenessScore: 100 })).toBeGreaterThan(storedScore(base));
  });
  it('decays freshness to a floor at 90 days', () => {
    expect(freshnessTerm(0)).toBe(1);
    expect(freshnessTerm(45)).toBeCloseTo(0.5, 6);
    expect(freshnessTerm(90)).toBe(0);
    expect(freshnessTerm(365)).toBe(0);
    expect(freshnessTerm(null)).toBe(0);
  });
  it('buckets attention weight into 1..5', () => {
    for (const s of [0, 0.2, 0.3, 0.5, 0.7, 0.9, 1]) {
      const w = attentionWeight(s);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(5);
    }
    expect(attentionWeight(0.9)).toBe(5);
    expect(attentionWeight(0.1)).toBe(1);
  });
  it('gives a term-by-term explanation for merchant disputes', () => {
    const e = explain({ ...base, hasActiveOffer: true });
    expect(Object.keys(e).sort()).toEqual(
      ['completeness','freshness','grant','offer','stored','trust']);
    expect(e.offer).toBeCloseTo(WEIGHTS.offer, 10);
    expect(e.grant).toBe(0);
  });
  it('applies distance only in the final list score', () => {
    const s = storedScore(base);
    expect(finalScore(s, 0)).toBeGreaterThan(finalScore(s, 1));
    expect(finalScore(s, 0) - finalScore(s, 1)).toBeCloseTo(WEIGHTS.distance, 5);
  });
});
