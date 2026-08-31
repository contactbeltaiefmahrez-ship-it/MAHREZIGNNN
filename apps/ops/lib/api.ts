export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Every call carries credentials so the API resolves the staff session.
 * Authorization is enforced SERVER-SIDE — this client hides nothing for
 * security, it only avoids showing controls that would fail.
 */
export interface OpsResult<T> {
  ok: boolean; status: number; data?: T; code?: string; message?: string;
}

/**
 * A flat result rather than a discriminated union: Next generates its own
 * tsconfig for this app, and relying on narrowing across that boundary breaks
 * the build in a way the root typecheck does not catch.
 */
export async function ops<T>(
  path: string, init: RequestInit = {},
): Promise<OpsResult<T>> {
  const r = await fetch(`${API}${path}`, {
    ...init, credentials: 'include', cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!r.ok) {
    const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, status: r.status, code: e?.code ?? 'INTERNAL_ERROR',
             message: e?.message ?? 'Request failed' };
  }
  return { ok: true, status: r.status, data: body as T };
}
