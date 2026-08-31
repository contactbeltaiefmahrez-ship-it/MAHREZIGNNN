-- 004 · Receipts, audit (append-only + hash chain), notifications, ops.

create table attention_receipt (
  id                  uuid primary key default uuid_generate_v7(),
  business_id         uuid not null references business(id) on delete cascade,
  cycle_id            uuid not null references market_cycle(id) on delete cascade,
  computation_version smallint not null,
  window_start        timestamptz not null,
  window_end          timestamptz not null,
  cohort_size         integer not null,
  generated_at        timestamptz not null default now(),
  opened_at           timestamptz,
  -- idempotent generation: re-running the job is a no-op
  unique (business_id, cycle_id)
);

create table receipt_line (
  id           uuid primary key default uuid_generate_v7(),
  receipt_id   uuid not null references attention_receipt(id) on delete cascade,
  metric_key   text not null,
  value_num    bigint not null,
  compare_prev bigint,
  compare_cohort bigint,
  unique (receipt_id, metric_key)
);

-- Append-only. Enforced by trigger AND by the application role's grants.
create table audit_entry (
  id           uuid primary key default uuid_generate_v7(),
  actor_type   actor_type not null,
  actor_id     uuid,
  action       text not null,
  target_table text not null,
  target_id    uuid not null,
  before_json  jsonb,
  after_json   jsonb,
  reason       text,
  request_id   text not null,
  prev_hash    bytea,
  entry_hash   bytea not null,
  created_at   timestamptz not null default now()
);
create index audit_target_ix on audit_entry (target_table, target_id, created_at desc);

create or replace function audit_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_entry is append-only (attempted %)', tg_op
    using errcode = 'insufficient_privilege';
end $$;
create trigger audit_no_update before update on audit_entry
  for each row execute function audit_append_only();
create trigger audit_no_delete before delete on audit_entry
  for each row execute function audit_append_only();

create table notification (
  id             uuid primary key default uuid_generate_v7(),
  channel        text not null check (channel in ('SMS','EMAIL','PUSH')),
  recipient      text not null,
  template       text not null,
  entity_id      uuid,
  entity_version integer not null default 1,
  state          text not null default 'QUEUED'
                 check (state in ('QUEUED','SENT','DELIVERED','FAILED')),
  attempts       smallint not null default 0,
  last_error     text,
  created_at     timestamptz not null default now(),
  -- a retried job cannot double-send
  unique (recipient, template, entity_id, entity_version)
);

create table notification_subscription (
  id         uuid primary key default uuid_generate_v7(),
  phone_e164 text not null unique,
  locale     text not null default 'ar',
  verified   boolean not null default false,
  created_at timestamptz not null default now()
);

create table report (
  id           uuid primary key default uuid_generate_v7(),
  business_id  uuid not null references business(id) on delete cascade,
  report_type  text not null,
  note         text,
  device_hash  text not null,
  state        text not null default 'OPEN' check (state in ('OPEN','DISMISSED','ACTIONED')),
  created_at   timestamptz not null default now()
);
create index report_open_ix on report (business_id) where state = 'OPEN';
create index report_device_ix on report (device_hash, created_at desc);

create table moderation_action (
  id          uuid primary key default uuid_generate_v7(),
  target_table text not null,
  target_id   uuid not null,
  action      text not null,
  reason      text not null,
  staff_id    uuid not null references staff_user(id),
  created_at  timestamptz not null default now()
);

create table platform_config (
  key         text primary key,
  value_json  jsonb not null,
  updated_by  uuid references staff_user(id),
  updated_at  timestamptz not null default now()
);

create table import_batch (
  id              uuid primary key default uuid_generate_v7(),
  source          text not null,
  record_count    integer not null default 0,
  -- The seeding pipeline refuses to publish without counsel's D-12 answer.
  -- Architecture cannot make the legal decision; it can make it unskippable.
  legal_basis_ref text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  constraint publish_requires_legal_basis check (
    published_at is null or legal_basis_ref is not null
  )
);

-- Seat prices live in config, not in code (Admin-only, per the permission matrix).
insert into platform_config (key, value_json) values
  ('seat_prices_millimes', '{"STANDARD":150000,"PREMIUM":300000,"FEATURED":600000}'),
  ('seat_layout', '{"STANDARD":52,"PREMIUM":20,"FEATURED":10,"RISING":10,"NEWCOMER":8}'),
  ('ranking_version', '1'),
  ('attention_cap_denominator', '6');
