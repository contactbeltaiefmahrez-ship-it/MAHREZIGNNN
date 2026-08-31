export {
  stageBatch, normalizeBatch, validateBatch, dedupeBatch,
  evaluateBatch, publishBatch, rollbackBatch, type RawRecord,
} from './repository/ingest.ts';
export {
  validateCandidate, qualityScore, batchAcceptable, isLocatable, downgrade,
  TUNISIA_BBOX, PILOT_BBOX, BATCH_THRESHOLDS,
} from './domain/validate.ts';
export { classify, autoMergeable, requiresOpsReview, type DupSignals, type DupVerdict } from './domain/dedupe.ts';
export {
  normalizePhoneTN, normalizeUrl, normalizeBusinessName,
  normalizeAddress, normalizeDelegationCode, isPlausibleBusinessPhone,
} from './domain/normalize-tn.ts';
export type { CoordConfidence, DupClass, StagingState } from './domain/types.ts';
export { qualityMetrics, freezeDataset, listDatasets, type QualityMetrics } from './repository/dataset.ts';
export { configSnapshot } from './repository/dataset.ts';
export { sourceOrigin } from './repository/dataset.ts';
