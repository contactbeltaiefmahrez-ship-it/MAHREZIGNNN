import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

export async function countNotConfirmed(
  _actor: ActorContext, tx: Tx, orderIds: readonly string[],
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const r = await tx.query<{ n: string }>(
    `select count(*)::text n from seat_order
      where id = any($1::uuid[]) and state not in ('CONFIRMED','LIVE')`,
    [orderIds],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Only the payment module moves order state. Market asks; it does not write. */
export async function markLive(
  _actor: ActorContext, tx: Tx, orderIds: readonly string[],
): Promise<number> {
  if (orderIds.length === 0) return 0;
  const r = await tx.query(
    `update seat_order set state='LIVE', updated_at=now()
      where id = any($1::uuid[]) and state='CONFIRMED'`,
    [orderIds],
  );
  return r.rowCount ?? 0;
}
