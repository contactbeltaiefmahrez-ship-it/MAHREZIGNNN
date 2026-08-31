import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { withTx, getPool } from '../../../platform/db.ts';
import { AppError } from '../../../platform/errors.ts';
import { actorFor } from '../context.ts';
import { createSession, consumeRateLimit } from '../../../modules/identity/service.ts';
import { sendSms, lastDevMessage } from '../../../modules/notification/service.ts';
import { writeAudit } from '../../../modules/audit/service.ts';
import { evaluateOtpAttempt, MAX_OTP_ATTEMPTS, OTP_TTL_MINUTES } from '../../../modules/claim/service.ts';
import { record } from '../../../modules/analytics/service.ts';

const hash = (v: string): string => createHash('sha256').update(v).digest('hex');
const eq = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function setSessionCookie(reply: FastifyReply, token: string, maxAgeSec: number): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  reply.header('set-cookie',
    `mk_sess=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`);
}

export default async function claimRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Start a claim. The body carries a business id and NOTHING ELSE — the OTP
   * destination is `business.phone_e164`, read server-side. Accepting a phone
   * number here would silently convert the strong claim path into the weak one
   * (R7), so the schema has no phone field and a test asserts that.
   */
  app.post('/v1/claim', async (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ('phone' in body || 'phone_e164' in body) {
      throw new AppError('VALIDATION_FAILED', 'phone is never accepted here');
    }
    const businessId = String(body.business_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
      throw new AppError('VALIDATION_FAILED', 'business_id required');
    }
    const actor = actorFor(req);
    return withTx(async (tx) => {
      await consumeRateLimit(actor, tx, `claim:${req.ip}`, 10, 60);
      const b = await tx.query<{ id: string; phone_e164: string | null; trust_level: string; state: string }>(
        `select id, phone_e164, trust_level::text, state::text from business
          where id=$1 and deleted_at is null for update`, [businessId]);
      const biz = b.rows[0];
      // Uniform response and timing whether or not the business exists (T22).
      if (!biz || biz.state !== 'PUBLISHED') {
        throw new AppError('RESOURCE_NOT_FOUND', 'Resource not found');
      }
      if (biz.trust_level !== 'UNCLAIMED') {
        // never reveals who owns it
        throw new AppError('BUSINESS_ALREADY_CLAIMED', 'This business is already claimed');
      }
      if (!biz.phone_e164) {
        throw new AppError('VALIDATION_FAILED', 'no listed number; use the manual path');
      }
      const existing = await tx.query(
        `select id from claim where business_id=$1
          and state in ('CLAIM_PENDING','OTP_VERIFIED','OPS_REVIEW','MINIMUM_PROFILE')`,
        [businessId]);
      if (existing.rowCount) throw new AppError('CLAIM_ALREADY_IN_PROGRESS', 'A claim is already in progress');

      const c = await tx.query<{ id: string }>(
        `insert into claim (business_id, claimant_phone, method, state)
         values ($1,$2,'OTP','CLAIM_PENDING') returning id`,
        [businessId, biz.phone_e164]);

      await consumeRateLimit(actor, tx, `otp:${biz.phone_e164}`, 3, 60);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.query(
        `insert into otp_challenge (business_id, code_hash, expires_at)
         values ($1,$2, now() + ($3 || ' minutes')::interval)`,
        [businessId, hash(code), String(OTP_TTL_MINUTES)]);
      await sendSms(actor, tx, biz.phone_e164, 'claim_otp',
        `MARKYRA: رمز التحقق ${code}. صالح ${OTP_TTL_MINUTES} دقائق.`);
      await writeAudit(actor, tx, {
        action: 'claim.initiated', targetTable: 'claim', targetId: c.rows[0]!.id,
        after: { businessId },
      });
      await record(actor, tx, 'claim_started', { businessId });
      // The destination is masked; the client never learns the full number.
      const masked = biz.phone_e164.replace(/^(\+\d{3})\d+(\d{3})$/, '$1 ••• $2');
      return { claim_id: c.rows[0]!.id, destination_masked: masked, expires_in_minutes: OTP_TTL_MINUTES };
    });
  });

  app.post('/v1/claim/:id/verify', async (req, reply) => {
    const { id } = req.params as { id: string };
    const code = String(((req.body ?? {}) as Record<string, unknown>).code ?? '');
    if (!/^\d{6}$/.test(code)) throw new AppError('OTP_INVALID', 'Invalid code');
    const actor = actorFor(req);
    const out = await withTx(async (tx) => {
      await consumeRateLimit(actor, tx, `otpverify:${req.ip}`, 20, 60);
      const c = await tx.query<{ id: string; business_id: string; state: string; claimant_phone: string }>(
        `select id, business_id, state::text, claimant_phone from claim
          where id=$1 for update`, [id]);
      const claim = c.rows[0];
      if (!claim || claim.state !== 'CLAIM_PENDING') {
        throw new AppError('INVALID_STATE_TRANSITION', 'No claim awaiting verification');
      }
      const ch = await tx.query<{ id: string; code_hash: string; attempts: number }>(
        `select id, code_hash, attempts from otp_challenge
          where business_id=$1 and consumed_at is null and expires_at > now()
          order by created_at desc limit 1 for update`, [claim.business_id]);
      const challenge = ch.rows[0];
      if (!challenge) throw new AppError('OTP_EXPIRED', 'Code expired. Request a new one.');

      const ok = eq(challenge.code_hash, hash(code));
      const result = evaluateOtpAttempt(challenge.attempts, ok);
      if (!ok) {
        // The increment MUST survive. Throwing here would roll back the very
        // counter that limits the attacker, handing them unlimited attempts —
        // so the failure is recorded, committed, and reported to the caller
        // as a value that the route turns into an error AFTER commit.
        await tx.query(`update otp_challenge set attempts=attempts+1 where id=$1`, [challenge.id]);
        if (result.locked) {
          await tx.query(`update otp_challenge set consumed_at=now() where id=$1`, [challenge.id]);
        }
        await writeAudit(actor, tx, {
          action: 'claim.otp_failed', targetTable: 'claim', targetId: claim.id,
          reason: result.locked ? 'locked_out' : 'wrong_code' });
        return { failed: true as const, locked: result.locked,
                 attemptsRemaining: result.attemptsRemaining };
      }

      // consume atomically: a replayed request finds zero rows
      const consumed = await tx.query(
        `update otp_challenge set consumed_at=now()
          where id=$1 and consumed_at is null returning id`, [challenge.id]);
      if (consumed.rowCount === 0) throw new AppError('OTP_INVALID', 'Code already used');

      const acc = await tx.query<{ id: string }>(
        `insert into owner_account (phone_e164) values ($1)
         on conflict (phone_e164) do update set updated_at=now() returning id`,
        [claim.claimant_phone]);
      const ownerId = acc.rows[0]!.id;
      await tx.query(`update claim set state='OTP_VERIFIED', updated_at=now() where id=$1`, [claim.id]);
      const s = await createSession(actor, tx, { ownerAccountId: ownerId });
      await writeAudit(actor, tx, {
        action: 'claim.otp_verified', targetTable: 'claim', targetId: claim.id,
        after: { ownerAccountId: ownerId } });
      return { failed: false as const, token: s.token,
               claimId: claim.id, businessId: claim.business_id };
    });
    if (out.failed) {
      if (out.locked) {
        throw new AppError('OTP_LOCKED', 'Too many attempts. Try again in 30 minutes.',
          { attemptsRemaining: 0 });
      }
      throw new AppError('OTP_INVALID', 'Incorrect code',
        { attemptsRemaining: out.attemptsRemaining, maxAttempts: MAX_OTP_ATTEMPTS });
    }
    setSessionCookie(reply, out.token, 30 * 864e2);
    return { claim_id: out.claimId, business_id: out.businessId, next: 'minimum_profile' };
  });

  /**
   * Completing the minimum profile is what makes a claim CLAIMED (R8).
   * Note what does NOT happen here: the business does not become VERIFIED.
   * Claiming is not verification (Phase 07 §34).
   */
  app.post('/v1/claim/:id/complete', async (req) => {
    const { id } = req.params as { id: string };
    const actor = actorFor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    return withTx(async (tx) => {
      const c = await tx.query<{ id: string; business_id: string; state: string; claimant_phone: string }>(
        `select id, business_id, state::text, claimant_phone from claim where id=$1 for update`, [id]);
      const claim = c.rows[0];
      if (!claim || claim.state !== 'OTP_VERIFIED') {
        throw new AppError('INVALID_STATE_TRANSITION', 'Claim is not ready to complete');
      }
      if (!body.category_confirmed) {
        throw new AppError('PROFILE_INCOMPLETE', 'category must be confirmed');
      }
      const acc = await tx.query<{ id: string }>(
        `select id from owner_account where phone_e164=$1`, [claim.claimant_phone]);
      await tx.query(
        `update business set owner_account_id=$2, trust_level='CLAIMED',
                last_owner_update_at=now(), updated_at=now()
          where id=$1`, [claim.business_id, acc.rows[0]!.id]);
      await tx.query(`update claim set state='CLAIMED', updated_at=now() where id=$1`, [claim.id]);
      await writeAudit(actor, tx, {
        action: 'claim.completed', targetTable: 'business', targetId: claim.business_id,
        before: { trust_level: 'UNCLAIMED' }, after: { trust_level: 'CLAIMED' } });
      await record(actor, tx, 'claim_completed', { businessId: claim.business_id });
      return { business_id: claim.business_id, trust: 'CLAIMED', verified: false };
    });
  });

  /** Development only: read the OTP the dev provider logged instead of sending. */
  app.get('/v1/dev/last-otp', async (req) => {
    if (process.env.NODE_ENV === 'production') throw new AppError('RESOURCE_NOT_FOUND', 'Not found');
    const to = String((req.query as Record<string, string>).to ?? '');
    const msg = await withTx((tx) => lastDevMessage(actorFor(req), tx, to));
    return { message: msg, note: 'DEVELOPMENT ONLY — no SMS was sent' };
  });

  app.post('/v1/logout', async (req, reply) => {
    const m = /mk_sess=([^;]+)/.exec(req.headers.cookie ?? '');
    if (m) {
      const { revokeSession } = await import('../../../modules/identity/service.ts');
      await withTx((tx) => revokeSession(actorFor(req), tx, m[1]!));
    }
    reply.header('set-cookie', 'mk_sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return { ok: true };
  });

  void getPool;
}
