/** Claim state machine (Architecture 11.1). */
import { AppError } from '../../../platform/errors.ts';

export type ClaimState =
  | 'UNCLAIMED' | 'CLAIM_PENDING' | 'OTP_VERIFIED' | 'OPS_REVIEW'
  | 'MINIMUM_PROFILE' | 'CLAIMED' | 'CLAIM_REJECTED';

export type ClaimEvent =
  | 'initiate' | 'otp_verify_ok' | 'otp_verify_fail' | 'no_access_submit'
  | 'ops_approve' | 'ops_reject' | 'profile_complete' | 'ops_revoke';

const T: ReadonlyArray<{ from: ClaimState; event: ClaimEvent; to: ClaimState }> = [
  { from: 'UNCLAIMED',      event: 'initiate',         to: 'CLAIM_PENDING' },
  { from: 'CLAIM_PENDING',  event: 'otp_verify_ok',    to: 'OTP_VERIFIED' },
  { from: 'CLAIM_PENDING',  event: 'otp_verify_fail',  to: 'CLAIM_PENDING' },
  { from: 'CLAIM_PENDING',  event: 'no_access_submit', to: 'OPS_REVIEW' },
  { from: 'OPS_REVIEW',     event: 'ops_approve',      to: 'OTP_VERIFIED' },
  { from: 'OPS_REVIEW',     event: 'ops_reject',       to: 'CLAIM_REJECTED' },
  { from: 'OTP_VERIFIED',   event: 'profile_complete', to: 'CLAIMED' },
  { from: 'CLAIMED',        event: 'ops_revoke',       to: 'UNCLAIMED' },
];

export function nextClaimState(from: ClaimState, event: ClaimEvent): ClaimState {
  const t = T.find((x) => x.from === from && x.event === event);
  if (!t) throw new AppError('INVALID_STATE_TRANSITION', `claim cannot ${event} from ${from}`, { from, event });
  return t.to;
}

export const MAX_OTP_ATTEMPTS = 3;
export const OTP_LOCKOUT_MINUTES = 30;
export const OTP_TTL_MINUTES = 5;

export interface OtpAttemptResult { ok: boolean; locked: boolean; attemptsRemaining: number }

export function evaluateOtpAttempt(priorAttempts: number, correct: boolean): OtpAttemptResult {
  const attempts = priorAttempts + 1;
  if (correct) return { ok: true, locked: false, attemptsRemaining: MAX_OTP_ATTEMPTS - attempts };
  const locked = attempts >= MAX_OTP_ATTEMPTS;
  return { ok: false, locked, attemptsRemaining: Math.max(0, MAX_OTP_ATTEMPTS - attempts) };
}
