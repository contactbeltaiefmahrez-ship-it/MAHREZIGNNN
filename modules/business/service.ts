/** Public interface of the business module. Nothing else may be imported. */
export {
  countNotPublished, countNotVerified, businessesOwnedBy, qualityCounts, publishedForFreeze, realBusinessIds, originCounts,
  type BusinessQualityCounts,
} from './repository/state.ts';
export {
  findDuplicateCandidates, createImported, countClaimedInBatch, unpublishUnclaimedBatch,
  type DuplicateCandidate, type ImportedBusinessSpec,
} from './repository/import.ts';
export {
  queryViewport, countInViewport, queryClusters,
  CLUSTER_THRESHOLD, PAYLOAD_LIMIT,
  type Bbox, type ZoomTier, type ViewportRow, type ClusterRow,
} from './repository/viewport.ts';
