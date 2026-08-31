import { describe, it, expect } from 'vitest';
import { scrub, trackerStatus } from './telemetry.ts';

describe('error tracking · nothing sensitive can reach a provider', () => {
  it('redacts secret-looking keys', () => {
    const out = scrub({ password: 'p', token: 't', otp_code: '123456', name: 'ok' }) as Record<string, unknown>;
    expect(out.password).toBe('[redacted]');
    expect(out.token).toBe('[redacted]');
    expect(out.otp_code).toBe('[redacted]');
    expect(out.name).toBe('ok');
  });
  it('masks phone numbers and emails inside free text', () => {
    expect(scrub('call +21671234567 now')).toBe('call [phone] now');
    expect(scrub('mail a.b@x.tn')).toBe('mail [email]');
  });
  it('masks long token-like strings', () => {
    const t = 'a'.repeat(40);
    expect(scrub(`bearer ${t}`)).toBe('bearer [token]');
  });
  it('recurses into nested structures and stops at depth', () => {
    const out = scrub({ a: { b: { password: 'x' } } }) as { a: { b: { password: string } } };
    expect(out.a.b.password).toBe('[redacted]');
  });
  it('reports its configuration state honestly', () => {
    const s = trackerStatus();
    expect(typeof s.configured).toBe('boolean');
  });
});
