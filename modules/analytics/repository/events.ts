import { createHash } from 'node:crypto';
import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

/** Closed event catalogue. Arbitrary payloads are not accepted. */
export const TELEMETRY_EVENTS = [
  'map_open', 'map_ready', 'map_pin_click', 'map_cluster_click',
  'viewport_query', 'search', 'search_zero_results', 'business_open',
  'directions_click', 'contact_click', 'category_select',
] as const;
export const RECORD_EVENTS = [
  'claim_started', 'claim_completed', 'verification_completed',
  'viewport_delivered', 'business_view',
] as const;
export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[number];
export type RecordEvent = (typeof RECORD_EVENTS)[number];

const SCHEMA_VERSION = 1;
/** Never store anything that could identify a person. */
const FORBIDDEN = ['phone', 'email', 'token', 'password', 'code', 'name'];

function scrub(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN.some((f) => k.toLowerCase().includes(f))) continue;
    if (typeof v === 'string' && v.length > 200) continue;
    out[k] = v;
  }
  return out;
}

/** Stream B — best effort. Never blocks a business operation. */
export async function track(
  actor: ActorContext, tx: Tx, name: TelemetryEvent,
  props: Record<string, unknown> = {}, sessionId?: string,
): Promise<void> {
  if (!TELEMETRY_EVENTS.includes(name)) return;
  const { businessId, ...rest } = props as { businessId?: string };
  await tx.query(
    `insert into event_telemetry
       (name,schema_version,session_id,actor_type,business_id,properties,request_id)
     values ($1,$2,$3,$4::actor_type,$5,$6::jsonb,$7)`,
    [name, SCHEMA_VERSION, sessionId ?? null, actor.kind,
     businessId ?? null, JSON.stringify(scrub(rest)), actor.requestId],
  ).catch(() => {});
}

/** Stream A — receipt-critical, deduplicated by idempotency key. */
export async function record(
  actor: ActorContext, tx: Tx, name: RecordEvent,
  props: Record<string, unknown> = {},
): Promise<void> {
  if (!RECORD_EVENTS.includes(name)) return;
  const { businessId, cycleId, ...rest } = props as { businessId?: string; cycleId?: string };
  const key = createHash('sha256')
    .update(`${actor.requestId}|${name}|${businessId ?? ''}`).digest('hex');
  await tx.query(
    `insert into event_record (name,session_id,business_id,cycle_id,properties,idempotency_key)
     values ($1,$2,$3,$4,$5::jsonb,$6)
     on conflict (idempotency_key) do nothing`,
    [name, actor.sessionId, businessId ?? null, cycleId ?? null,
     JSON.stringify(scrub(rest)), key]);
}
