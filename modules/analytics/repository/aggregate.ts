import type { Tx } from '../../../platform/db.ts';
import type { ActorContext } from '../../../platform/actor.ts';

export interface EventCountQuery {
  segment: string; since: string; until: string;
  /** Only events attributed to these businesses (or to none) are counted. */
  businessAllowlist: readonly string[];
}
export interface EventCounts {
  searches: number; business_opens: number; actions: number;
  map_assisted_opens: number; claims_started: number; claims_completed: number;
  excluded: number;
}

/**
 * Segment-aware event aggregation. The analytics module owns its tables, so the
 * caller passes an allowlist of business ids rather than joining `business`.
 * Everything outside the segment or the allowlist is counted as EXCLUDED and
 * reported — exclusions are visible, never silent.
 */
export async function eventCounts(
  _actor: ActorContext, tx: Tx, q: EventCountQuery,
): Promise<EventCounts> {
  const r = await tx.query<Record<string, string>>(
    `with scoped as (
       select name, business_id, properties from event_telemetry
        where traffic_segment = $1::traffic_segment
          and occurred_at >= $2::timestamptz and occurred_at < $3::timestamptz
          and (business_id is null or business_id = any($4::uuid[]))
     )
     select
       (select count(*) from scoped where name='search')::text searches,
       (select count(*) from scoped where name='business_open')::text opens,
       (select count(*) from scoped where name in ('contact_click','directions_click'))::text actions,
       (select count(*) from scoped where name='business_open'
          and properties->>'source' in ('map','cluster'))::text map_opens,
       (select count(*) from scoped where name='claim_started')::text cs,
       (select count(*) from scoped where name='claim_completed')::text cc,
       (select count(*) from event_telemetry
         where occurred_at >= $2::timestamptz and occurred_at < $3::timestamptz
           and (traffic_segment <> $1::traffic_segment
                or (business_id is not null and not (business_id = any($4::uuid[])))))::text excl`,
    [q.segment, q.since, q.until, [...q.businessAllowlist]]);
  const x = r.rows[0]!;
  const n = (k: string): number => Number(x[k] ?? 0);
  return {
    searches: n('searches'), business_opens: n('opens'), actions: n('actions'),
    map_assisted_opens: n('map_opens'), claims_started: n('cs'),
    claims_completed: n('cc'), excluded: n('excl'),
  };
}
