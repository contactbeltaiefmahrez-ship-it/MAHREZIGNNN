/**
 * Tunisian real-data normalisation.
 *
 * Rule from Phase 06 §11: the DISPLAY value is never destroyed. Normalisation
 * produces a separate searchable value; `name_ar` and `name_fr` are stored
 * exactly as the source gave them.
 */
import { normalizeArabic } from '../../../packages/arabic/normalize.ts';

/** Tunisia is +216 with 8 national digits. */
export function normalizePhoneTN(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.normalize('NFKC')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\d+]/g, '');
  if (s.startsWith('00216')) s = `+${s.slice(2)}`;
  else if (s.startsWith('216') && s.length === 11) s = `+${s}`;
  else if (s.startsWith('+216')) { /* already */ }
  else if (/^\d{8}$/.test(s)) s = `+216${s}`;
  else if (s.startsWith('0') && s.length === 9) s = `+216${s.slice(1)}`;
  else return null;
  return /^\+216[2-9]\d{7}$/.test(s) ? s : null;
}

/** Business-line prefixes in Tunisia: 2/4/5/9 mobile, 3/7 fixed, 8 special. */
export function isPlausibleBusinessPhone(e164: string | null): boolean {
  if (!e164) return false;
  const d = e164.slice(4);
  return /^[234579]/.test(d) && d.length === 8;
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return null;
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch { return null; }
}

/**
 * Common Tunisian commercial abbreviations.
 *
 * Accents are folded BEFORE these run: JS `\b` is defined over [A-Za-z0-9_], so
 * `\bsté\b` never matches — there is no word boundary after a non-ASCII letter.
 * Folding first means "Sté" and "Ste" hit the same rule. Boundaries are
 * Unicode-aware lookarounds for the same reason.
 */
const ABBREV: ReadonlyArray<[RegExp, string]> = [
  [/(?<!\p{L})ste(?!\p{L})\.?/giu, 'societe'],
  [/(?<!\p{L})ets(?!\p{L})\.?/giu, 'etablissement'],
  [/(?<!\p{L})av(?!\p{L})\.?/giu, 'avenue'],
  [/(?<!\p{L})bd(?!\p{L})\.?/giu, 'boulevard'],
  [/(?<!\p{L})rte(?!\p{L})\.?/giu, 'route'],
  [/(?<!\p{L})res(?!\p{L})\.?/giu, 'residence'],
  [/(?<!\p{L})imm(?!\p{L})\.?/giu, 'immeuble'],
  [/(?<!\p{L})ش(?!\p{L})\.?/gu, 'شارع'],
];

export function normalizeBusinessName(display: string): string {
  // Fold Latin accents first so abbreviation rules see plain ASCII.
  let s = display.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFC');
  for (const [re, to] of ABBREV) s = s.replace(re, to);
  return normalizeArabic(s);
}

/** Delegation codes are canonical identifiers, never free text (Phase 06 §15). */
export function normalizeDelegationCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
  return /^[A-Z]{2,4}-[A-Z0-9-]{2,}$/.test(s) ? s : null;
}

export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  return s.length >= 3 ? s : null;
}
