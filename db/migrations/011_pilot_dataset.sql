-- 011 · Pilot dataset versioning (Phase 08 §39) and source registry completion.
-- Metrics must be reproducible: we must be able to say which businesses were in
-- the dataset, from which version, at which moment.

create table pilot_dataset_version (
  id            uuid primary key default uuid_generate_v7(),
  label         text not null unique,
  notes         text,
  frozen_at     timestamptz,
  frozen_by     uuid references staff_user(id),
  business_count integer,
  created_at    timestamptz not null default now()
);

create table pilot_dataset_member (
  version_id    uuid not null references pilot_dataset_version(id) on delete cascade,
  business_id   uuid not null references business(id) on delete cascade,
  trust_at_freeze trust_level not null,
  quality_at_freeze smallint not null,
  primary key (version_id, business_id)
);

-- Acquisition metadata the registry needs but did not yet carry (§17).
alter table data_source
  add column acquired_at date,
  add column legal_reference text,
  add column geographic_scope text,
  add column import_version text,
  add column quality_status text
      check (quality_status in ('UNKNOWN','DRAFT','ASSESSED','APPROVED'));

-- Unknown must stay UNKNOWN: no default that quietly asserts a licence.
update data_source set quality_status = 'UNKNOWN' where quality_status is null;
