import type { FastifyInstance } from 'fastify';
import { withTx } from '../../../platform/db.ts';
import { AppError } from '../../../platform/errors.ts';
import { actorFor, sessionIdFor } from '../context.ts';
import {
  queryViewport, queryClusters, countInViewport, CLUSTER_THRESHOLD, PAYLOAD_LIMIT,
  type ZoomTier,
} from '../../../modules/business/service.ts';
import { buildViewport, type Candidate } from '../../../modules/attention/service.ts';
import { suggest, suggestPrefixOnly, recordZeroResult } from '../../../modules/search/service.ts';

const TIERS: readonly ZoomTier[] = ['GOVERNORATE', 'CITY', 'NEIGHBOURHOOD', 'STREET'];
function tierForZoom(z: number): ZoomTier {
  if (z < 9) return 'GOVERNORATE';
  if (z < 12) return 'CITY';
  if (z < 15) return 'NEIGHBOURHOOD';
  return 'STREET';
}
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The map's hot path. PostGIS supplies candidates; the 1-in-6 cap is applied
   * SERVER-SIDE here and cannot be bypassed by any client. The rotation bucket
   * comes from the session, so the response is deterministic and cacheable.
   */
  app.get('/v1/map/viewport', async (req, reply) => {
    const q = req.query as Record<string, string>;
    const west = num(q.west), south = num(q.south), east = num(q.east), north = num(q.north);
    if (west === null || south === null || east === null || north === null) {
      throw new AppError('VALIDATION_FAILED', 'bbox required: west,south,east,north');
    }
    if (west >= east || south >= north) {
      throw new AppError('VALIDATION_FAILED', 'bbox is degenerate');
    }
    const zoom = num(q.zoom) ?? 15;
    const tier = TIERS.includes(q.tier as ZoomTier) ? (q.tier as ZoomTier) : tierForZoom(zoom);
    const bbox = { west, south, east, north };
    const actor = actorFor(req);
    const categoryId = q.category ?? null;

    const total = await withTx((tx) => countInViewport(actor, tx, bbox, tier, categoryId));
    const dense = total > CLUSTER_THRESHOLD;

    // ONE result set, TWO renderings (UX/UI System 07.1). A dense viewport
    // clusters on the MAP, but the LIST is a peer surface and must still show
    // the ranked businesses. The list is never a fallback for a busy map.
    const cellSize = zoom >= 15 ? 0.0015 : zoom >= 12 ? 0.006 : 0.02;
    const clusters = dense
      ? await withTx((tx) => queryClusters(actor, tx, bbox, cellSize, categoryId))
      : [];

    const rows = await withTx((tx) =>
      queryViewport(actor, tx, bbox, tier, categoryId, {
        hasOffer: q.offer === '1', limit: PAYLOAD_LIMIT,
      }));

    const candidates: Candidate[] = rows.map((r) => ({
      businessId: r.id, discoveryScore: Number(r.discovery_score),
      attentionWeight: r.attention_weight, hasGrant: r.has_grant,
    }));
    const placed = buildViewport(candidates, sessionIdFor(req), PAYLOAD_LIMIT);
    const byId = new Map(rows.map((r) => [r.id, r]));

    // Every sponsored pin carries its label in the PAYLOAD. There is no
    // unlabelled path a client could render.
    const pins = placed.items.map((it) => {
      const r = byId.get(it.businessId)!;
      return {
        id: r.id, name: r.name_ar, nameFr: r.name_fr, categoryId: r.category_id,
        lon: r.lon, lat: r.lat, weight: r.attention_weight,
        trust: r.trust_level, hasOffer: r.has_offer,
        sponsored: it.sponsored,
        sponsoredLabel: it.sponsored ? { ar: 'مموّل', fr: 'Sponsorisé' } : null,
      };
    });

    reply.header('cache-control', `public, max-age=${dense ? 300 : 60}`);
    return {
      mode: dense ? 'clusters' : 'pins', total, tier, bucket: placed.bucket,
      visibleCount: placed.visibleCount, grantedCount: placed.grantedCount,
      pins, clusters,
    };
  });

  /**
   * Search. Attention has ZERO weight here and the search module has no import
   * path to it — enforced by a lint rule and a constitutional test.
   */
  app.get('/v1/search/suggest', async (req) => {
    const q = (req.query as Record<string, string>).q ?? '';
    const actor = actorFor(req);
    let degraded = false;
    let rows;
    try {
      rows = await withTx((tx) => suggest(actor, tx, q));
    } catch {
      degraded = true;
      rows = await withTx((tx) => suggestPrefixOnly(actor, tx, q));
    }
    if (rows.length === 0 && q.trim().length >= 2) {
      // A business people search for and cannot find is a seeding lead.
      await withTx((tx) => recordZeroResult(actor, tx, q, sessionIdFor(req))).catch(() => {});
    }
    return {
      query: q, degraded,
      results: rows.map((r) => ({
        id: r.id, name: r.name_ar, nameFr: r.name_fr,
        delegation: r.delegation_code, categoryId: r.category_id,
        trust: r.trust_level, score: r.match_score,
      })),
    };
  });
}
