-- 010 · Hardening: OTP delivery log, analytics events, session hygiene.

-- Outbound message log. The dev provider writes here instead of sending, so a
-- developer can read the code without an SMS gateway and without us ever
-- pretending a message was delivered.
create table sms_outbox (
  id            uuid primary key default uuid_generate_v7(),
  provider      text not null,
  recipient     text not null,
  template      text not null,
  body_preview  text not null,
  state         text not null default 'QUEUED'
                check (state in ('QUEUED','SENT','FAILED','DEV_LOGGED')),
  error         text,
  created_at    timestamptz not null default now()
);
create index sms_outbox_recent_ix on sms_outbox (recipient, created_at desc);

-- Stream B telemetry. Financial and audit events are NOT analytics and live in
-- their own tables (Architecture 15).
create table event_telemetry (
  id            uuid primary key default uuid_generate_v7(),
  name          text not null,
  schema_version smallint not null default 1,
  occurred_at   timestamptz not null default now(),
  session_id    text,
  actor_type    actor_type not null default 'ANON',
  business_id   uuid,
  properties    jsonb not null default '{}'::jsonb,
  request_id    text
);
create index event_telemetry_name_ix on event_telemetry (name, occurred_at desc);
create index event_telemetry_business_ix on event_telemetry (business_id, occurred_at desc)
  where business_id is not null;

-- Stream A records: receipt-critical, server-emitted, deduplicated.
create table event_record (
  id              uuid primary key default uuid_generate_v7(),
  name            text not null,
  occurred_at     timestamptz not null default now(),
  session_id      text,
  business_id     uuid,
  cycle_id        uuid,
  properties      jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique
);
create index event_record_business_ix on event_record (business_id, occurred_at desc);

alter table session add column if not exists user_agent_hash text;
alter table session add column if not exists idle_expiry timestamptz;
create index if not exists session_active_ix on session (token_hash) where revoked_at is null;

-- Rate limiting for OTP, enforced in the database so it survives a restart and
-- cannot be bypassed by hitting a different app node.
create table otp_rate (
  key        text primary key,
  count      integer not null default 0,
  window_start timestamptz not null default now()
);
