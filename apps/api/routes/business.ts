import type { FastifyInstance } from 'fastify';
import { getPool } from '../../../platform/db.ts';
import { notFound } from '../../../platform/errors.ts';

export default async function businessRoutes(app: FastifyInstance): Promise<void> {
  /** Public shopfront. Internal fields (scores, provenance, quality) never leak. */
  app.get('/v1/business/:id', async (req) => {
    const { id } = req.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const r = await getPool().query(
      `select b.id, b.name_ar, b.name_fr, b.address_text, b.phone_e164,
              b.whatsapp_e164, b.external_url, b.hours, b.description,
              b.trust_level::text as trust_level, b.state::text as state,
              b.delegation_code, b.coordinate_confidence::text as coordinate_confidence,
              ST_X(b.location) as lon, ST_Y(b.location) as lat,
              c.slug as category_slug, c.name_ar as category_ar,
              c.name_fr as category_fr, c.color_hex,
              (select json_agg(json_build_object('label', s.label) order by s.sort_order)
                 from business_service s where s.business_id = b.id) as services,
              exists(select 1 from offer o where o.business_id=b.id
                       and o.state='LIVE' and o.validity @> now()) as has_offer
         from business b join category c on c.id = b.category_id
        where b.id = $1 and b.deleted_at is null and b.state = 'PUBLISHED'`,
      [id]);
    const b = r.rows[0];
    if (!b) throw notFound();
    return {
      id: b.id, name: b.name_ar, nameFr: b.name_fr,
      category: { slug: b.category_slug, ar: b.category_ar, fr: b.category_fr, color: b.color_hex },
      delegation: b.delegation_code,
      location: { lon: b.lon, lat: b.lat, confidence: b.coordinate_confidence },
      address: b.address_text, phone: b.phone_e164, whatsapp: b.whatsapp_e164,
      website: b.external_url, hours: b.hours, description: b.description,
      services: b.services ?? [], hasOffer: b.has_offer,
      // Trust is a state, never a purchasable tier.
      trust: b.trust_level,
      claimable: b.trust_level === 'UNCLAIMED',
    };
  });

  app.get('/v1/categories', async () => {
    const r = await getPool().query(
      `select c.slug, c.name_ar, c.name_fr, c.color_hex,
              count(b.id) filter (where b.state='PUBLISHED' and b.deleted_at is null)::int as n
         from category c left join business b on b.category_id = c.id
        group by c.id order by c.sort_order`);
    return { categories: r.rows.map((c) => ({
      slug: c.slug, ar: c.name_ar, fr: c.name_fr, color: c.color_hex, count: c.n })) };
  });
}
