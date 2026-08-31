export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Pin {
  id: string; name: string; nameFr: string | null; categoryId: string;
  lon: number; lat: number; weight: number; trust: string;
  hasOffer: boolean; sponsored: boolean;
  sponsoredLabel: { ar: string; fr: string } | null;
}
export interface ViewportResponse {
  mode: 'pins' | 'clusters'; total: number; tier: string;
  bucket?: number; visibleCount?: number; grantedCount?: number;
  pins?: Pin[]; clusters?: { lon: number; lat: number; n: number }[];
}
export interface Category { slug: string; ar: string; fr: string; color: string; count: number }

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json() as Promise<T>;
}
export const getCategories = () => get<{ categories: Category[] }>('/v1/categories');
export const getViewport = (b: {west:number;south:number;east:number;north:number}, zoom: number, cat?: string) =>
  get<ViewportResponse>(`/v1/map/viewport?west=${b.west}&south=${b.south}&east=${b.east}&north=${b.north}&zoom=${zoom}${cat?`&category=${cat}`:''}`);
export const getBusiness = (id: string) => get<Record<string, unknown>>(`/v1/business/${id}`);
export const search = (q: string) =>
  get<{ query: string; degraded: boolean; results: { id:string;name:string;nameFr:string|null;delegation:string;trust:string }[] }>(
    `/v1/search/suggest?q=${encodeURIComponent(q)}`);
