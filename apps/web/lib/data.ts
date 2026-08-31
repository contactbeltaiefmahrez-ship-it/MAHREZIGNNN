/**
 * Data layer.
 *
 * MODE=api   → the real Fastify API and CORE database.
 * MODE=demo  → the labelled demo adapter, so the product can be opened without
 *              a database. Demo mode ALWAYS renders a persistent banner; it can
 *              never be silent.
 *
 * Auto: try the API, fall back to demo and report it. Nothing here invents a
 * production record — demo records are typed `origin: 'DEMO'` throughout.
 */
import type { Bbox, Category, Pin, Shopfront } from './types';
import {
  DEMO_CATEGORIES, DEMO_PINS, DEMO_SHOPFRONTS, demoSearch, DEMO_MARKET,
} from './demo';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const CONFIGURED = (process.env.NEXT_PUBLIC_DATA_MODE ?? 'auto') as 'api' | 'demo' | 'auto';

export type Mode = 'api' | 'demo';
let resolved: Mode | null = CONFIGURED === 'auto' ? null : CONFIGURED;

export const GRAND_TUNIS: Bbox = { west: 10.10, south: 36.74, east: 10.40, north: 36.92 };

async function probe(): Promise<Mode> {
  if (resolved) return resolved;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 1500);
    const r = await fetch(`${API}/health`, { signal: c.signal, cache: 'no-store' });
    clearTimeout(t);
    resolved = r.ok ? 'api' : 'demo';
  } catch { resolved = 'demo'; }
  return resolved;
}
export async function currentMode(): Promise<Mode> { return probe(); }

interface ApiPin {
  id: string; name: string; nameFr: string | null; categoryId: string;
  lon: number; lat: number; weight: number; trust: string;
  hasOffer: boolean; sponsored: boolean;
}

export interface Discovery { mode: Mode; pins: Pin[]; total: number; sponsoredCount: number }

export async function getCategories(): Promise<{ mode: Mode; categories: Category[] }> {
  if ((await probe()) === 'demo') return { mode: 'demo', categories: DEMO_CATEGORIES };
  try {
    const r = await fetch(`${API}/v1/categories`, { cache: 'no-store' });
    const j = (await r.json()) as { categories: Category[] };
    return { mode: 'api', categories: j.categories };
  } catch { resolved = 'demo'; return { mode: 'demo', categories: DEMO_CATEGORIES }; }
}

export async function getDiscovery(
  bbox: Bbox, categorySlug: string | null,
): Promise<Discovery> {
  if ((await probe()) === 'demo') {
    const pins = categorySlug
      ? DEMO_PINS.filter((p) => p.categorySlug === categorySlug) : DEMO_PINS;
    return { mode: 'demo', pins, total: pins.length,
             sponsoredCount: pins.filter((p) => p.sponsored).length };
  }
  try {
    const cats = await getCategories();
    const q = new URLSearchParams({
      west: String(bbox.west), south: String(bbox.south),
      east: String(bbox.east), north: String(bbox.north), zoom: '16',
    });
    const r = await fetch(`${API}/v1/map/viewport?${q}`, { cache: 'no-store' });
    const j = (await r.json()) as { pins: ApiPin[]; total: number; grantedCount: number };
    const byId = new Map(cats.categories.map((c) => [c.slug, c]));
    void byId;
    let pins: Pin[] = (j.pins ?? []).map((p) => ({
      id: p.id, name: p.name, nameFr: p.nameFr,
      categorySlug: p.categoryId, lon: p.lon, lat: p.lat, weight: p.weight,
      trust: p.trust as Pin['trust'], hasOffer: p.hasOffer, sponsored: p.sponsored,
      delegation: '', origin: 'REAL',
    }));
    if (categorySlug) pins = pins.filter((p) => p.categorySlug === categorySlug);
    return { mode: 'api', pins, total: j.total ?? pins.length, sponsoredCount: j.grantedCount ?? 0 };
  } catch { resolved = 'demo'; return getDiscovery(bbox, categorySlug); }
}

export async function search(q: string): Promise<{ mode: Mode; results: Pin[] }> {
  if ((await probe()) === 'demo') return { mode: 'demo', results: demoSearch(q) };
  try {
    const r = await fetch(`${API}/v1/search/suggest?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
    const j = (await r.json()) as { results: Array<{ id: string; name: string; nameFr: string | null }> };
    return { mode: 'api', results: j.results.map((x) => ({
      id: x.id, name: x.name, nameFr: x.nameFr, categorySlug: '', lon: 0, lat: 0,
      weight: 3, trust: 'UNCLAIMED', hasOffer: false, sponsored: false,
      delegation: '', origin: 'REAL',
    })) };
  } catch { resolved = 'demo'; return { mode: 'demo', results: demoSearch(q) }; }
}

export async function getShopfront(id: string): Promise<{ mode: Mode; data: Shopfront | null }> {
  if (id.startsWith('demo-')) return { mode: 'demo', data: DEMO_SHOPFRONTS.get(id) ?? null };
  if ((await probe()) === 'demo') return { mode: 'demo', data: DEMO_SHOPFRONTS.get(id) ?? null };
  try {
    const r = await fetch(`${API}/v1/business/${id}`, { cache: 'no-store' });
    if (!r.ok) return { mode: 'api', data: null };
    const b = (await r.json()) as Record<string, unknown>;
    return { mode: 'api', data: { ...(b as unknown as Shopfront), origin: 'REAL' } };
  } catch { resolved = 'demo'; return { mode: 'demo', data: DEMO_SHOPFRONTS.get(id) ?? null }; }
}

export { DEMO_MARKET, DEMO_CATEGORIES };
