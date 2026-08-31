import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../platform/errors.ts';
import { getPool, closePool } from '../../platform/db.ts';
import { captureError, trackerStatus } from '../../platform/telemetry.ts';
import discoveryRoutes from './routes/discovery.ts';
import businessRoutes from './routes/business.ts';
import claimRoutes from './routes/claim.ts';
import opsRoutes from './routes/ops.ts';

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
    trustProxy: true,
  });

  await app.register(cors, {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });
  // Tunisian mobile networks are heavily CGNAT'd, so IP is a poor key on its
  // own; the device id refines it where present.
  await app.register(rateLimit, {
    max: 300, timeWindow: '1 minute',
    keyGenerator: (req) => `${req.ip}:${req.headers['x-device-id'] ?? ''}`,
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    return undefined;
  });

  /** Stable machine codes; messages are never localised server-side. */
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({
        error: { code: err.code, message: err.message, details: err.details,
                 request_id: req.id, retryable: err.retryable },
      });
    }
    if ((err as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests', request_id: req.id, retryable: true } });
    }
    // Never leak a stack trace or a database error to a client.
    const e = err as Error;
    captureError({ message: e.message ?? 'unknown', source: 'api', requestId: String(req.id),
                   stack: e.stack, extra: { url: req.url, method: req.method } });
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side',
               request_id: req.id, retryable: true } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({
      error: { code: 'RESOURCE_NOT_FOUND', message: 'Not found', request_id: req.id } }));

  // Liveness: the process is up. Says nothing about dependencies.
  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  /**
   * Readiness: dependencies are actually usable. A service must not report
   * ready merely because its process is alive (Phase 07 17).
   */
  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, { ok: boolean; detail?: string }> = {};
    try {
      const r = await getPool().query(
        `select 1 ok, (select count(*) from schema_migration)::int migrations`);
      checks.database = { ok: true, detail: `${r.rows[0].migrations} migrations` };
    } catch (e) { checks.database = { ok: false, detail: (e as Error).message.slice(0, 80) }; }
    try {
      await getPool().query(`select 1 from search_document limit 1`);
      checks.search_index = { ok: true };
    } catch { checks.search_index = { ok: false }; }
    checks.sms_provider = {
      ok: true,
      detail: process.env.SMS_PROVIDER === 'production'
        ? 'production (EXTERNALLY CONFIGURATION-DEPENDENT)' : 'dev-outbox',
    };
    checks.error_tracking = {
      ok: true,
      detail: trackerStatus().configured
        ? 'remote' : 'dev-stderr (ERROR_TRACKER_DSN not set)',
    };
    checks.basemap = {
      ok: Boolean(process.env.NEXT_PUBLIC_PMTILES_URL),
      detail: process.env.NEXT_PUBLIC_PMTILES_URL ? 'configured' : 'EXTERNALLY BLOCKED — degraded map',
    };
    const critical = ['database', 'search_index'];
    const ready = critical.every((k) => checks[k]?.ok);
    reply.status(ready ? 200 : 503);
    return { ready, checks };
  });

  // db/health mirrors legacy callers
  app.get('/health/db', async () => {
    const r = await getPool().query('select 1 as ok');
    return { db: r.rows[0]?.ok === 1 };
  });

  await app.register(discoveryRoutes);
  await app.register(businessRoutes);
  await app.register(claimRoutes);
  await app.register(opsRoutes);

  return app;
}

if (process.argv[1]?.includes('server')) {
  const app = await buildServer();
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen({ port, host: '0.0.0.0' });
  const shutdown = async (): Promise<void> => {
    await app.close(); await closePool(); process.exit(0);
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
