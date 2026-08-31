-- 009 · Real-data ingestion: staging, provenance, coordinate confidence, quality.
-- Nothing external ever writes to `business` directly (Phase 06 §35).

create type coord_confidence as enum ('VERIFIED','HIGH','MEDIUM','LOW','UNKNOWN');
create type staging_state    as enum ('RAW','NORMALIZED','VALIDATED','REJECTED','DUPLICATE','APPROVED','PUBLISHED');
create type dup_class        as enum ('CONFIRMED','PROBABLE','POSSIBLE','DISTINCT');
create type source_kind      as enum ('OSM','OFFICIAL_DIRECTORY','BUSINESS_WEBSITE','FIELD_COLLECTION',
                                      'BUSINESS_SUBMISSION','MANUAL_VERIFICATION','FOUNDER_PROVIDED','FIXTURE');

-- Every source is registered with its licence BEFORE any record from it lands.
create table data_source (
  code                text primary key,
  kind                source_kind not null,
  display_name        text not null,
  license             text not null,
  attribution_required boolean not null default false,
  attribution_text    text,
  commercial_use      boolean not null,
  redistribution      boolean not null,
  automated_extraction_permitted boolean not null,
  reliability         smallint not null check (reliability between 1 and 5),
  update_frequency    text,
  notes               text,
  approved_by         text,
  approved_at         timestamptz,
  constraint attribution_text_required
    check (not attribution_required or attribution_text is not null)
);

alter table business
  add column coordinate_confidence coord_confidence not null default 'UNKNOWN',
  add column source_code   text references data_source(code),
  add column source_record_id text,
  add column source_timestamp timestamptz,
  add column last_verified_at timestamptz,
  add column quality_score smallint not null default 0 check (quality_score between 0 and 100);

create index business_low_confidence_ix on business (coordinate_confidence)
  where coordinate_confidence in ('LOW','UNKNOWN');

-- A LOW/UNKNOWN coordinate must never be presented as exact truth on the map,
-- so it cannot be PUBLISHED without an explicit ops decision recorded as
-- MEDIUM or better. Enforced, not documented.
alter table business add constraint published_needs_locatable_coord
  check (state <> 'PUBLISHED' or coordinate_confidence in ('VERIFIED','HIGH','MEDIUM'));

alter table import_batch
  add column source_code text references data_source(code),
  add column state text not null default 'OPEN'
      check (state in ('OPEN','VALIDATED','REJECTED','PUBLISHED','ROLLED_BACK')),
  add column stats jsonb,
  add column rolled_back_at timestamptz;

-- Staging. External data lands here and nowhere else.
create table staging_business (
  id              uuid primary key default uuid_generate_v7(),
  batch_id        uuid not null references import_batch(id) on delete cascade,
  raw             jsonb not null,
  -- display values, preserved verbatim (Phase 06 §11)
  name_ar         text, name_fr         text,
  name_normalized text,
  aliases         text[] not null default '{}',
  phone_e164      text, website         text,
  address_text    text,
  governorate     text, delegation_code text,
  lon             double precision, lat double precision,
  category_slug   text,
  coordinate_confidence coord_confidence not null default 'UNKNOWN',
  source_record_id text,
  source_timestamp timestamptz,
  state           staging_state not null default 'RAW',
  errors          jsonb not null default '[]'::jsonb,
  warnings        jsonb not null default '[]'::jsonb,
  quality_score   smallint,
  dup_class       dup_class,
  dup_of_business_id uuid references business(id),
  dup_score       numeric(4,3),
  published_business_id uuid references business(id),
  created_at      timestamptz not null default now()
);
create index staging_batch_state_ix on staging_business (batch_id, state);
create index staging_name_trgm_ix on staging_business using gin (name_normalized gin_trgm_ops);
create index staging_geom_ix on staging_business
  (batch_id) where lon is not null and lat is not null;

-- Ops review queue for ambiguous duplicates (Phase 06 §12).
create table duplicate_review (
  id            uuid primary key default uuid_generate_v7(),
  staging_id    uuid not null references staging_business(id) on delete cascade,
  business_id   uuid not null references business(id),
  dup_class     dup_class not null,
  score         numeric(4,3) not null,
  signals       jsonb not null,
  decision      text check (decision in ('MERGE','KEEP_BOTH','DISCARD_IMPORT')),
  decided_by    uuid references staff_user(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (staging_id, business_id)
);
create index duplicate_review_open_ix on duplicate_review (created_at) where decision is null;

-- The OSM extract that produced the delegation codes. Version + attribution are
-- recorded in CORE even though the geometry never is (ODbL lineage, Phase 06 §38).
create table geo_lineage (
  id             serial primary key,
  extract_source text not null,
  extract_version text not null,
  license        text not null,
  attribution    text not null,
  feature_count  integer,
  recorded_at    timestamptz not null default now(),
  active         boolean not null default false
);
