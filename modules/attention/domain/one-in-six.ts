/**
 * The 1-in-6 attention cap. Constitutional rule (Pitch Deck; Architecture 08).
 *
 * Requirements it must satisfy simultaneously:
 *   - server-side and not bypassable by any client
 *   - deterministic: the same session + viewport always yields the same result
 *   - per-viewport, correct in sparse and dense areas
 *   - fair over the week: surplus grants ROTATE, they are not dropped
 *   - reproducible for audit
 *   - cacheable: the rotation bucket is a request parameter, not a random draw
 *
 * Deliberately pure: no I/O, no clock, no randomness. That is what makes it
 * property-testable and what makes the audit replay possible.
 */

export interface Candidate {
  readonly businessId: string;
  /** Viewer-independent component of the ranking, precomputed (Architecture 07.2). */
  readonly discoveryScore: number;
  readonly attentionWeight: number;
  readonly hasGrant: boolean;
}

export interface ViewportResult {
  readonly items: readonly PlacedItem[];
  readonly visibleCount: number;
  readonly grantedCount: number;
  readonly bucket: number;
  /** Grants eligible in this viewport but rotated out of this session's slice. */
  readonly deferredGrantIds: readonly string[];
}

export interface PlacedItem {
  readonly businessId: string;
  /** True => the payload MUST carry a visible "مموّل / Sponsorisé" label. */
  readonly sponsored: boolean;
}

export const CAP_DENOMINATOR = 6;
/** Below this many organic pins, ANY grant would exceed 1-in-6. */
export const MIN_ORGANIC_FOR_ANY_GRANT = 5;

/**
 * "No more than 1 in 6 VISIBLE pins is granted", where visible = organic + granted:
 *
 *     granted <= (organic + granted) / 6
 *   6·granted <= organic + granted
 *     granted <= organic / 5
 *
 * Using floor(visible/6) with `visible` meaning organic-only over-delivers grants
 * by ~20%. This function exists so that arithmetic lives in one tested place.
 */
export function capForOrganic(organicShown: number): number {
  if (organicShown < MIN_ORGANIC_FOR_ANY_GRANT) return 0;
  return Math.floor(organicShown / (CAP_DENOMINATOR - 1));
}

/** FNV-1a. Stable across processes and releases — required for reproducibility. */
export function stableHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function bucketFor(sessionId: string): number {
  return stableHash(sessionId) % CAP_DENOMINATOR;
}

/** Deterministic rotation so exposure equalises across the session population. */
function rotate<T>(items: readonly T[], bucket: number): readonly T[] {
  if (items.length === 0) return items;
  const stride = Math.ceil(items.length / CAP_DENOMINATOR);
  const offset = (bucket * stride) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/** Stable ordering: score desc, then id asc. Never Math.random, never insertion order. */
function ordered(items: readonly Candidate[]): Candidate[] {
  return [...items].sort(
    (a, b) =>
      b.discoveryScore - a.discoveryScore ||
      (a.businessId < b.businessId ? -1 : a.businessId > b.businessId ? 1 : 0),
  );
}

export function buildViewport(
  candidates: readonly Candidate[],
  sessionId: string,
  payloadLimit: number,
): ViewportResult {
  const bucket = bucketFor(sessionId);
  const sorted = ordered(candidates);

  const organic = sorted.filter((c) => !c.hasGrant);
  const granted = sorted.filter((c) => c.hasGrant);

  const organicShown = Math.min(organic.length, payloadLimit);
  const cap = capForOrganic(organicShown);
  const grantedShown = Math.min(granted.length, cap);

  const rotated = rotate(granted, bucket);
  const selected = rotated.slice(0, grantedShown);
  const selectedIds = new Set(selected.map((c) => c.businessId));

  const merged = ordered([...organic.slice(0, organicShown), ...selected]);

  const items: PlacedItem[] = merged.map((c) => ({
    businessId: c.businessId,
    sponsored: c.hasGrant,
  }));

  const result: ViewportResult = {
    items,
    visibleCount: items.length,
    grantedCount: selected.length,
    bucket,
    deferredGrantIds: granted
      .filter((c) => !selectedIds.has(c.businessId))
      .map((c) => c.businessId),
  };

  // Retained in production. Should never fire; if it does it is a page, not a log.
  assertCompliant(result);
  return result;
}

export class ConstitutionalViolation extends Error {}

export function assertCompliant(r: ViewportResult): void {
  if (r.grantedCount * CAP_DENOMINATOR > r.visibleCount) {
    throw new ConstitutionalViolation(
      `1-in-6 violated: ${r.grantedCount} granted of ${r.visibleCount} visible`,
    );
  }
  const labelled = r.items.filter((i) => i.sponsored).length;
  if (labelled !== r.grantedCount) {
    throw new ConstitutionalViolation(
      `unlabelled paid visibility: ${r.grantedCount} granted, ${labelled} labelled`,
    );
  }
}
