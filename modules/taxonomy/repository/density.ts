import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

/** Powers the "nothing here — try over there" empty state. */
export async function nearestDensity(
  _actor: ActorContext, tx: Tx, lon: number, lat: number,
  categoryId: string, minCount = 5, limit = 3,
): Promise<Array<{ delegation_code: string; business_count: number }>> {
  const r = await tx.query<{ delegation_code: string; business_count: number }>(
    `select d.delegation_code, d.business_count
       from delegation_density d
      where d.category_id = $3::uuid and d.business_count >= $4
        and d.centroid is not null
      order by d.centroid <-> ST_SetSRID(ST_MakePoint($1,$2),4326)
      limit $5`,
    [lon, lat, categoryId, minCount, limit],
  );
  return r.rows;
}

export async function categoryIdBySlug(
  _actor: ActorContext, tx: Tx, slug: string,
): Promise<string | null> {
  const r = await tx.query<{ id: string }>(`select id from category where slug = $1`, [slug]);
  return r.rows[0]?.id ?? null;
}
