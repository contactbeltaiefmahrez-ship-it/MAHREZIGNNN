import { createHash } from 'node:crypto';
import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

/**
 * Stable serialisation with sorted keys.
 *
 * Postgres `jsonb` normalises and REORDERS object keys, so hashing
 * JSON.stringify(value) on write and again on read produces different bytes and
 * a spuriously "broken" chain. Both sides must canonicalise identically.
 */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

export interface AuditInput {
  action: string; targetTable: string; targetId: string;
  before?: unknown; after?: unknown; reason?: string;
}

/**
 * Append-only audit with a hash chain. This does not stop an attacker with
 * database access from rewriting the chain, and is not claimed to — it makes
 * SILENT tampering detectable, which is the realistic threat.
 */
export async function writeAudit(
  actor: ActorContext, tx: Tx, a: AuditInput,
): Promise<string> {
  const prev = await tx.query<{ entry_hash: Buffer }>(
    `select entry_hash from audit_entry order by id desc limit 1`);
  const prevHash = prev.rows[0]?.entry_hash ?? null;
  const payload = canonical({
    actor: actor.kind, actorId: actor.actorId, action: a.action,
    target: `${a.targetTable}:${a.targetId}`,
    before: a.before ?? null, after: a.after ?? null,
    reason: a.reason ?? null, requestId: actor.requestId,
  });
  const entryHash = createHash('sha256')
    .update(prevHash ?? Buffer.alloc(0)).update(payload).digest();
  const r = await tx.query<{ id: string }>(
    `insert into audit_entry
      (actor_type,actor_id,action,target_table,target_id,before_json,after_json,
       reason,request_id,prev_hash,entry_hash)
     values ($1::actor_type,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11)
     returning id`,
    [actor.kind, actor.actorId, a.action, a.targetTable, a.targetId,
     a.before === undefined ? null : JSON.stringify(a.before),
     a.after === undefined ? null : JSON.stringify(a.after),
     a.reason ?? null, actor.requestId, prevHash, entryHash]);
  return r.rows[0]!.id;
}

/** Nightly integrity check. A break means someone edited history. */
export async function verifyChain(
  _actor: ActorContext, tx: Tx, limit = 5000,
): Promise<{ checked: number; broken: string[] }> {
  const rows = await tx.query<{
    id: string; actor_type: string; actor_id: string | null; action: string;
    target_table: string; target_id: string; before_json: unknown; after_json: unknown;
    reason: string | null; request_id: string; prev_hash: Buffer | null; entry_hash: Buffer;
  }>(`select * from audit_entry order by id asc limit $1`, [limit]);
  const broken: string[] = [];
  let prev: Buffer | null = null;
  for (const r of rows.rows) {
    const payload = canonical({
      actor: r.actor_type, actorId: r.actor_id, action: r.action,
      target: `${r.target_table}:${r.target_id}`,
      before: r.before_json ?? null, after: r.after_json ?? null,
      reason: r.reason, requestId: r.request_id,
    });
    const expect: Buffer = createHash('sha256')
      .update(prev ?? Buffer.alloc(0)).update(payload).digest();
    if (!expect.equals(r.entry_hash)) broken.push(r.id);
    prev = r.entry_hash;
  }
  return { checked: rows.rowCount ?? 0, broken };
}
