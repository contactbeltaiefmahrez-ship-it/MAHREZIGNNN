/**
 * Deterministic discovery ranking (MVP Specification 10.3).
 * No ML, no popularity, no click-through: at pilot volume those are noise and a
 * rich-get-richer loop, and they are gameable by the parties with the most
 * incentive to game them.
 *
 * The 60% viewer-independent component is stored on the row; distance (30%) is
 * applied at request time on list surfaces only (Architecture 07.2).
 */
export const RANKING_VERSION = 1;

export const WEIGHTS = {
  distance: 0.30, trust: 0.25, completeness: 0.15,
  freshness: 0.10, offer: 0.10, grant: 0.10,
} as const;

export type TrustLevel = 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
const TRUST_VALUE: Record<TrustLevel, number> = { UNCLAIMED: 0, CLAIMED: 0.5, VERIFIED: 1 };

export interface StoredScoreInput {
  trustLevel: TrustLevel;
  completenessScore: number;       // 0..100
  daysSinceOwnerUpdate: number | null;
  hasActiveOffer: boolean;
  hasAttentionGrant: boolean;
}

/** Linear decay to a floor at 90 days. Null (never updated) scores 0. */
export function freshnessTerm(days: number | null): number {
  if (days === null) return 0;
  if (days <= 0) return 1;
  if (days >= 90) return 0;
  return 1 - days / 90;
}

/** The stored, viewer-independent 60%. Normalised to [0,1] for legibility. */
export function storedScore(i: StoredScoreInput): number {
  const raw =
    WEIGHTS.trust * TRUST_VALUE[i.trustLevel] +
    WEIGHTS.completeness * (Math.min(100, Math.max(0, i.completenessScore)) / 100) +
    WEIGHTS.freshness * freshnessTerm(i.daysSinceOwnerUpdate) +
    WEIGHTS.offer * (i.hasActiveOffer ? 1 : 0) +
    WEIGHTS.grant * (i.hasAttentionGrant ? 1 : 0);
  const max = WEIGHTS.trust + WEIGHTS.completeness + WEIGHTS.freshness + WEIGHTS.offer + WEIGHTS.grant;
  return Number((raw / max).toFixed(6));
}

/** 1..5, drives pin size and the zoom-tier cut. Never hand-set (R40). */
export function attentionWeight(score: number): number {
  if (score >= 0.85) return 5;
  if (score >= 0.65) return 4;
  if (score >= 0.45) return 3;
  if (score >= 0.25) return 2;
  return 1;
}

/** Full formula, list and category surfaces only. */
export function finalScore(stored: number, normalizedDistance: number): number {
  const d = Math.min(1, Math.max(0, normalizedDistance));
  return Number((WEIGHTS.distance * (1 - d) + (1 - WEIGHTS.distance) * stored).toFixed(6));
}

/** Term-by-term breakdown, so "why is he above me?" is answered with arithmetic. */
export function explain(i: StoredScoreInput): Record<string, number> {
  return {
    trust: WEIGHTS.trust * TRUST_VALUE[i.trustLevel],
    completeness: WEIGHTS.completeness * (i.completenessScore / 100),
    freshness: WEIGHTS.freshness * freshnessTerm(i.daysSinceOwnerUpdate),
    offer: WEIGHTS.offer * (i.hasActiveOffer ? 1 : 0),
    grant: WEIGHTS.grant * (i.hasAttentionGrant ? 1 : 0),
    stored: storedScore(i),
  };
}

export interface TrustInput {
  claimed: boolean; verified: boolean;
  completenessScore: number; daysSinceOwnerUpdate: number | null;
  unresolvedValidReports: number;
}

/**
 * Trust composition (MVP Specification 10.4). Note what is absent: money.
 * No payment, order, grant or seat appears in this signature, and this module
 * is forbidden by lint from importing `attention` at all.
 */
export function publicTrustLevel(i: TrustInput): TrustLevel {
  if (i.verified) return 'VERIFIED';
  if (i.claimed) return 'CLAIMED';
  return 'UNCLAIMED';
}
