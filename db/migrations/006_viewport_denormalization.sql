-- 006 · Denormalised viewport flags.
--
-- Contradiction found during implementation: Architecture 04.2 shows the
-- viewport query LEFT JOINing `offer` and `attention_grant`, but 02.3 forbids a
-- module from touching tables it does not own. The boundary lint rule caught it.
--
-- Resolved the same way 07.2 already resolves ranking: PRECOMPUTE. These two
-- booleans are ALREADY inputs to discovery_score, so they are already recomputed
-- on offer publish/expiry and on seat go-live/cycle close. Storing them removes
-- two joins from the hottest query in the product AND keeps `business` the only
-- table the viewport reads. Boundary-clean and faster. See ADR-017.

alter table business
  add column has_active_offer boolean not null default false,
  add column has_active_grant boolean not null default false;

-- The composite index the viewport actually uses.
drop index if exists business_viewport_ix;
create index business_viewport_ix
  on business (category_id, attention_weight desc, discovery_score desc)
  where state = 'PUBLISHED' and deleted_at is null;

create index business_offer_ix on business (category_id)
  where state = 'PUBLISHED' and deleted_at is null and has_active_offer;

-- Owning modules maintain their own flag. Business never writes them itself.
create or replace function set_business_offer_flag(p_business_id uuid) returns void
language sql as $$
  update business b set has_active_offer = exists (
    select 1 from offer o
     where o.business_id = b.id and o.state = 'LIVE' and o.validity @> now())
   where b.id = p_business_id;
$$;

create or replace function set_business_grant_flag(p_business_id uuid) returns void
language sql as $$
  update business b set has_active_grant = exists (
    select 1 from attention_grant g
     join market_cycle c on c.id = g.cycle_id
     where g.business_id = b.id and g.revoked_at is null and c.state = 'LIVE')
   where b.id = p_business_id;
$$;
