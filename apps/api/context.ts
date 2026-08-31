import type { FastifyRequest } from 'fastify';
import { anon, type ActorContext } from '../../platform/actor.ts';
import { randomUUID } from 'node:crypto';

/**
 * Every request gets an ActorContext. Consumers are anonymous by design
 * (MVP Specification 03.1) — the device id is first-party only and carries no
 * PII; it exists for retention measurement and the 1-in-6 rotation bucket.
 */
export function actorFor(req: FastifyRequest): ActorContext {
  const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
  return anon(requestId);
}

export function sessionIdFor(req: FastifyRequest): string {
  const c = req.headers.cookie ?? '';
  const m = /mk_did=([A-Za-z0-9_-]{8,64})/.exec(c);
  return m?.[1] ?? (req.headers['x-device-id'] as string) ?? 'anon-session';
}
