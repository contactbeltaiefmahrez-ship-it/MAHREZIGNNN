import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  buildViewport, capForOrganic, bucketFor, CAP_DENOMINATOR,
  MIN_ORGANIC_FOR_ANY_GRANT, type Candidate,
} from '../../modules/attention/domain/one-in-six.ts';

const candidate = (i: number, granted: boolean): Candidate => ({
  businessId: `b-${String(i).padStart(4, '0')}`,
  discoveryScore: (i % 100) / 100, attentionWeight: (i % 5) + 1, hasGrant: granted,
});

describe('INVARIANT 2a · the 1-in-6 attention cap', () => {
  it('derives the cap as floor(organic/5), not floor(visible/6)', () => {
    expect(capForOrganic(0)).toBe(0);
    expect(capForOrganic(4)).toBe(0);   // any grant here would be 1-in-5 or worse
    expect(capForOrganic(5)).toBe(1);   // 1 of 6 visible — exactly at the cap
    expect(capForOrganic(9)).toBe(1);
    expect(capForOrganic(10)).toBe(2);  // 2 of 12 visible
    expect(capForOrganic(30)).toBe(6);  // 6 of 36 visible
    // the naive (wrong) formula would over-deliver by ~20%
    expect(capForOrganic(30)).toBeLessThan(Math.floor(30 / CAP_DENOMINATOR) + 2);
  });

  it('never exceeds 1 in 6 visible, over 10k generated viewports', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 400 }),
        fc.string({ minLength: 1, maxLength: 24 }), fc.integer({ min: 1, max: 300 }),
        (nOrganic, nGranted, session, limit) => {
          const cands = [
            ...Array.from({ length: nOrganic }, (_, i) => candidate(i, false)),
            ...Array.from({ length: nGranted }, (_, i) => candidate(10_000 + i, true)),
          ];
          const r = buildViewport(cands, session, limit);
          expect(r.grantedCount * CAP_DENOMINATOR).toBeLessThanOrEqual(r.visibleCount);
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('delivers zero grants when fewer than 5 organic pins are visible', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MIN_ORGANIC_FOR_ANY_GRANT - 1 }),
        fc.integer({ min: 1, max: 50 }), fc.string({ minLength: 1 }),
        (nOrganic, nGranted, session) => {
          const cands = [
            ...Array.from({ length: nOrganic }, (_, i) => candidate(i, false)),
            ...Array.from({ length: nGranted }, (_, i) => candidate(10_000 + i, true)),
          ];
          expect(buildViewport(cands, session, 200).grantedCount).toBe(0);
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it('labels every granted item — no unlabelled paid visibility exists', () => {
    const cands = [
      ...Array.from({ length: 60 }, (_, i) => candidate(i, false)),
      ...Array.from({ length: 20 }, (_, i) => candidate(10_000 + i, true)),
    ];
    const r = buildViewport(cands, 'sess-1', 200);
    expect(r.items.filter((i) => i.sponsored).length).toBe(r.grantedCount);
    expect(r.grantedCount).toBeGreaterThan(0);
  });

  it('is deterministic: same session and viewport yields byte-identical output', () => {
    const cands = [
      ...Array.from({ length: 40 }, (_, i) => candidate(i, false)),
      ...Array.from({ length: 12 }, (_, i) => candidate(10_000 + i, true)),
    ];
    const a = buildViewport(cands, 'session-abc', 100);
    const b = buildViewport(cands, 'session-abc', 100);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rotates across the 6 buckets so surplus grants are deferred, not dropped', () => {
    const cands = [
      ...Array.from({ length: 30 }, (_, i) => candidate(i, false)),   // cap = 6
      ...Array.from({ length: 24 }, (_, i) => candidate(10_000 + i, true)),
    ];
    const sessions = ['s0','s1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11'];
    const seen = new Set<string>();
    for (const s of sessions) {
      const r = buildViewport(cands, s, 200);
      expect(r.grantedCount).toBe(6);
      expect(r.deferredGrantIds.length).toBe(18);   // deferred, never silently lost
      for (const it of r.items) if (it.sponsored) seen.add(it.businessId);
    }
    // rotation must spread exposure beyond a single fixed slice
    expect(seen.size).toBeGreaterThan(6);
  });

  it('assigns buckets in the range 0..5 and stably', () => {
    for (const s of ['a','b','c','session-xyz','١٢٣']) {
      const b = bucketFor(s);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(CAP_DENOMINATOR);
      expect(bucketFor(s)).toBe(b);
    }
  });
});
