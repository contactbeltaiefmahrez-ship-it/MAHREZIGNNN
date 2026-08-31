/**
 * Batch validation. Phase 06 §40: the pipeline REJECTS bad batches rather than
 * silently publishing corruption. Geographic validity is not geographic accuracy
 * (§13), so validity failures are errors and accuracy doubts are confidence
 * downgrades, never the reverse.
 */
import type { CoordConfidence } from './types.ts';

export interface StagingCandidate {
  nameAr: string | null; nameFr: string | null;
  phoneE164: string | null; website: string | null;
  addressText: string | null;
  governorate: string | null; delegationCode: string | null;
  lon: number | null; lat: number | null;
  categorySlug: string | null;
  coordinateConfidence: CoordConfidence;
  sourceRecordId: string | null; sourceCode: string | null;
}

export interface Finding { code: string; field?: string; detail?: string }
export interface ValidationResult {
  errors: Finding[]; warnings: Finding[]; confidence: CoordConfidence;
}

/** Tunisia's national bounding box. Anything outside is not Tunisian. */
export const TUNISIA_BBOX = { west: 7.49, south: 30.23, east: 11.60, north: 37.55 };
/** The approved pilot footprint (Grand Tunis), matching the CORE CHECK. */
export const PILOT_BBOX = { west: 9.90, south: 36.55, east: 10.55, north: 37.10 };

/** Null Island and other degenerate coordinates seen in real feeds. */
const DEGENERATE: ReadonlyArray<[number, number]> = [[0, 0], [1, 1], [-1, -1]];

export function validateCandidate(c: StagingCandidate): ValidationResult {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  let confidence = c.coordinateConfidence;

  // ── identity
  if (!c.nameAr && !c.nameFr) errors.push({ code: 'NAME_MISSING' });
  const longest = Math.max(c.nameAr?.trim().length ?? 0, c.nameFr?.trim().length ?? 0);
  if (longest > 0 && longest < 2) errors.push({ code: 'NAME_TOO_SHORT', field: 'name' });
  if (longest > 120) warnings.push({ code: 'NAME_SUSPICIOUSLY_LONG', field: 'name' });

  // ── provenance is mandatory (R49). A record without it cannot be published.
  if (!c.sourceCode) errors.push({ code: 'PROVENANCE_MISSING' });
  if (!c.sourceRecordId) warnings.push({ code: 'SOURCE_RECORD_ID_MISSING' });

  // ── category
  if (!c.categorySlug) errors.push({ code: 'CATEGORY_MISSING' });

  // ── geography: validity
  if (c.lon === null || c.lat === null) {
    errors.push({ code: 'COORDINATES_MISSING' });
    confidence = 'UNKNOWN';
  } else {
    if (!Number.isFinite(c.lon) || !Number.isFinite(c.lat)) {
      errors.push({ code: 'COORDINATES_NOT_FINITE' });
    } else if (Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) {
      errors.push({ code: 'COORDINATES_OUT_OF_RANGE' });
    } else if (DEGENERATE.some(([x, y]) => Math.abs(c.lon! - x) < 1e-6 && Math.abs(c.lat! - y) < 1e-6)) {
      errors.push({ code: 'COORDINATES_DEGENERATE' });
    } else if (
      c.lon < TUNISIA_BBOX.west || c.lon > TUNISIA_BBOX.east ||
      c.lat < TUNISIA_BBOX.south || c.lat > TUNISIA_BBOX.north
    ) {
      errors.push({ code: 'COORDINATES_OUTSIDE_TUNISIA' });
    } else if (
      c.lon < PILOT_BBOX.west || c.lon > PILOT_BBOX.east ||
      c.lat < PILOT_BBOX.south || c.lat > PILOT_BBOX.north
    ) {
      errors.push({ code: 'COORDINATES_OUTSIDE_PILOT_AREA' });
    }

    // ── geography: accuracy signals downgrade confidence, they do not reject.
    // Two decimal places is roughly 1.1 km — a centroid, not an address.
    const decimals = (v: number): number => (v.toString().split('.')[1] ?? '').length;
    const precision = Math.min(decimals(c.lon), decimals(c.lat));
    if (precision <= 2) {
      warnings.push({ code: 'COORDINATE_PRECISION_LOW', detail: `${precision} decimals` });
      confidence = downgrade(confidence, 'LOW');
    } else if (precision === 3) {
      confidence = downgrade(confidence, 'MEDIUM');
    }
  }

  if (!c.delegationCode) {
    warnings.push({ code: 'DELEGATION_MISSING' });
  }
  if (!c.governorate) warnings.push({ code: 'GOVERNORATE_MISSING' });

  // ── contact
  if (c.phoneE164 && !/^\+216[2-9]\d{7}$/.test(c.phoneE164)) {
    errors.push({ code: 'PHONE_INVALID', field: 'phone' });
  }
  if (!c.phoneE164) warnings.push({ code: 'PHONE_MISSING' });
  if (c.website && !/^https?:\/\/[^\s]+\.[^\s]+$/.test(c.website)) {
    errors.push({ code: 'URL_INVALID', field: 'website' });
  }

  // ── privacy: refuse anything that looks like a personal identifier (§37)
  const blob = [c.nameAr, c.nameFr, c.addressText].filter(Boolean).join(' ');
  if (/\b\d{8}\b/.test(blob) && !c.phoneE164) {
    warnings.push({ code: 'POSSIBLE_BARE_PHONE_IN_TEXT' });
  }
  if (/\b[A-Z]{2}\d{6,}\b/.test(blob)) {
    errors.push({ code: 'POSSIBLE_PERSONAL_IDENTIFIER', detail: 'ID-like token in free text' });
  }

  return { errors, warnings, confidence };
}

const ORDER: readonly CoordConfidence[] = ['VERIFIED', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
/** Confidence only ever moves down through validation, never up. */
export function downgrade(a: CoordConfidence, b: CoordConfidence): CoordConfidence {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

/** Publishable coordinates. Matches the CHECK constraint in migration 009. */
export function isLocatable(c: CoordConfidence): boolean {
  return c === 'VERIFIED' || c === 'HIGH' || c === 'MEDIUM';
}

// ── Quality score (Phase 06 §39). Operational only; never shown to consumers.
export interface QualityInput {
  hasNameAr: boolean; hasNameFr: boolean; hasPhone: boolean; hasWebsite: boolean;
  hasAddress: boolean; hasDelegation: boolean; hasCategory: boolean;
  confidence: CoordConfidence; sourceReliability: number; ageDays: number | null;
  warningCount: number;
}

export function qualityScore(q: QualityInput): number {
  let s = 0;
  s += q.hasNameAr ? 15 : 0;
  s += q.hasNameFr ? 5 : 0;
  s += q.hasCategory ? 10 : 0;
  s += q.hasDelegation ? 10 : 0;
  s += q.hasPhone ? 15 : 0;
  s += q.hasWebsite ? 5 : 0;
  s += q.hasAddress ? 5 : 0;
  s += { VERIFIED: 20, HIGH: 16, MEDIUM: 10, LOW: 3, UNKNOWN: 0 }[q.confidence];
  s += Math.round((q.sourceReliability / 5) * 10);
  if (q.ageDays !== null && q.ageDays > 365) s -= 5;
  s -= Math.min(10, q.warningCount * 2);
  return Math.max(0, Math.min(100, s));
}

/** Batch-level gate. A batch that fails does not publish (§40). */
export interface BatchGate {
  total: number; errorRecords: number; duplicateRecords: number; medianQuality: number;
}
export const BATCH_THRESHOLDS = {
  maxErrorRate: 0.10,      // >10% invalid means the source or mapping is wrong
  maxDuplicateRate: 0.25,  // >25% duplicates means re-importing an existing set
  minMedianQuality: 45,
} as const;

export function batchAcceptable(g: BatchGate): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (g.total === 0) reasons.push('EMPTY_BATCH');
  if (g.total > 0 && g.errorRecords / g.total > BATCH_THRESHOLDS.maxErrorRate) {
    reasons.push(`ERROR_RATE_TOO_HIGH:${((g.errorRecords / g.total) * 100).toFixed(1)}%`);
  }
  if (g.total > 0 && g.duplicateRecords / g.total > BATCH_THRESHOLDS.maxDuplicateRate) {
    reasons.push(`DUPLICATE_RATE_TOO_HIGH:${((g.duplicateRecords / g.total) * 100).toFixed(1)}%`);
  }
  if (g.medianQuality < BATCH_THRESHOLDS.minMedianQuality) {
    reasons.push(`MEDIAN_QUALITY_TOO_LOW:${g.medianQuality}`);
  }
  return { ok: reasons.length === 0, reasons };
}
