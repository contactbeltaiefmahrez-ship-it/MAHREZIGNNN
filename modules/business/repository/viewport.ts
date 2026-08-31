import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

/** Zoom tiers map to a minimum attention weight (Architecture 09.2). */
export type ZoomTier = 'GOVERNORATE' | 'CITY' | 'NEIGHBOURHOOD' | 'STREET';
const MIN_WEIGHT: Record<ZoomTier, number> = {
  GOVERNORATE: 5, CITY: 3, NEIGHBOURHOOD: 2, STREET: 1,
};

export interface Bbox { west: number; south: number; east: number; north: number }

export interface ViewportRow {
  id: string; name_ar: string; name_fr: string | null;
  category_id: string; lon: number; lat: number;
  attention_weight: number; trust_level: string;
  discovery_score: string; has_offer: boolean; has_grant: boolean;
}

export interface ClusterRow {
  lon: number; lat: number; n: number; dominant_category: string | null;
}

export const CLUSTER_THRESHOLD = 150;
export const PAYLOAD_LIMIT = 200;

/**
 * The hottest query in the product.
 *
 * `&&` is an index-only bounding-box test on the GiST index — for points it is
 * equivalent to ST_Intersects and cheaper. discovery_score and attention_weight
 * are PRECOMPUTED columns, so the ranking formula never runs at request time.
 * Distance is deliberately absent from ORDER BY: on a map, spatial position is
 * already the distance signal (Architecture 04.2).
 */
export async function queryViewport(
  _actor: ActorContext, tx: Tx, bbox: Bbox, tier: ZoomTier,
  categoryId: string | null,
  opts: { hasOffer?: boolean; limit?: number } = {},
): Promise<ViewportRow[]> {
  const res = await tx.query<ViewportRow>(
    `select b.id, b.name_ar, b.name_fr, b.category_id,
            ST_X(b.location) as lon, ST_Y(b.location) as lat,
            b.attention_weight, b.trust_level::text as trust_level,
            b.discovery_score::text as discovery_score,
            b.has_active_offer as has_offer,
            b.has_active_grant as has_grant
       from business b
      where b.state = 'PUBLISHED'
        and b.deleted_at is null
        and b.location && ST_MakeEnvelope($1,$2,$3,$4,4326)
        and b.attention_weight >= $5
        and ($6::uuid is null or b.category_id = $6::uuid)
        and (not $7::boolean or b.has_active_offer)
      order by b.discovery_score desc, b.id
      limit $8`,
    [bbox.west, bbox.south, bbox.east, bbox.north, MIN_WEIGHT[tier],
     categoryId, opts.hasOffer ?? false, opts.limit ?? PAYLOAD_LIMIT],
  );
  return res.rows;
}

export async function countInViewport(
  _actor: ActorContext, tx: Tx, bbox: Bbox, tier: ZoomTier, categoryId: string | null,
): Promise<number> {
  const r = await tx.query<{ n: string }>(
    `select count(*)::text n from business b
      where b.state = 'PUBLISHED' and b.deleted_at is null
        and b.location && ST_MakeEnvelope($1,$2,$3,$4,4326)
        and b.attention_weight >= $5
        and ($6::uuid is null or b.category_id = $6::uuid)`,
    [bbox.west, bbox.south, bbox.east, bbox.north, MIN_WEIGHT[tier], categoryId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Grid-snapped clustering, not ST_ClusterDBSCAN.
 * DBSCAN clusters MOVE as the viewport shifts, which makes them un-cacheable and
 * visually unstable while panning. Grid snapping is deterministic for a given
 * (zoom, cell size), so the same viewport always yields the same clusters.
 */
export async function queryClusters(
  _actor: ActorContext, tx: Tx, bbox: Bbox, cellSize: number, categoryId: string | null,
): Promise<ClusterRow[]> {
  const res = await tx.query<{ lon: number; lat: number; n: string; dominant_category: string | null }>(
    `select ST_X(ST_Centroid(ST_Collect(b.location))) as lon,
            ST_Y(ST_Centroid(ST_Collect(b.location))) as lat,
            count(*)::text as n,
            (mode() within group (order by b.category_id))::text as dominant_category
       from business b
      where b.state = 'PUBLISHED' and b.deleted_at is null
        and b.location && ST_MakeEnvelope($1,$2,$3,$4,4326)
        and ($6::uuid is null or b.category_id = $6::uuid)
      group by ST_SnapToGrid(b.location, $5)`,
    [bbox.west, bbox.south, bbox.east, bbox.north, cellSize, categoryId],
  );
  return res.rows.map((r) => ({
    lon: r.lon, lat: r.lat, n: Number(r.n), dominant_category: r.dominant_category,
  }));
}
