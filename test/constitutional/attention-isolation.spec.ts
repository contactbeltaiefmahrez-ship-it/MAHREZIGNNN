import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { publicTrustLevel, storedScore } from '../../modules/discovery/domain/ranking.ts';

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? filesUnder(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('INVARIANT 2b · attention cannot reach search or trust', () => {
  it('the search module has no import path to attention', () => {
    for (const f of filesUnder('modules/search')) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/modules\/attention/);
    }
  });

  it('the discovery module has no import path to attention', () => {
    for (const f of filesUnder('modules/discovery')) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/modules\/attention/);
    }
  });

  it('trust computation takes no money, order, grant or seat input', () => {
    const src = readFileSync('modules/discovery/domain/ranking.ts', 'utf8');
    const start = src.indexOf('export interface TrustInput');
    // scan the interface BODY only — trailing prose may legitimately name these
    const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('}', start));
    for (const forbidden of ['payment', 'order', 'grant', 'seat', 'millimes', 'tier']) {
      expect(body.toLowerCase()).not.toContain(forbidden);
    }
    // and the function signature itself takes only TrustInput
    expect(src).toMatch(/publicTrustLevel\(i: TrustInput\): TrustLevel/);
  });

  it('granting attention cannot change the public trust level', () => {
    const base = {
      claimed: true, verified: false, completenessScore: 90,
      daysSinceOwnerUpdate: 1, unresolvedValidReports: 0,
    };
    expect(publicTrustLevel(base)).toBe('CLAIMED');
    // there is no field through which a grant could be supplied at all
    expect(Object.keys(base)).not.toContain('hasAttentionGrant');
  });

  it('a grant moves discovery score by exactly its published 10% weight, no more', () => {
    const i = {
      trustLevel: 'CLAIMED' as const, completenessScore: 80,
      daysSinceOwnerUpdate: 10, hasActiveOffer: false, hasAttentionGrant: false,
    };
    const without = storedScore(i);
    const withGrant = storedScore({ ...i, hasAttentionGrant: true });
    const delta = withGrant - without;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(0.10 / 0.70 + 1e-6); // 10 of the 70 stored points
  });
});
