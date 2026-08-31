/** Money is bigint millimes. 1 TND = 1000 millimes. Never float, never text. */
export type Millimes = bigint;
export const tnd = (dinars: number): Millimes => {
  if (!Number.isFinite(dinars)) throw new Error('non-finite amount');
  return BigInt(Math.round(dinars * 1000));
};
export const formatTnd = (m: Millimes): string => {
  const neg = m < 0n; const a = neg ? -m : m;
  const whole = a / 1000n; const frac = a % 1000n;
  const s = frac === 0n ? `${whole}` : `${whole}.${frac.toString().padStart(3, '0')}`;
  return `${neg ? '-' : ''}${s}`;
};
