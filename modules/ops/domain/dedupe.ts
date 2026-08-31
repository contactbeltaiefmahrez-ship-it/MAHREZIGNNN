/**
 * Duplicate classification (Phase 06 §12). Ambiguous records are NEVER merged
 * automatically — they go to an ops review queue.
 */
import type { DupClass } from './types.ts';

export interface DupSignals {
  nameSimilarity: number;      // 0..1 trigram
  distanceMetres: number | null;
  phoneMatch: boolean;
  websiteMatch: boolean;
  sameCategory: boolean;
}

export interface DupVerdict { class: DupClass; score: number; signals: DupSignals }

/**
 * Minimum name similarity before proximity may contribute at all.
 *
 * Found in Window 0: proximity plus same-category reached POSSIBLE with almost
 * no name agreement, so on a dense commercial street every neighbouring shop
 * became a duplicate candidate and the ops queue filled with noise. Two shops
 * next door are the NORMAL case in Corridor A, not an anomaly. A strong
 * identifier (phone or website) still overrides this floor, because that is
 * genuine evidence of the same business.
 */
export const NAME_SIMILARITY_FLOOR = 0.35;

export function classify(s: DupSignals): DupVerdict {
  // An exact phone match plus a plausible name is the strongest real-world signal.
  if (s.phoneMatch && s.nameSimilarity >= 0.45) {
    return { class: 'CONFIRMED', score: 0.98, signals: s };
  }
  if (s.websiteMatch && s.nameSimilarity >= 0.45) {
    return { class: 'CONFIRMED', score: 0.95, signals: s };
  }

  // Without a strong identifier and without name agreement, geography alone
  // cannot make two businesses the same business.
  if (s.nameSimilarity < NAME_SIMILARITY_FLOOR) {
    return { class: 'DISTINCT', score: Number(s.nameSimilarity.toFixed(3)), signals: s };
  }

  const near = s.distanceMetres !== null && s.distanceMetres <= 120;
  const veryNear = s.distanceMetres !== null && s.distanceMetres <= 30;

  let score = 0;
  score += s.nameSimilarity * 0.55;
  score += veryNear ? 0.30 : near ? 0.20 : 0;
  score += s.phoneMatch ? 0.10 : 0;
  score += s.sameCategory ? 0.05 : 0;
  score = Number(Math.min(1, score).toFixed(3));

  if (s.nameSimilarity >= 0.85 && veryNear) return { class: 'CONFIRMED', score, signals: s };
  if (score >= 0.70) return { class: 'PROBABLE', score, signals: s };
  if (score >= 0.50) return { class: 'POSSIBLE', score, signals: s };
  return { class: 'DISTINCT', score, signals: s };
}

/** Only CONFIRMED may be auto-actioned; everything else needs a human. */
export function requiresOpsReview(v: DupVerdict): boolean {
  return v.class === 'PROBABLE' || v.class === 'POSSIBLE';
}
export function autoMergeable(v: DupVerdict): boolean {
  return v.class === 'CONFIRMED';
}
