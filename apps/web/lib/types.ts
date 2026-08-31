/** Frontend contracts. These mirror the API responses; business logic stays server-side. */
export type Trust = 'UNCLAIMED' | 'CLAIMED' | 'VERIFIED';
export type Origin = 'REAL' | 'DEMO';

export interface Category {
  slug: string; ar: string; fr: string; color: string; count: number;
}
export interface Pin {
  id: string; name: string; nameFr: string | null; categorySlug: string;
  lon: number; lat: number; weight: number; trust: Trust;
  hasOffer: boolean; sponsored: boolean; delegation: string; origin: Origin;
}
export interface Shopfront {
  id: string; name: string; nameFr: string | null;
  category: { slug: string; ar: string; fr: string; color: string };
  delegation: string; delegationAr?: string;
  location: { lon: number; lat: number; confidence: string };
  address: string | null; phone: string | null; website: string | null;
  hours: { note: string } | null; description: string | null;
  services: { label: string }[]; hasOffer: boolean;
  trust: Trust; claimable: boolean; sponsored: boolean; origin: Origin;
}
export interface Bbox { west: number; south: number; east: number; north: number }
