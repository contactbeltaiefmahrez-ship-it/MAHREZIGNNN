/** Public interface of the claim module. */
export {
  nextClaimState, evaluateOtpAttempt, MAX_OTP_ATTEMPTS, OTP_LOCKOUT_MINUTES, OTP_TTL_MINUTES,
  type ClaimState, type ClaimEvent, type OtpAttemptResult,
} from './domain/claim.ts';
