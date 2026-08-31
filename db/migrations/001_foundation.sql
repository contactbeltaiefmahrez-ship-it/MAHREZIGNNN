-- 001 · Foundation: extensions, uuid v7, shared enums, taxonomy, identity.
-- Architecture 03.1 conventions: uuid v7 PKs, timestamptz UTC, bigint millimes,
-- Postgres enums for state fields, no soft delete on financial/audit rows.

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- PostgreSQL 18 ships uuidv7(); this deployment targets 16, so it lives in
-- userland. Same ordering guarantees, same on-disk layout. See ADR-015.
create or replace function uuid_generate_v7() returns uuid
language plpgsql volatile as $$
declare
  ts_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  b bytea := substring(int8send(ts_ms) from 3 for 6) || gen_random_bytes(10);
begin
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);   -- version 7
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);   -- RFC 4122 variant
  return encode(b, 'hex')::uuid;
end $$;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ── enums · every state machine is a DB type, so an invalid state is rejected
create type business_state  as enum ('DRAFT','PUBLISHED','SUSPENDED','CLOSED_PERMANENTLY');
create type trust_level     as enum ('UNCLAIMED','CLAIMED','VERIFIED');
create type claim_state     as enum ('CLAIM_PENDING','OTP_VERIFIED','OPS_REVIEW','MINIMUM_PROFILE','CLAIMED','CLAIM_REJECTED');
create type claim_method    as enum ('OTP','NO_ACCESS');
create type verif_state     as enum ('VERIFICATION_PENDING','VERIFIED','REJECTED');
create type verif_evidence  as enum ('PATENTE','RNE_EXTRACT','UTILITY_BILL','FIELD_VISIT');
create type offer_state     as enum ('DRAFT','PENDING_REVIEW','LIVE','EXPIRED','REJECTED');
create type offer_kind      as enum ('PERCENT','FIXED','FREE_ITEM');
create type cycle_state     as enum ('DRAFT','APPLICATIONS_OPEN','REVIEW_CLOSED','PAYMENT_CLOSED','LOCKED','LIVE','CLOSED');
create type seat_tier       as enum ('STANDARD','PREMIUM','FEATURED','RISING','NEWCOMER');
create type seat_source     as enum ('SELLABLE','CURATED');
create type application_state as enum ('PENDING_REVIEW','APPROVED','REJECTED','WITHDRAWN');
create type order_state     as enum ('PENDING_REVIEW','APPROVED_AWAITING_PAYMENT','PAYMENT_CLAIMED',
                                     'CONFIRMED','LIVE','COMPLETED','EXPIRED','REJECTED','CANCELLED','REFUNDED');
create type payment_method  as enum ('BANK_TRANSFER','D17','CASH_AGENT');
create type actor_type      as enum ('ANON','OWNER','OPS','ADMIN','SYSTEM');
create type media_state     as enum ('PENDING','APPROVED','REJECTED');
create type staff_role      as enum ('OPS','ADMIN');

-- ── taxonomy
create table category (
  id           uuid primary key default uuid_generate_v7(),
  slug         text not null unique,
  name_ar      text not null,
  name_fr      text not null,
  color_hex    text not null check (color_hex ~ '^#[0-9A-F]{6}$'),
  sort_order   smallint not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table delegation (
  code         text primary key,
  name_ar      text not null,
  name_fr      text not null,
  governorate  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- MARKYRA-computed centroids of MARKYRA's own points. Not OSM polygons.
create table delegation_density (
  delegation_code text not null references delegation(code),
  category_id     uuid not null references category(id),
  business_count  integer not null default 0,
  centroid        geometry(Point, 4326),
  refreshed_at    timestamptz not null default now(),
  primary key (delegation_code, category_id)
);
create index on delegation_density using gist (centroid);

-- ── identity
create table owner_account (
  id            uuid primary key default uuid_generate_v7(),
  phone_e164    text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  locale        text not null default 'ar' check (locale in ('ar','fr')),
  notify_sms    boolean not null default true,
  notify_email  boolean not null default false,
  email         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger owner_account_touch before update on owner_account
  for each row execute function touch_updated_at();

create table staff_user (
  id            uuid primary key default uuid_generate_v7(),
  email         text not null unique,
  password_hash text not null,
  role          staff_role not null,
  webauthn_registered boolean not null default false,
  disabled_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- OTP: only the hash is stored; the plaintext exists solely in the SMS.
create table otp_challenge (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null,
  code_hash     text not null,
  attempts      smallint not null default 0 check (attempts >= 0 and attempts <= 3),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on otp_challenge (business_id, created_at desc);

create table session (
  id              uuid primary key default uuid_generate_v7(),
  token_hash      text not null unique,
  owner_account_id uuid references owner_account(id) on delete cascade,
  staff_user_id   uuid references staff_user(id) on delete cascade,
  issued_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  absolute_expiry timestamptz not null,
  revoked_at      timestamptz,
  -- exactly one principal per session
  constraint session_one_principal check (
    (owner_account_id is not null)::int + (staff_user_id is not null)::int = 1
  )
);
create index on session (owner_account_id) where revoked_at is null;
