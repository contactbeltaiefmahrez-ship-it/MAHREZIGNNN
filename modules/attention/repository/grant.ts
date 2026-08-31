import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

export interface GrantSpec {
  businessId: string; cycleId: string; seatId: string; tier: string;
}

/**
 * Every form of paid visibility passes through here, so a future subscription
 * product inherits the 1-in-6 cap automatically (Architecture 39).
 * ON CONFLICT DO NOTHING is what makes republishing idempotent.
 */
export async function issueGrants(
  _actor: ActorContext, tx: Tx, specs: readonly GrantSpec[],
): Promise<number> {
  if (specs.length === 0) return 0;
  const r = await tx.query(
    `insert into attention_grant (business_id, cycle_id, seat_id, tier)
     select (s->>'businessId')::uuid, (s->>'cycleId')::uuid,
            (s->>'seatId')::uuid, (s->>'tier')::seat_tier
       from jsonb_array_elements($1::jsonb) s
     on conflict (business_id, cycle_id) do nothing`,
    [JSON.stringify(specs)],
  );
  return r.rowCount ?? 0;
}

export async function revokeGrant(
  _actor: ActorContext, tx: Tx, businessId: string, cycleId: string,
): Promise<void> {
  await tx.query(
    `update attention_grant set revoked_at=now()
      where business_id=$1 and cycle_id=$2 and revoked_at is null`,
    [businessId, cycleId],
  );
}
