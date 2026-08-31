/**
 * Worker. pg-boss lives inside CORE, so a job can be enqueued in the SAME
 * transaction as the state change that caused it — transactional outbox
 * semantics without an outbox table (Architecture 18).
 */
import { PgBoss } from 'pg-boss';
import { system } from '../../platform/actor.ts';
import { withTx, closePool } from '../../platform/db.ts';
import { verifyChain } from '../../modules/audit/service.ts';
import { captureError } from '../../platform/telemetry.ts';
import { reindex } from '../../modules/search/service.ts';

const SYS = system('worker');

export async function startWorker(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (e: unknown) => captureError({
    source: 'worker',
    message: e instanceof Error ? e.message : JSON.stringify(e),
    stack: e instanceof Error ? e.stack : undefined,
  }));
  await boss.start();

  const log = (job: string, extra: Record<string, unknown> = {}): void =>
    console.log(JSON.stringify({ level: 'info', job, ...extra, at: new Date().toISOString() }));

  // pg-boss v10+ requires queues to exist before a worker attaches. Declaring
  // them here keeps the set of jobs explicit and greppable.
  const QUEUES = [
    'search.reindex', 'offers.expire', 'audit.verify_chain', 'documents.delete_expired',
  ] as const;
  for (const q of QUEUES) {
    await boss.createQueue(q, { retryLimit: 3, retryBackoff: true });
  }

  // Every handler is idempotent: a retry must be safe.
  await boss.work('search.reindex', async ([job]) => {
    const d = job?.data as { businessId: string };
    await withTx(async (tx) => {
      const r = await tx.query<{
        id: string; name_ar: string; name_fr: string | null; aliases: string[];
        delegation_code: string; category_id: string; trust_level: string; state: string;
      }>(`select id,name_ar,name_fr,aliases,delegation_code,category_id,
                 trust_level::text,state::text from business where id=$1`, [d.businessId]);
      const b = r.rows[0];
      if (!b) return;
      await reindex(SYS, tx, {
        businessId: b.id, nameAr: b.name_ar, nameFr: b.name_fr, aliases: b.aliases,
        delegationCode: b.delegation_code, categoryId: b.category_id,
        trustLevel: b.trust_level as 'CLAIMED',
        searchable: b.state === 'PUBLISHED',
      });
    });
    log('search.reindex', { businessId: d.businessId });
  });

  await boss.work('offers.expire', async () => {
    const n = await withTx(async (tx) => {
      const r = await tx.query(
        `update offer set state='EXPIRED', updated_at=now()
          where state='LIVE' and upper(validity) < now()`);
      return r.rowCount ?? 0;
    });
    log('offers.expire', { expired: n });
  });

  await boss.work('audit.verify_chain', async () => {
    const r = await withTx((tx) => verifyChain(SYS, tx));
    if (r.broken.length) {
      console.error(JSON.stringify({ level: 'alert', job: 'audit.verify_chain',
        msg: 'AUDIT CHAIN BROKEN', broken: r.broken }));
    }
    log('audit.verify_chain', { checked: r.checked, broken: r.broken.length });
  });

  await boss.work('documents.delete_expired', async () => {
    const n = await withTx(async (tx) => {
      const r = await tx.query(
        `update media_object set state='REJECTED'
          where bucket='private' and retention_expires_at < now() and state <> 'REJECTED'`);
      return r.rowCount ?? 0;
    });
    // A missed retention deletion is a compliance event, not a log line.
    log('documents.delete_expired', { purged: n });
  });

  await boss.schedule('offers.expire', '0 * * * *');
  await boss.schedule('audit.verify_chain', '0 3 * * *');
  await boss.schedule('documents.delete_expired', '0 4 * * *');
  log('worker.started');
  return boss;
}

if (process.argv[1]?.includes('worker')) {
  const boss = await startWorker();
  const stop = async (): Promise<void> => {
    await boss.stop({ graceful: true, timeout: 15_000 });
    await closePool(); process.exit(0);
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
