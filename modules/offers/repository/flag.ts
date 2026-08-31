import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
/** The offers module maintains its own denormalised flag on business (ADR-017). */
export async function refreshOfferFlag(
  _actor: ActorContext, tx: Tx, businessId: string,
): Promise<void> {
  await tx.query('select set_business_offer_flag($1::uuid)', [businessId]);
}
