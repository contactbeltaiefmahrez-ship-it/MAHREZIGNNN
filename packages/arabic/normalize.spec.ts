import { describe, it, expect } from 'vitest';
import { normalizeArabic, searchVariants } from './normalize.ts';

describe('Arabic normalisation', () => {
  it('strips diacritics', () => {
    expect(normalizeArabic('مَقْهَى')).toBe(normalizeArabic('مقهى'));
  });
  it('unifies alef forms', () => {
    const forms = ['أحمد', 'إحمد', 'آحمد', 'احمد'];
    const n = forms.map(normalizeArabic);
    expect(new Set(n).size).toBe(1);
  });
  it('unifies ta marbuta and alef maqsura', () => {
    expect(normalizeArabic('قهوة')).toBe(normalizeArabic('قهوه'));
    expect(normalizeArabic('مقهى')).toBe(normalizeArabic('مقهي'));
  });
  it('removes tatweel', () => {
    expect(normalizeArabic('مطــعم')).toBe(normalizeArabic('مطعم'));
  });
  it('converts Arabic-Indic digits to Western', () => {
    expect(normalizeArabic('محل ٢٤')).toBe('محل 24');
  });
  it('folds Latin case and accents (Tunisian French)', () => {
    expect(normalizeArabic('Café Échems')).toBe('cafe echems');
  });
  it('indexes with and without the definite article', () => {
    const v = searchVariants('مقهى الشمس');
    expect(v).toContain('مقهي الشمس');
    expect(v).toContain('مقهي شمس');
  });
  it('is idempotent', () => {
    const once = normalizeArabic('مَقْهَى الشَّمْس ٢٠٢٦');
    expect(normalizeArabic(once)).toBe(once);
  });
  it('handles empty and punctuation-only input', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('!!! ??? ...')).toBe('');
  });
});
