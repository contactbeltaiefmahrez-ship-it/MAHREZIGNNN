import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Development provider. It does NOT send anything and never claims to — it
 * records the message so a developer can read the OTP from the outbox. The
 * state is DEV_LOGGED, distinct from SENT, so no report can mistake one for
 * the other.
 */
export const devProvider: SmsProvider = {
  name: 'dev-outbox',
  async send() { return { ok: true }; },
};

/**
 * Production provider. EXTERNALLY CONFIGURATION-DEPENDENT: no Tunisian SMS
 * gateway is connected. It refuses loudly rather than silently pretending.
 */
export const productionProvider: SmsProvider = {
  name: 'tn-sms-gateway',
  async send() {
    return { ok: false, error: 'SMS_PROVIDER_NOT_CONFIGURED' };
  },
};

export function resolveProvider(): SmsProvider {
  return process.env.SMS_PROVIDER === 'production' ? productionProvider : devProvider;
}

export async function sendSms(
  _actor: ActorContext, tx: Tx, to: string, template: string, body: string,
): Promise<{ delivered: boolean; provider: string }> {
  const p = resolveProvider();
  const res = await p.send(to, body);
  const dev = p.name === 'dev-outbox';
  await tx.query(
    `insert into sms_outbox (provider,recipient,template,body_preview,state,error)
     values ($1,$2,$3,$4,$5,$6)`,
    [p.name, to, template, body.slice(0, 160),
     dev ? 'DEV_LOGGED' : res.ok ? 'SENT' : 'FAILED', res.error ?? null]);
  return { delivered: res.ok && !dev, provider: p.name };
}

/** Reads the last dev-logged code. Available ONLY outside production. */
export async function lastDevMessage(
  _actor: ActorContext, tx: Tx, recipient: string,
): Promise<string | null> {
  if (process.env.NODE_ENV === 'production') return null;
  const r = await tx.query<{ body_preview: string }>(
    `select body_preview from sms_outbox
      where recipient=$1 and state='DEV_LOGGED' order by created_at desc limit 1`,
    [recipient]);
  return r.rows[0]?.body_preview ?? null;
}
