/**
 * Pilot definitions, executable rather than prose.
 *
 * §43 and §44 require activation to be measurable. "Visited the homepage" is
 * not activation; these are the definitions the metrics actually use.
 */

/** A business is ACTIVATED when its owner has claimed it AND maintained it. */
export interface BusinessActivationInput {
  trustLevel: 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
  completenessScore: number;
  ownerUpdatedAfterClaim: boolean;
}
export function isBusinessActivated(b: BusinessActivationInput): boolean {
  return b.trustLevel !== 'UNCLAIMED'
      && b.completenessScore >= 60
      && b.ownerUpdatedAfterClaim;
}

/**
 * A user is ACTIVATED on a meaningful action, not on arrival.
 * Opening a shopfront is interest; a contact or directions tap is intent.
 */
export const ACTIVATING_USER_EVENTS = [
  'contact_click', 'directions_click', 'business_open',
] as const;
export function isUserActivated(events: readonly string[]): boolean {
  const set = new Set(events);
  const acted = set.has('contact_click') || set.has('directions_click');
  const browsed = events.filter((e) => e === 'business_open').length >= 2;
  return acted || browsed;
}

/** Only ORGANIC traffic counts toward product and investor metrics. */
export type TrafficSegment = 'INTERNAL' | 'OPS' | 'BUSINESS' | 'TEST_USER' | 'ORGANIC' | 'BOT';
export const INVESTOR_ELIGIBLE_SEGMENTS: readonly TrafficSegment[] = ['ORGANIC'];
export const PRODUCT_ELIGIBLE_SEGMENTS: readonly TrafficSegment[] = ['ORGANIC', 'TEST_USER'];

export function countsForInvestorMetrics(s: TrafficSegment): boolean {
  return INVESTOR_ELIGIBLE_SEGMENTS.includes(s);
}

/** Pre-registered hypotheses (§21). Recorded before measurement, not after. */
export interface Hypothesis {
  id: string; statement: string; primaryMetric: string;
  successThreshold: string; failureThreshold: string; justification: string;
}
export const HYPOTHESES: readonly Hypothesis[] = [
  { id: 'H1', statement: 'Users can discover relevant local businesses through MARKYRA.',
    primaryMetric: 'search_to_business_open_rate',
    successThreshold: '≥ 35% of searches lead to a shopfront open',
    failureThreshold: '< 15%',
    justification: 'Below 15% the result set is not answering the query; the ranking or the data is wrong, not the framing.' },
  { id: 'H2', statement: 'Businesses receive measurable value from MARKYRA visibility.',
    primaryMetric: 'business_open_to_action_rate',
    successThreshold: '≥ 12% of shopfront opens produce a call, directions or website tap',
    failureThreshold: '< 5%',
    justification: 'The MVP Specification set 12% as the action-rate target; 5% is the level at which a merchant would not notice any effect.' },
  { id: 'H3', statement: 'Business owners understand and trust the identity/claim model.',
    primaryMetric: 'claim_completion_rate',
    successThreshold: '≥ 60% of started claims complete',
    failureThreshold: '< 30%',
    justification: 'The claim is three fields after an OTP; below 30% the flow or the trust proposition is failing, not the effort.' },
  { id: 'H4', statement: 'The map and discovery experience improve local business discovery.',
    primaryMetric: 'map_assisted_open_share',
    successThreshold: '≥ 30% of shopfront opens originate from a map pin or cluster',
    failureThreshold: '< 10%',
    justification: 'Below 10% the map is decoration and the product is a list with a picture attached.' },
  { id: 'H5', statement: 'A meaningful share of participating businesses would continue after the Pilot.',
    primaryMetric: 'willingness_to_continue',
    successThreshold: '≥ 50% of interviewed businesses say they would continue',
    failureThreshold: '< 25%',
    justification: 'Self-reported and weaker than behaviour; recorded as intent, never as revenue.' },
];

export type Verdict = 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'NOT_SUPPORTED' | 'INCONCLUSIVE';

/** A verdict requires a minimum sample. Below it, the answer is INCONCLUSIVE. */
export function verdictFor(
  observed: number | null, successAt: number, failureAt: number, sample: number, minSample = 30,
): Verdict {
  if (observed === null || sample < minSample) return 'INCONCLUSIVE';
  if (observed >= successAt) return 'SUPPORTED';
  if (observed < failureAt) return 'NOT_SUPPORTED';
  return 'PARTIALLY_SUPPORTED';
}

/** Conditions that PAUSE or STOP the pilot regardless of other results (§55). */
export const STOP_CONDITIONS = [
  'critical security incident',
  'systematic data corruption',
  'publication without a lawful basis',
  'repeated claim fraud',
  'sustained system instability',
  'inability to maintain data quality',
] as const;
