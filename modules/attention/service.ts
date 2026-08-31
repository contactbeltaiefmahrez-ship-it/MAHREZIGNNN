/** Public interface of the attention module. */
export { issueGrants, revokeGrant, type GrantSpec } from './repository/grant.ts';
export {
  buildViewport, capForOrganic, bucketFor, assertCompliant,
  ConstitutionalViolation, CAP_DENOMINATOR, MIN_ORGANIC_FOR_ANY_GRANT,
  type Candidate, type ViewportResult, type PlacedItem,
} from './domain/one-in-six.ts';
export { refreshGrantFlags } from './repository/flag.ts';
