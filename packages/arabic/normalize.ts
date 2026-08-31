const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;   // harakat, tanwin, shadda
const TATWEEL = /\u0640/g;
const ARABIC_INDIC = /[\u0660-\u0669]/g;                     // ٠-٩
const EXT_ARABIC_INDIC = /[\u06F0-\u06F9]/g;                 // ۰-۹

export function normalizeArabic(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFKC');
  s = s.replace(DIACRITICS, '').replace(TATWEEL, '');
  s = s.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');    // آ أ إ ٱ -> ا
  s = s.replace(/\u0649/g, '\u064A');                        // ى -> ي
  s = s.replace(/\u0629/g, '\u0647');                        // ة -> ه
  s = s.replace(/\u0624/g, '\u0648').replace(/\u0626/g, '\u064A'); // ؤ->و ئ->ي
  s = s.replace(/\u0621/g, '');                              // standalone hamza
  s = s.replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660));
  s = s.replace(EXT_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036F]/g, '').normalize('NFC'); // Latin accents
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Index both with and without the definite article so "الشمس" matches "شمس". */
export function searchVariants(name: string): string[] {
  const n = normalizeArabic(name);
  if (!n) return [];
  const out = new Set<string>([n]);
  const stripped = n.replace(/(^|\s)ال(?=\p{L})/gu, '$1').replace(/\s+/g, ' ').trim();
  if (stripped && stripped !== n) out.add(stripped);
  return [...out];
}
