/**
 * DEMO DATA — for the visual product only.
 *
 * These are NOT real businesses. Every record carries `origin: 'DEMO'` and an
 * id prefixed `demo-`, so nothing here can be mistaken for a production record
 * or reach the pipeline: real records enter only through staging → validation →
 * legal gate → publish, and this module has no path to any of that.
 *
 * Names are deliberately generic-descriptive rather than plausible business
 * names, so a screenshot cannot be read as a real Tunis directory.
 */
import type { Category, Pin, Shopfront } from './types';

export const DEMO_NOTICE_AR = 'بيانات تجريبية — ليست أنشطة حقيقية';
export const DEMO_NOTICE_FR = 'Données de démonstration — pas de vrais commerces';

export const DEMO_CATEGORIES: Category[] = [
  { slug: 'cafes',    ar: 'مقاهي ومطاعم',  fr: 'Cafés et restaurants',   color: '#6D3BF5', count: 9 },
  { slug: 'beauty',   ar: 'حلاقة وتجميل',  fr: 'Coiffure et beauté',     color: '#FF56A5', count: 5 },
  { slug: 'clothing', ar: 'ملابس وأحذية',  fr: 'Vêtements et chaussures',color: '#12C2E9', count: 4 },
  { slug: 'bakery',   ar: 'حلويات ومخابز', fr: 'Pâtisseries',            color: '#FF8A3D', count: 4 },
  { slug: 'gyms',     ar: 'قاعات رياضة',   fr: 'Salles de sport',        color: '#16D2A0', count: 3 },
  { slug: 'home',     ar: 'خدمات منزلية',  fr: 'Services à domicile',    color: '#2B6BFF', count: 4 },
  { slug: 'creative', ar: 'تصوير وإبداع',  fr: 'Photo et création',      color: '#E0A800', count: 3 },
  { slug: 'repair',   ar: 'إصلاح وصيانة',  fr: 'Réparation',             color: '#FF5C72', count: 4 },
];

const AR = ['واجهة عرض', 'محل تجريبي', 'نموذج واجهة', 'عيّنة نشاط'];
const FR = ['Vitrine Démo', 'Commerce Démo', 'Exemple Local', 'Échantillon'];
const DELEGATIONS = [
  { code: 'TUN-CENTRE', ar: 'تونس المدينة', fr: 'Tunis Centre', lon: 10.181, lat: 36.800 },
  { code: 'TUN-MARSA',  ar: 'المرسى',       fr: 'La Marsa',     lon: 10.324, lat: 36.878 },
  { code: 'ARI-MENZAH', ar: 'المنزه',       fr: 'El Menzah',    lon: 10.171, lat: 36.840 },
  { code: 'BEN-RADES',  ar: 'رادس',         fr: 'Radès',        lon: 10.276, lat: 36.768 },
];

/** Deterministic: the same demo set on every load, so screenshots are stable. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function build(): { pins: Pin[]; shopfronts: Map<string, Shopfront> } {
  const r = rng(20260829);
  const pins: Pin[] = [];
  const shopfronts = new Map<string, Shopfront>();
  const total = DEMO_CATEGORIES.reduce((a, c) => a + c.count, 0);

  let i = 0;
  for (const cat of DEMO_CATEGORIES) {
    for (let k = 0; k < cat.count; k++, i++) {
      const d = DELEGATIONS[i % DELEGATIONS.length]!;
      const id = `demo-${String(i + 1).padStart(3, '0')}`;
      // trust distribution reflects a plausible early state: mostly unclaimed
      const trust = i % 9 === 0 ? 'VERIFIED' : i % 4 === 0 ? 'CLAIMED' : 'UNCLAIMED';
      const sponsored = i % 11 === 3;      // a few, never many
      const weight = 1 + Math.floor(r() * 5);
      const lon = Number((d.lon + (r() - 0.5) * 0.03).toFixed(6));
      const lat = Number((d.lat + (r() - 0.5) * 0.022).toFixed(6));
      const name = `${AR[i % AR.length]} ${i + 1}`;
      const nameFr = `${FR[i % FR.length]} ${i + 1}`;

      pins.push({
        id, name, nameFr, categorySlug: cat.slug, lon, lat, weight,
        trust: trust as Pin['trust'], hasOffer: i % 7 === 2, sponsored,
        delegation: d.code, origin: 'DEMO',
      });

      shopfronts.set(id, {
        id, name, nameFr,
        category: { slug: cat.slug, ar: cat.ar, fr: cat.fr, color: cat.color },
        delegation: d.code, delegationAr: d.ar,
        location: { lon, lat, confidence: trust === 'VERIFIED' ? 'VERIFIED' : 'HIGH' },
        address: `${d.fr}, ${i + 1}`,
        // Only some demo records carry a phone, so the "no contact" state is visible.
        phone: i % 3 === 0 ? null : `+2167${String(1000000 + i).slice(0, 7)}`,
        website: i % 5 === 0 ? `https://example-demo-${i + 1}.tn` : null,
        hours: i % 4 === 0 ? null : { note: 'يوميًا ٠٨:٠٠ – ٢٢:٠٠' },
        description: i % 3 === 1
          ? 'واجهة تجريبية تُستخدم لعرض تجربة المنتج. لا تمثّل نشاطًا حقيقيًا.' : null,
        services: i % 2 === 0 ? [{ label: 'خدمة تجريبية' }, { label: 'عيّنة' }] : [],
        hasOffer: i % 7 === 2, trust: trust as Shopfront['trust'],
        claimable: trust === 'UNCLAIMED', sponsored, origin: 'DEMO',
      });
    }
  }
  void total;
  return { pins, shopfronts };
}

const built = build();
export const DEMO_PINS = built.pins;
export const DEMO_SHOPFRONTS = built.shopfronts;

export function demoSearch(q: string): Pin[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return DEMO_PINS.filter((p) =>
    p.name.includes(t) || (p.nameFr ?? '').toLowerCase().includes(t) ||
    p.categorySlug.includes(t) ||
    (DEMO_CATEGORIES.find((c) => c.slug === p.categorySlug)?.ar ?? '').includes(t),
  ).slice(0, 12);
}

/**
 * The weekly market, in DEMO state. Occupancy is a fixed illustrative layout —
 * it is NOT a count of businesses that bought anything, because none have.
 */
export const DEMO_MARKET = {
  isDemo: true as const,
  totalSeats: 100,
  layout: Array.from({ length: 100 }, (_, i) => {
    if (i >= 82) return i < 92 ? 'CURATED' : 'CURATED';
    if (i % 9 === 0) return 'VACANT';
    if (i < 10) return 'FEATURED';
    if (i < 30) return 'PREMIUM';
    return 'STANDARD';
  }) as Array<'FEATURED' | 'PREMIUM' | 'STANDARD' | 'CURATED' | 'VACANT'>,
};
