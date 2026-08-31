import { randomBytes, createHash } from 'node:crypto';
import { hashPassword } from '../domain/password.ts';
import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { AppError } from '../../../platform/errors.ts';

const SESSION_BYTES = 32;
const OWNER_ABSOLUTE_DAYS = 30;
const OWNER_IDLE_DAYS = 14;
const STAFF_ABSOLUTE_HOURS = 8;
const STAFF_IDLE_MINUTES = 30;

export const hashToken = (t: string): string =>
  createHash('sha256').update(t).digest('hex');

/**
 * Opaque server-side sessions, not JWT. Suspension must take effect
 * immediately (R4, R11); a stateless token cannot be revoked before expiry
 * without a revocation list, which is a session table with extra steps.
 */
export async function createSession(
  _actor: ActorContext, tx: Tx,
  principal: { ownerAccountId?: string; staffUserId?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(SESSION_BYTES).toString('base64url');
  const staff = Boolean(principal.staffUserId);
  const now = Date.now();
  const absolute = new Date(now + (staff ? STAFF_ABSOLUTE_HOURS * 36e5 : OWNER_ABSOLUTE_DAYS * 864e5));
  const idle = new Date(now + (staff ? STAFF_IDLE_MINUTES * 6e4 : OWNER_IDLE_DAYS * 864e5));
  await tx.query(
    `insert into session (token_hash, owner_account_id, staff_user_id, absolute_expiry, idle_expiry)
     values ($1,$2,$3,$4,$5)`,
    [hashToken(token), principal.ownerAccountId ?? null, principal.staffUserId ?? null, absolute, idle]);
  return { token, expiresAt: absolute };
}

export interface ResolvedSession {
  sessionId: string; ownerAccountId: string | null;
  staffUserId: string | null; role: 'OPS' | 'ADMIN' | null;
}

export async function resolveSession(
  _actor: ActorContext, tx: Tx, token: string,
): Promise<ResolvedSession | null> {
  if (!token) return null;
  const r = await tx.query<{
    id: string; owner_account_id: string | null; staff_user_id: string | null;
    role: 'OPS' | 'ADMIN' | null; disabled_at: Date | null;
  }>(
    `select s.id, s.owner_account_id, s.staff_user_id, u.role, u.disabled_at
       from session s left join staff_user u on u.id = s.staff_user_id
      where s.token_hash = $1 and s.revoked_at is null
        and s.absolute_expiry > now()
        and (s.idle_expiry is null or s.idle_expiry > now())`,
    [hashToken(token)]);
  const row = r.rows[0];
  if (!row) return null;
  if (row.staff_user_id && row.disabled_at) return null;   // disabled staff = no session
  // sliding idle window
  await tx.query(
    `update session set last_seen_at = now(),
            idle_expiry = now() + (case when staff_user_id is null
                                        then interval '14 days' else interval '30 minutes' end)
      where id = $1`, [row.id]);
  return {
    sessionId: row.id, ownerAccountId: row.owner_account_id,
    staffUserId: row.staff_user_id, role: row.role,
  };
}

export async function revokeSession(_actor: ActorContext, tx: Tx, token: string): Promise<void> {
  await tx.query(`update session set revoked_at=now() where token_hash=$1`, [hashToken(token)]);
}

export async function revokeAllForOwner(_actor: ActorContext, tx: Tx, ownerId: string): Promise<void> {
  await tx.query(
    `update session set revoked_at=now() where owner_account_id=$1 and revoked_at is null`, [ownerId]);
}

/** Transparent upgrade of a legacy hash after a successful login. */
export async function upgradePasswordHash(
  _actor: ActorContext, tx: Tx, staffUserId: string, plain: string,
): Promise<void> {
  await tx.query(`update staff_user set password_hash=$2, updated_at=now() where id=$1`,
    [staffUserId, await hashPassword(plain)]);
}

/** DB-backed so it survives a restart and cannot be bypassed via another node. */
export async function consumeRateLimit(
  _actor: ActorContext, tx: Tx, key: string, max: number, windowMinutes: number,
): Promise<void> {
  const r = await tx.query<{ count: number }>(
    `insert into otp_rate (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when otp_rate.window_start < now() - ($2 || ' minutes')::interval
                    then 1 else otp_rate.count + 1 end,
       window_start = case when otp_rate.window_start < now() - ($2 || ' minutes')::interval
                          then now() else otp_rate.window_start end
     returning count`,
    [key, String(windowMinutes)]);
  if ((r.rows[0]?.count ?? 0) > max) {
    throw new AppError('RATE_LIMITED', 'Too many attempts. Try again later.', { key });
  }
}
