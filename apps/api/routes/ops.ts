import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTx } from '../../../platform/db.ts';
import { AppError } from '../../../platform/errors.ts';
import { staff, type ActorContext } from '../../../platform/actor.ts';
import { actorFor } from '../context.ts';
import {
  resolveSession, createSession, verifyPassword, upgradePasswordHash, consumeRateLimit,
} from '../../../modules/identity/service.ts';
import { writeAudit, verifyChain } from '../../../modules/audit/service.ts';
import { qualityMetrics, freezeDataset, listDatasets } from '../../../modules/ops/service.ts';

const cookie = (req: FastifyRequest): string =>
  /mk_ops=([^;]+)/.exec(req.headers.cookie ?? '')?.[1] ?? '';

/**
 * Server-side role enforcement. Hiding a button is presentation, never
 * security — every ops route resolves the session and checks the role here.
 */
async function requireStaff(
  req: FastifyRequest, minRole: 'OPS' | 'ADMIN' = 'OPS',
): Promise<ActorContext> {
  const base = actorFor(req);
  const token = cookie(req);
  if (!token) throw new AppError('SESSION_REQUIRED', 'Sign in required');
  const s = await withTx((tx) => resolveSession(base, tx, token));
  if (!s?.staffUserId || !s.role) throw new AppError('SESSION_EXPIRED', 'Session expired');
  if (minRole === 'ADMIN' && s.role !== 'ADMIN') {
    throw new AppError('INSUFFICIENT_ROLE', 'Admin role required');
  }
  return staff(s.role, s.staffUserId, s.sessionId, base.requestId);
}

export default async function opsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/ops/login', async (req, reply) => {
    const b = (req.body ?? {}) as { email?: string; password?: string };
    const base = actorFor(req);
    const out = await withTx(async (tx) => {
      await consumeRateLimit(base, tx, `opslogin:${req.ip}`, 10, 15);
      const r = await tx.query<{ id: string; password_hash: string; role: 'OPS' | 'ADMIN'; disabled_at: Date | null }>(
        `select id, password_hash, role, disabled_at from staff_user where email=$1`,
        [String(b.email ?? '')]);
      const u = r.rows[0];
      // Identical failure for unknown user and wrong password (anti-enumeration).
      const check = u ? await verifyPassword(String(b.password ?? ''), u.password_hash)
                      : { ok: false, needsRehash: false };
      if (!u || u.disabled_at || !check.ok) {
        await writeAudit(base, tx, {
          action: 'ops.login_failed', targetTable: 'staff_user',
          targetId: '00000000-0000-0000-0000-000000000000', reason: 'invalid_credentials' });
        throw new AppError('SESSION_REQUIRED', 'Invalid credentials');
      }
      // Legacy scrypt hashes are upgraded to Argon2id on successful login.
      if (check.needsRehash) {
        await upgradePasswordHash(base, tx, u.id, String(b.password ?? ''));
      }
      const s = await createSession(base, tx, { staffUserId: u.id });
      await writeAudit(staff(u.role, u.id, s.token.slice(0, 8), base.requestId), tx, {
        action: 'ops.login', targetTable: 'staff_user', targetId: u.id });
      return { token: s.token, role: u.role };
    });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    reply.header('set-cookie',
      `mk_ops=${out.token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=28800`);
    return { role: out.role };
  });

  app.get('/ops/me', async (req) => {
    const a = await requireStaff(req);
    return { role: a.kind, actorId: a.actorId };
  });

  app.get('/ops/businesses', async (req) => {
    const a = await requireStaff(req);
    const q = (req.query as Record<string, string>);
    const rows = await withTx((tx) => tx.query(
      `select b.id, b.name_ar, b.name_fr, b.trust_level::text as trust,
              b.state::text as state, b.delegation_code,
              b.coordinate_confidence::text as coord, b.quality_score,
              b.source_code, ST_X(b.location) as lon, ST_Y(b.location) as lat
         from business b
        where b.deleted_at is null
          and ($1 = '' or b.name_normalized like $1 || '%')
          and ($2 = '' or b.trust_level::text = $2)
        order by b.created_at desc limit 50`,
      [q.q ?? '', q.trust ?? '']));
    void a;
    return { businesses: rows.rows };
  });

  app.get('/ops/queues', async (req) => {
    await requireStaff(req);
    const r = await withTx((tx) => tx.query(
      `select 'claims' as queue, count(*)::int n from claim where state='OPS_REVIEW'
       union all select 'verifications', count(*)::int from verification where state='VERIFICATION_PENDING'
       union all select 'duplicates', count(*)::int from duplicate_review where decision is null
       union all select 'reports', count(*)::int from report where state='OPEN'
       union all select 'offers', count(*)::int from offer where state='PENDING_REVIEW'`));
    return { queues: r.rows };
  });

  /** Coordinate correction — a real ops workflow, audited, with confidence. */
  app.post('/ops/businesses/:id/location', async (req) => {
    const a = await requireStaff(req);
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { lon?: number; lat?: number; confidence?: string; reason?: string };
    if (typeof b.lon !== 'number' || typeof b.lat !== 'number') {
      throw new AppError('VALIDATION_FAILED', 'lon and lat required');
    }
    if (!b.reason) throw new AppError('VALIDATION_FAILED', 'reason required');
    const conf = b.confidence ?? 'VERIFIED';
    if (!['VERIFIED', 'HIGH', 'MEDIUM'].includes(conf)) {
      throw new AppError('VALIDATION_FAILED', 'a published business needs MEDIUM or better');
    }
    return withTx(async (tx) => {
      const before = await tx.query(
        `select ST_X(location) lon, ST_Y(location) lat,
                coordinate_confidence::text conf from business where id=$1`, [id]);
      if (before.rowCount === 0) throw new AppError('RESOURCE_NOT_FOUND', 'Not found');
      await tx.query(
        `update business set location=ST_SetSRID(ST_MakePoint($2,$3),4326),
                coordinate_confidence=$4::coord_confidence, updated_at=now()
          where id=$1`, [id, b.lon, b.lat, conf]);
      await writeAudit(a, tx, {
        action: 'ops.location_corrected', targetTable: 'business', targetId: id,
        before: before.rows[0], after: { lon: b.lon, lat: b.lat, conf }, reason: b.reason });
      return { ok: true };
    });
  });

  /** Verification decision. Approving is the ONLY route to VERIFIED. */
  app.post('/ops/verifications/:id/decision', async (req) => {
    const a = await requireStaff(req);
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { decision?: string; reason?: string };
    if (!['APPROVE', 'REJECT'].includes(String(b.decision))) {
      throw new AppError('VALIDATION_FAILED', 'decision must be APPROVE or REJECT');
    }
    if (b.decision === 'REJECT' && !b.reason) {
      throw new AppError('VALIDATION_FAILED', 'a rejection must carry a reason');
    }
    return withTx(async (tx) => {
      const v = await tx.query<{ id: string; business_id: string; state: string }>(
        `select id, business_id, state::text from verification where id=$1 for update`, [id]);
      const ver = v.rows[0];
      if (!ver || ver.state !== 'VERIFICATION_PENDING') {
        throw new AppError('INVALID_STATE_TRANSITION', 'Verification is not pending');
      }
      if (b.decision === 'APPROVE') {
        await tx.query(
          `update verification set state='VERIFIED', decided_by=$2, decided_at=now() where id=$1`,
          [id, a.actorId]);
        await tx.query(`update business set trust_level='VERIFIED', updated_at=now() where id=$1`,
          [ver.business_id]);
      } else {
        await tx.query(
          `update verification set state='REJECTED', reason_code=$3, decided_by=$2, decided_at=now()
            where id=$1`, [id, a.actorId, b.reason]);
      }
      await writeAudit(a, tx, {
        action: `ops.verification_${String(b.decision).toLowerCase()}`,
        targetTable: 'business', targetId: ver.business_id, reason: b.reason });
      return { ok: true, business_id: ver.business_id, decision: b.decision };
    });
  });

  app.post('/ops/duplicates/:id/decision', async (req) => {
    const a = await requireStaff(req);
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as { decision?: string };
    if (!['MERGE', 'KEEP_BOTH', 'DISCARD_IMPORT'].includes(String(b.decision))) {
      throw new AppError('VALIDATION_FAILED', 'invalid decision');
    }
    return withTx(async (tx) => {
      const r = await tx.query(
        `update duplicate_review set decision=$2, decided_by=$3, decided_at=now()
          where id=$1 and decision is null returning staging_id, business_id`,
        [id, b.decision, a.actorId]);
      if (r.rowCount === 0) throw new AppError('ORDER_ALREADY_DECIDED', 'Already decided');
      await writeAudit(a, tx, {
        action: 'ops.duplicate_decision', targetTable: 'duplicate_review',
        targetId: id, after: { decision: b.decision } });
      return { ok: true };
    });
  });

  app.get('/ops/data-quality', async (req) => {
    const a = await requireStaff(req);
    return { metrics: await withTx((tx) => qualityMetrics(a, tx)),
             note: 'operational metrics — includes development fixtures' };
  });

  app.get('/ops/datasets', async (req) => {
    const a = await requireStaff(req);
    return { datasets: await withTx((tx) => listDatasets(a, tx)) };
  });

  app.post('/ops/datasets', async (req) => {
    const a = await requireStaff(req, 'ADMIN');
    const b = (req.body ?? {}) as { label?: string; notes?: string };
    if (!b.label) throw new AppError('VALIDATION_FAILED', 'label required');
    const out = await withTx(async (tx) => {
      const r = await freezeDataset(a, tx, b.label!, b.notes);
      await writeAudit(a, tx, { action: 'ops.dataset_frozen',
        targetTable: 'pilot_dataset_version', targetId: r.versionId,
        after: { label: b.label, count: r.count } });
      return r;
    });
    return out;
  });

  app.get('/ops/audit', async (req) => {
    const a = await requireStaff(req, 'ADMIN');   // audit is Admin-only
    const r = await withTx((tx) => tx.query(
      `select id, actor_type::text, actor_id, action, target_table, target_id,
              reason, created_at
         from audit_entry order by id desc limit 100`));
    void a;
    return { entries: r.rows };
  });

  app.get('/ops/audit/verify', async (req) => {
    const a = await requireStaff(req, 'ADMIN');
    return withTx((tx) => verifyChain(a, tx));
  });

  app.post('/ops/logout', async (req, reply) => {
    const token = cookie(req);
    if (token) {
      const { revokeSession } = await import('../../../modules/identity/service.ts');
      await withTx((tx) => revokeSession(actorFor(req), tx, token));
    }
    reply.header('set-cookie', 'mk_ops=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    return { ok: true };
  });
}
