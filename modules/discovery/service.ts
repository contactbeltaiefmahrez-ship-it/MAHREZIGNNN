/** Public interface of the discovery module. */
export {
  storedScore, attentionWeight, finalScore, explain, freshnessTerm,
  publicTrustLevel, WEIGHTS, RANKING_VERSION,
  type TrustLevel, type StoredScoreInput, type TrustInput,
} from './domain/ranking.ts';
