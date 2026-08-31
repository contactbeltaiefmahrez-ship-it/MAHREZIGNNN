import { describe, it, expect } from 'vitest';
import { nextClaimState, evaluateOtpAttempt, MAX_OTP_ATTEMPTS } from '../service.ts';

describe('claim state machine', () => {
  it('walks the OTP path', () => {
    let s = nextClaimState('UNCLAIMED', 'initiate');
    s = nextClaimState(s, 'otp_verify_ok');
    s = nextClaimState(s, 'profile_complete');
    expect(s).toBe('CLAIMED');
  });
  it('walks the no-access path through ops review', () => {
    let s = nextClaimState('UNCLAIMED', 'initiate');
    s = nextClaimState(s, 'no_access_submit');
    expect(s).toBe('OPS_REVIEW');
    expect(nextClaimState(s, 'ops_reject')).toBe('CLAIM_REJECTED');
    expect(nextClaimState(s, 'ops_approve')).toBe('OTP_VERIFIED');
  });
  it('never reaches CLAIMED without completing the minimum profile', () => {
    expect(() => nextClaimState('OTP_VERIFIED', 'otp_verify_ok')).toThrow();
    expect(() => nextClaimState('CLAIM_PENDING', 'profile_complete')).toThrow();
  });
  it('locks after three failed OTP attempts', () => {
    expect(evaluateOtpAttempt(0, false)).toEqual({ ok: false, locked: false, attemptsRemaining: 2 });
    expect(evaluateOtpAttempt(1, false)).toEqual({ ok: false, locked: false, attemptsRemaining: 1 });
    expect(evaluateOtpAttempt(2, false)).toEqual({ ok: false, locked: true,  attemptsRemaining: 0 });
    expect(MAX_OTP_ATTEMPTS).toBe(3);
  });
});
