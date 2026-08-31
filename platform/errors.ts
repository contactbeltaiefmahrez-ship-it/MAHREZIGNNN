/** Stable, locale-independent error codes. Messages are a frontend concern. */
export type ErrorCode =
  | 'VALIDATION_FAILED' | 'INVALID_PHONE_FORMAT' | 'COORDINATES_OUTSIDE_PILOT'
  | 'SESSION_REQUIRED' | 'SESSION_EXPIRED' | 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_LOCKED'
  | 'RESOURCE_NOT_FOUND' | 'INSUFFICIENT_ROLE' | 'STEP_UP_REQUIRED'
  | 'INVALID_STATE_TRANSITION' | 'CLAIM_ALREADY_IN_PROGRESS' | 'BUSINESS_ALREADY_CLAIMED'
  | 'ORDER_ALREADY_DECIDED' | 'CYCLE_NOT_LOCKED' | 'SEAT_TIER_FULL'
  | 'DUPLICATE_PAYMENT_REFERENCE' | 'NOT_ELIGIBLE_FOR_SEAT'
  | 'VERIFICATION_REQUIRED_FOR_TIER' | 'PROFILE_INCOMPLETE'
  | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'SERVICE_DEGRADED'
  | 'CONSTITUTIONAL_VIOLATION';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400, INVALID_PHONE_FORMAT: 400, COORDINATES_OUTSIDE_PILOT: 400,
  SESSION_REQUIRED: 401, SESSION_EXPIRED: 401, OTP_INVALID: 401, OTP_EXPIRED: 401, OTP_LOCKED: 429,
  // A non-owner gets 404, never 403: a 403 confirms the resource exists.
  RESOURCE_NOT_FOUND: 404, INSUFFICIENT_ROLE: 403, STEP_UP_REQUIRED: 403,
  INVALID_STATE_TRANSITION: 409, CLAIM_ALREADY_IN_PROGRESS: 409, BUSINESS_ALREADY_CLAIMED: 409,
  ORDER_ALREADY_DECIDED: 409, CYCLE_NOT_LOCKED: 409, SEAT_TIER_FULL: 409,
  DUPLICATE_PAYMENT_REFERENCE: 409, NOT_ELIGIBLE_FOR_SEAT: 422,
  VERIFICATION_REQUIRED_FOR_TIER: 422, PROFILE_INCOMPLETE: 422,
  RATE_LIMITED: 429, INTERNAL_ERROR: 500, SERVICE_DEGRADED: 503,
  CONSTITUTIONAL_VIOLATION: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;
  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
    this.retryable = code === 'SERVICE_DEGRADED';
  }
}

export const notFound = (): AppError =>
  new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
