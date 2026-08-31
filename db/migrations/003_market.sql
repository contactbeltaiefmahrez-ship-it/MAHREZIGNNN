-- 003 · THE MARKET, seat orders, payments, attention grants.
-- This file carries most of the eight correctness constraints from
-- Technical Architecture "Final 3". Money is bigint MILLIMES throughout
-- (1 TND = 1000 millimes). There is no `paid boolean` anywhere.

create table market_cycle (
  id                     uuid primary key default uuid_generate_v7(),
  week_number            integer not null unique,
  opens_at               timestamptz not null,
  applications_close_at  timestamptz not null,
  payment_deadline_at    timestamptz not null,
  lock_at                timestamptz not null,
  live_at                timestamptz not null,
  closes_at              timestamptz not null,
  state                  cycle_state not null default 'DRAFT',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint cycle_chronology check (
    opens_at < applications_close_at
    and applications_close_at <= payment_deadline_at
    and payment_deadline_at <= lock_at
    and lock_at < live_at
    and live_at < closes_at
  ),
  -- no two cycles may be live at the same time
  constraint cycle_no_overlap exclude using gist (tstzrange(live_at, closes_at) with &&)
);

-- Idempotency of every transition, including publish, rests on this table.
create table cycle_transition (
  id          uuid primary key default uuid_generate_v7(),
  cycle_id    uuid not null references market_cycle(id) on delete cascade,
  from_state  cycle_state not null,
  to_state    cycle_state not null,
  actor_type  actor_type not null,
  actor_id    uuid,
  occurred_at timestamptz not null default now(),
  -- CONSTRAINT 5: a cycle can enter each state exactly once.
  -- Publish run twice conflicts here and becomes a no-op.
  unique (cycle_id, to_state)
);

-- Snapshot taken at APPLICATIONS_OPEN so "improvement during this cycle" is
-- measurable rather than reconstructed (curated seat rule, Architecture 12.5).
create table cycle_open_snapshot (
  cycle_id             uuid not null references market_cycle(id) on delete cascade,
  business_id          uuid not null references business(id) on delete cascade,
  completeness_at_open smallint not null,
  trust_at_open        trust_level not null,
  primary key (cycle_id, business_id)
);

create table seat_application (
  id            uuid primary key default uuid_generate_v7(),
  cycle_id      uuid not null references market_cycle(id) on delete cascade,
  business_id   uuid not null references business(id) on delete cascade,
  tier          seat_tier not null,
  state         application_state not null default 'PENDING_REVIEW',
  eligibility   jsonb not null,
  reject_reason text,
  decided_by    uuid references staff_user(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  -- only purchasable tiers can be applied for
  constraint application_tier_sellable check (tier in ('STANDARD','PREMIUM','FEATURED')),
  -- R25 at the application layer: one application per business per cycle
  unique (cycle_id, business_id)
);
create index seat_application_queue_ix on seat_application (cycle_id, state, created_at);

create table seat_order (
  id                  uuid primary key default uuid_generate_v7(),
  application_id      uuid not null unique references seat_application(id) on delete restrict,
  cycle_id            uuid not null references market_cycle(id),
  business_id         uuid not null references business(id),
  tier                seat_tier not null,
  amount_millimes     bigint not null check (amount_millimes > 0),
  invoice_number      text not null unique,
  payment_reference   text not null unique,
  state               order_state not null default 'PENDING_REVIEW',
  payment_deadline_at timestamptz not null,
  idempotency_key     text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- CONSTRAINT 6: a business cannot order two seats in one cycle
  unique (cycle_id, business_id)
);
create index seat_order_awaiting_ix on seat_order (payment_deadline_at)
  where state in ('APPROVED_AWAITING_PAYMENT','PAYMENT_CLAIMED');

-- 100 rows are created WITH the cycle and never inserted later.
-- Seat duplication is therefore structurally impossible, not merely defended against.
create table market_seat (
  id            uuid primary key default uuid_generate_v7(),
  cycle_id      uuid not null references market_cycle(id) on delete cascade,
  position      smallint not null check (position between 1 and 100),
  tier          seat_tier not null,
  source        seat_source not null,
  business_id   uuid references business(id),
  seat_order_id uuid references seat_order(id),
  assigned_at   timestamptz,
  -- CONSTRAINT 1: 100 seats exist, exactly once
  unique (cycle_id, position),
  -- CONSTRAINT 2 (R25): one seat per business per cycle
  unique (cycle_id, business_id),
  -- CONSTRAINT 3 (R29): curated seats can never be sold, sellable never curated
  constraint seat_curated_tiers check (
    (source = 'CURATED'  and tier in ('RISING','NEWCOMER')) or
    (source = 'SELLABLE' and tier in ('STANDARD','PREMIUM','FEATURED'))
  ),
  -- CONSTRAINT 4 (R42): an occupied SELLABLE seat must carry a paid order.
  -- A seat cannot be given away, and a curated seat cannot carry an order.
  constraint seat_sellable_requires_order check (
    (source = 'CURATED'  and seat_order_id is null) or
    (source = 'SELLABLE' and (business_id is null) = (seat_order_id is null))
  ),
  constraint seat_assigned_at_consistent check (
    (business_id is null) = (assigned_at is null)
  )
);
create index market_seat_free_ix on market_seat (cycle_id, tier, position)
  where business_id is null and source = 'SELLABLE';

-- Payments are immutable evidence that money moved on an external rail.
create table payment (
  id                  uuid primary key default uuid_generate_v7(),
  seat_order_id       uuid not null references seat_order(id),
  method              payment_method not null,
  amount_millimes     bigint not null check (amount_millimes > 0),
  external_reference  text,
  receipt_number      text,
  received_by_staff_id uuid references staff_user(id),
  confirmed_by_staff_id uuid not null references staff_user(id),
  confirmed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  -- cash requires a numbered receipt and a named agent
  constraint payment_cash_requires_receipt check (
    method <> 'CASH_AGENT' or (receipt_number is not null and received_by_staff_id is not null)
  ),
  constraint payment_rail_requires_reference check (
    method = 'CASH_AGENT' or external_reference is not null
  )
);
-- CONSTRAINT 7: the same bank reference cannot be credited to two orders
create unique index payment_external_ref_ix on payment (method, external_reference)
  where external_reference is not null;
create index payment_order_ix on payment (seat_order_id);

create table refund (
  id              uuid primary key default uuid_generate_v7(),
  seat_order_id   uuid not null references seat_order(id),
  amount_millimes bigint not null check (amount_millimes > 0),
  reason_code     text not null,
  issued_by_staff_id uuid not null references staff_user(id),
  created_at      timestamptz not null default now()
);
create index refund_order_ix on refund (seat_order_id);

-- Every form of paid visibility passes through this table, so a future
-- subscription product inherits the 1-in-6 cap automatically (Architecture 39).
create table attention_grant (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null references business(id) on delete cascade,
  cycle_id      uuid not null references market_cycle(id) on delete cascade,
  seat_id       uuid references market_seat(id) on delete set null,
  tier          seat_tier not null,
  issued_at     timestamptz not null default now(),
  revoked_at    timestamptz,
  delivered_impressions bigint not null default 0,
  unique (business_id, cycle_id)
);
create index attention_grant_active_ix on attention_grant (cycle_id)
  where revoked_at is null;
