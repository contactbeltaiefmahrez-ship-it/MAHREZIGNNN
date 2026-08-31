import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
/** The attention module maintains its own denormalised flag on business (ADR-017). */
export async function refreshGrantFlags(
  _actor: ActorContext, tx: Tx, businessIds: readonly string[],
): Promise<void> {
  if (businessIds.length === 0) return;
  await tx.query(
    'select set_business_grant_flag(id) from unnest($1::uuid[]) as id', [businessIds]);
}
