import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';
import { eventCounts } from '../../analytics/service.ts';
import { realBusinessIds } from '../../business/service.ts';
import { configSnapshot } from '../../ops/service.ts';

export interface PilotMetrics {
  window: string; segment: string;
  real_businesses: number;
  searches: number; business_opens: number; actions: number;
  map_assisted_opens: number; claims_started: number; claims_completed: number;
  search_to_open_rate: number | null;
  open_to_action_rate: number | null;
  claim_completion_rate: number | null;
  map_assisted_open_share: number | null;
  excluded_events: number;
  note: string;
}

const rate = (n: number, d: number): number | null =>
  d === 0 ? null : Number(((n / d) * 100).toFixed(1));

/**
 * Pilot metrics with two structural exclusions (§52):
 *  1. only the requested traffic segment counts — ORGANIC for investor use;
 *  2. only events attributed to a REAL business count, so a fixture can never
 *     appear as traction.
 * Exclusions are reported, never silent.
 */
export async function pilotMetrics(
  actor: ActorContext, tx: Tx,
  opts: { segment?: string; since?: string; until?: string } = {},
): Promise<PilotMetrics> {
  const segment = opts.segment ?? 'ORGANIC';
  const real = await realBusinessIds(actor, tx);
  const c = await eventCounts(actor, tx, {
    segment, since: opts.since ?? '1970-01-01', until: opts.until ?? '2999-01-01',
    businessAllowlist: real,
  });
  const w = await tx.query<{ label: string }>(
    `select label from pilot_window where state in ('OPEN','FROZEN')
      order by ordinal desc limit 1`);

  return {
    window: w.rows[0]?.label ?? 'no open window',
    segment, real_businesses: real.length,
    searches: c.searches, business_opens: c.business_opens, actions: c.actions,
    map_assisted_opens: c.map_assisted_opens,
    claims_started: c.claims_started, claims_completed: c.claims_completed,
    search_to_open_rate: rate(c.business_opens, c.searches),
    open_to_action_rate: rate(c.actions, c.business_opens),
    claim_completion_rate: rate(c.claims_completed, c.claims_started),
    map_assisted_open_share: rate(c.map_assisted_opens, c.business_opens),
    excluded_events: c.excluded,
    note: real.length === 0
      ? 'No REAL businesses exist. All rates are null by construction, not by failure.'
      : 'Rates computed over ORGANIC traffic against REAL businesses only.',
  };
}

/** Freeze everything a measurement window depends on, so metrics reproduce. */
export async function freezeWindow(
  actor: ActorContext, tx: Tx, ordinal: number,
): Promise<Record<string, unknown>> {
  const snap = await configSnapshot(actor, tx);
  const snapshot = {
    ...snap,
    frozen_at: new Date().toISOString(),
    basemap_configured: Boolean(process.env.NEXT_PUBLIC_PMTILES_URL),
    sms_provider: process.env.SMS_PROVIDER ?? 'dev',
  };
  await tx.query(
    `update pilot_window set frozen_config=$2::jsonb, state='FROZEN', frozen_at=now()
      where ordinal=$1`, [ordinal, JSON.stringify(snapshot)]);
  return snapshot;
}

export async function windowStatus(
  _actor: ActorContext, tx: Tx,
): Promise<Array<{ ordinal: number; label: string; state: string; target_min: number; target_max: number }>> {
  const r = await tx.query<{ ordinal: number; label: string; state: string; target_min: number; target_max: number }>(
    `select ordinal, label, state::text as state, target_min, target_max
       from pilot_window order by ordinal`);
  return r.rows;
}

export async function openWindow(
  _actor: ActorContext, tx: Tx, ordinal: number,
): Promise<void> {
  await tx.query(
    `update pilot_window set state='OPEN', opened_at=now()
      where ordinal=$1 and state='PLANNED'`, [ordinal]);
}

export async function recordDecision(
  actor: ActorContext, tx: Tx, ordinal: number,
  decision: 'CONTINUE' | 'ITERATE' | 'PAUSE' | 'STOP', evidence: string,
): Promise<void> {
  const w = await tx.query<{ id: string }>(
    `update pilot_window set exit_decision=$2, exit_evidence=$3, closed_at=now(),
            state = case when $2 = 'STOP' then 'ABORTED'::pilot_window_state
                         else 'CLOSED'::pilot_window_state end
      where ordinal=$1 returning id`, [ordinal, decision, evidence]);
  await tx.query(
    `insert into pilot_decision_log (window_id, decision, evidence, decided_by)
     values ($1,$2,$3,$4)`,
    [w.rows[0]?.id ?? null, decision, evidence, actor.actorId]);
}
