import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const dir = join(process.cwd(), 'db/migrations');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists schema_migration(
  filename text primary key, applied_at timestamptz not null default now())`);
const done = new Set(
  (await client.query('select filename from schema_migration')).rows.map((r) => r.filename),
);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  if (done.has(f)) { console.log(`  skip ${f}`); continue; }
  const sql = readFileSync(join(dir, f), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migration(filename) values ($1)', [f]);
    await client.query('commit');
    console.log(`  applied ${f}`);
  } catch (e) {
    await client.query('rollback');
    console.error(`  FAILED ${f}: ${(e as Error).message}`);
    process.exit(1);
  }
}
await client.end();
console.log('migrations complete');
