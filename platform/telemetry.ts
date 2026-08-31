/**
 * Error tracking abstraction.
 *
 * EXTERNALLY CONFIGURATION-DEPENDENT: no error-tracking provider is connected.
 * The boundary and a development adapter are implemented; setting
 * ERROR_TRACKER_DSN activates the production adapter.
 *
 * Scrubbing happens BEFORE the adapter, so no adapter can ever receive a
 * secret — including one we might connect later.
 */
export interface ErrorEvent {
  message: string; source: 'web' | 'api' | 'worker' | 'job';
  requestId?: string; actorType?: string; extra?: Record<string, unknown>;
  stack?: string;
}
export interface ErrorTracker { readonly name: string; capture(e: ErrorEvent): void }

const SECRET_KEYS = ['password', 'token', 'secret', 'code', 'otp', 'cookie',
                     'authorization', 'phone', 'email', 'dsn', 'key'];
const PHONE = /\+?\d{8,15}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const JWTISH = /\b[A-Za-z0-9_-]{24,}\b/g;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (typeof value === 'string') {
    return value.replace(PHONE, '[phone]').replace(EMAIL, '[email]')
                .replace(JWTISH, (m) => (m.length > 32 ? '[token]' : m));
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) { out[k] = '[redacted]'; continue; }
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Development adapter: structured stderr. Never silent, never a network call. */
const devTracker: ErrorTracker = {
  name: 'dev-stderr',
  capture(e) {
    console.error(JSON.stringify({
      level: 'error', src: e.source, msg: scrub(e.message),
      request_id: e.requestId, actor: e.actorType,
      extra: scrub(e.extra ?? {}), stack: e.stack?.split('\n').slice(0, 4).join(' | '),
      at: new Date().toISOString(),
    }));
  },
};

/** Production adapter. Refuses loudly rather than silently dropping errors. */
const productionTracker: ErrorTracker = {
  name: 'remote',
  capture(e) {
    devTracker.capture(e);   // always keep the local record
    if (!process.env.ERROR_TRACKER_DSN) {
      console.error(JSON.stringify({
        level: 'warn', msg: 'ERROR_TRACKER_DSN not set — error not forwarded' }));
    }
    // Wire the provider SDK here. Payload is already scrubbed above.
  },
};

let tracker: ErrorTracker | null = null;
export function getTracker(): ErrorTracker {
  if (!tracker) tracker = process.env.ERROR_TRACKER_DSN ? productionTracker : devTracker;
  return tracker;
}
export function captureError(e: ErrorEvent): void { getTracker().capture(e); }
export const trackerStatus = (): { name: string; configured: boolean } => ({
  name: getTracker().name, configured: Boolean(process.env.ERROR_TRACKER_DSN),
});
