import pg from 'pg';
// Postgres bigint arrives as a string by default; money must not silently lose
// precision through Number(). Parse int8 to BigInt everywhere.
pg.types.setTypeParser(20, (v: string) => BigInt(v));

let pool: pg.Pool | null = null;
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, statement_timeout: 5_000,
    });
  }
  return pool;
}
export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
export type Tx = pg.PoolClient;

/** One transaction per business operation. No HTTP, SMS or storage inside. */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
