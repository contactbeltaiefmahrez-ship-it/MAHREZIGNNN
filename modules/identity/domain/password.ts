import argon2 from 'argon2';
import { scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Password hashing. Pure domain logic with no I/O, so it lives in domain/ and
 * not repository/ — the invariant test that walks repository exports is right
 * to insist every data-access function starts with an ActorContext.
 *
 * Argon2id, as the Architecture specifies (ADR-006).
 *
 * Phase 07 shipped scrypt because a native build was unreliable. argon2 now
 * installs and verifies here, so the deviation is closed. Existing scrypt
 * hashes are still ACCEPTED and transparently upgraded on next login — no user
 * is locked out, and no password reset cycle is required.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
  });
}

function verifyScryptLegacy(plain: string, stored: string): boolean {
  const [, saltHex, dkHex] = stored.split('$');
  if (!saltHex || !dkHex) return false;
  const dk = scryptSync(plain, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(dkHex, 'hex');
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

export interface VerifyResult { ok: boolean; needsRehash: boolean }

export async function verifyPassword(plain: string, stored: string): Promise<VerifyResult> {
  if (stored.startsWith('$argon2')) {
    return { ok: await argon2.verify(stored, plain).catch(() => false), needsRehash: false };
  }
  if (stored.startsWith('scrypt$')) {
    // legacy: accept, then upgrade
    return { ok: verifyScryptLegacy(plain, stored), needsRehash: true };
  }
  return { ok: false, needsRehash: false };
}

