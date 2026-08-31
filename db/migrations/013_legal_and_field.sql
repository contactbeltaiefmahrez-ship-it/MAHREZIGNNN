-- 013 · Legal decision ingestion, legal-basis registry, field collection.
--
-- Gap this closes: `import_batch.legal_basis_ref` accepted ANY string. Window 0
-- published with the literal 'WINDOW0-INTERNAL-TEST-NOT-A-LEGAL-BASIS'. For TEST
-- data that is honest labelling; for REAL data it would be a fabricated legal
-- basis passing a gate that only checked for non-null. A REAL batch must now
-- reference a registered, active basis that traces to a recorded counsel decision.

-- ── Counsel decisions, recorded exactly as returned (§42).
create table legal_decision (
  id                 uuid primary key default uuid_generate_v7(),
  decision_ref       text not null unique,        -- e.g. 'D-11.Q3/2026-09'
  question_id        text not null,               -- 'D-11.Q3'
  counsel_name       text not null,
  counsel_firm       text,
  decided_on         date not null,
  decision           text not null,
  scope              text not null,
  conditions         text,
  review_by          date,
  document_reference text,                        -- pointer, not the document
  recorded_by        uuid references staff_user(id),
  created_at         timestamptz not null default now()
);
comment on column legal_decision.document_reference is
  'Reference only. Legal correspondence is NOT stored in this database.';

-- ── A legal basis is a named permission built from one or more decisions.
create table legal_basis (
  ref            text primary key,
  description    text not null,
  decision_refs  text[] not null default '{}',
  data_categories text[] not null default '{}',   -- which D-12 categories it covers
  granted_on     date,
  expires_on     date,
  active         boolean not null default false,
  created_at     timestamptz not null default now(),
  -- A basis cannot be active without at least one recorded counsel decision.
  constraint active_requires_decision
    check (not active or array_length(decision_refs, 1) >= 1)
);

/**
 * A REAL batch may only publish against a registered, active legal basis.
 * TEST and FIXTURE batches may carry a descriptive label, because labelling
 * test data honestly is not the same as claiming a legal permission.
 */
create or replace function enforce_real_legal_basis() returns trigger
language plpgsql as $$
declare
  src_origin data_origin;
  basis_ok boolean;
begin
  if new.published_at is null then return new; end if;
  select origin into src_origin from data_source where code = new.source_code;
  if src_origin is distinct from 'REAL' then return new; end if;

  select exists (
    select 1 from legal_basis
     where ref = new.legal_basis_ref
       and active
       and (expires_on is null or expires_on >= current_date)
  ) into basis_ok;

  if not basis_ok then
    raise exception
      'REAL batch requires a registered, active legal basis (got %). Register the counsel decision first.',
      coalesce(new.legal_basis_ref, 'null')
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger import_batch_real_legal_basis
  before insert or update on import_batch
  for each row execute function enforce_real_legal_basis();

-- ── Business participation / authorization (§18, §19). DRAFT until counsel review.
create table business_participation (
  id                  uuid primary key default uuid_generate_v7(),
  staging_id          uuid references staging_business(id) on delete cascade,
  business_id         uuid references business(id) on delete set null,
  public_display_name text not null,
  representative_role text not null
    check (representative_role in ('OWNER','MANAGER','AUTHORISED_STAFF','UNKNOWN')),
  authorisation_method text not null
    check (authorisation_method in ('IN_PERSON_SIGNED','IN_PERSON_VERBAL_WITNESSED',
                                    'WRITTEN_MESSAGE','EMAIL','NONE')),
  authorised_fields   text[] not null default '{}',
  authorised_on       date,
  evidence_media_id   uuid references media_object(id),
  collector_staff_id  uuid references staff_user(id),
  legal_basis_ref     text references legal_basis(ref),
  withdrawn_at        timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  -- An authorisation that names no fields authorises nothing.
  constraint authorisation_names_fields
    check (authorisation_method = 'NONE' or array_length(authorised_fields, 1) >= 1)
);
create index participation_business_ix on business_participation (business_id);

-- ── Field collection metadata on staging (§26)
alter table staging_business
  add column collector_staff_id uuid references staff_user(id),
  add column collected_at timestamptz,
  add column coordinate_method text
    check (coordinate_method in ('GPS_ON_SITE','MAP_REFERENCE','OWNER_CONFIRMED','GEOCODED','UNKNOWN')),
  add column coordinate_precision_m integer,
  add column evidence_kind text
    check (evidence_kind in ('OWNER_CONFIRMATION','OFFICIAL_WEBSITE','AUTHORISED_SOURCE',
                             'FIELD_OBSERVATION','BUSINESS_DOCUMENT','LICENSED_DATASET','NONE')),
  add column participation_id uuid references business_participation(id),
  add column selection_reason text;

-- ── Source licensing evidence (§44). Unknown must remain UNKNOWN.
alter table data_source
  add column source_url text,
  add column terms_checked_on date,
  add column terms_evidence text,
  add column derivative_database text
    check (derivative_database in ('PERMITTED','PROHIBITED','CONDITIONAL','UNKNOWN')),
  add column counsel_status text not null default 'PENDING_COUNSEL'
    check (counsel_status in ('APPROVED_FOR_PILOT','PENDING_COUNSEL','REJECTED','UNKNOWN'));

-- A source may only be marked approved-for-pilot with licence evidence recorded.
alter table data_source add constraint approved_requires_evidence
  check (counsel_status <> 'APPROVED_FOR_PILOT'
         or (terms_checked_on is not null and terms_evidence is not null));
