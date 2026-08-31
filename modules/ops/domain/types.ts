export type CoordConfidence = 'VERIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type DupClass = 'CONFIRMED' | 'PROBABLE' | 'POSSIBLE' | 'DISTINCT';
export type StagingState =
  | 'RAW' | 'NORMALIZED' | 'VALIDATED' | 'REJECTED' | 'DUPLICATE' | 'APPROVED' | 'PUBLISHED';
