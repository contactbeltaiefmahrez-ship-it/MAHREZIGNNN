-- 002 · Business domain: shopfront, media, offers, claim, verification.

create table media_object (
  id            uuid primary key default uuid_generate_v7(),
  bucket        text not null check (bucket in ('public','private')),
  object_key    text not null,
  mime_type     text not null,
  byte_size     integer not null check (byte_size > 0),
  state         media_state not null default 'PENDING',
  reject_reason text,
  -- restricted media (verification documents) carries a retention timer
  retention_expires_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (bucket, object_key),
  -- a private object must never be servable without an expiry
  constraint private_media_has_retention
    check (bucket <> 'private' or retention_expires_at is not null)
);

create table business (
  id                uuid primary key default uuid_generate_v7(),
  name_ar           text not null check (length(btrim(name_ar)) > 0),
  name_fr           text,
  name_normalized   text not null,
  aliases           text[] not null default '{}',
  category_id       uuid not null references category(id),
  delegation_code   text not null references delegation(code),
  location          geometry(Point, 4326) not null,
  address_text      text,
  phone_e164        text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_e164     text,
  external_url      text,
  hours             jsonb,                      -- NULL = "not confirmed", never assumed open
  description       text check (description is null or length(description) <= 400),
  state             business_state not null default 'DRAFT',
  trust_level       trust_level not null default 'UNCLAIMED',
  owner_account_id  uuid references owner_account(id),
  completeness_score smallint not null default 0 check (completeness_score between 0 and 100),
  attention_weight  smallint not null default 1 check (attention_weight between 1 and 5),
  discovery_score   numeric(8,6) not null default 0,
  ranking_version   smallint not null default 1,
  last_owner_update_at timestamptz,
  provenance        jsonb not null,             -- source, batch, collector, collected_at
  import_batch_id   uuid,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Grand Tunis pilot boundary as a LITERAL. A CHECK cannot reference the GEO
  -- database and must not: CORE stays independent of GEO at runtime (05.5).
  constraint business_in_pilot_area check (
    ST_X(location) between 9.90 and 10.55 and ST_Y(location) between 36.55 and 37.10
  ),
  -- trust cannot exceed what ownership supports
  constraint trust_requires_owner check (
    trust_level = 'UNCLAIMED' or owner_account_id is not null
  )
);
create trigger business_touch before update on business
  for each row execute function touch_updated_at();

create index business_location_gix on business using gist (location);
create index business_viewport_ix on business (category_id, attention_weight desc, discovery_score desc)
  where state = 'PUBLISHED' and deleted_at is null;
create index business_name_trgm_ix on business using gin (name_normalized gin_trgm_ops);
create index business_aliases_ix on business using gin (aliases);
create index business_owner_ix on business (owner_account_id) where owner_account_id is not null;
create index business_delegation_ix on business (delegation_code, category_id);

create table business_photo_ref (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null references business(id) on delete cascade,
  media_id      uuid not null references media_object(id),
  sort_order    smallint not null check (sort_order between 0 and 5),
  created_at    timestamptz not null default now(),
  unique (business_id, sort_order),
  unique (business_id, media_id)
);

create table business_service (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null references business(id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 60),
  sort_order    smallint not null check (sort_order between 0 and 9),
  unique (business_id, sort_order)
);

create table offer (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null references business(id) on delete cascade,
  kind          offer_kind not null,
  value_num     numeric(6,2),
  subject       text not null check (length(btrim(subject)) between 1 and 40),
  validity      tstzrange not null,
  state         offer_state not null default 'DRAFT',
  reject_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- R33: maximum 30 days
  constraint offer_max_30_days check (
    upper(validity) - lower(validity) <= interval '30 days'
  ),
  constraint offer_value_required check (kind = 'FREE_ITEM' or value_num is not null)
);
-- R31: exactly one active offer per business, enforced by the database
create unique index offer_one_active_ix on offer (business_id)
  where state in ('PENDING_REVIEW','LIVE');
create index offer_live_ix on offer (business_id) where state = 'LIVE';

-- ── claim
create table claim (
  id             uuid primary key default uuid_generate_v7(),
  business_id    uuid not null references business(id) on delete cascade,
  claimant_phone text not null,
  method         claim_method not null,
  state          claim_state not null default 'CLAIM_PENDING',
  decided_by     uuid references staff_user(id),
  decision_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- Two people cannot both have a claim in flight on one business.
-- The database resolves the race; the application does not have to.
create unique index claim_one_active_ix on claim (business_id)
  where state in ('CLAIM_PENDING','OTP_VERIFIED','OPS_REVIEW','MINIMUM_PROFILE');
create index claim_phone_recent_ix on claim (claimant_phone, created_at desc);

create table claim_evidence (
  id          uuid primary key default uuid_generate_v7(),
  claim_id    uuid not null references claim(id) on delete cascade,
  media_id    uuid not null references media_object(id),
  note        text,
  created_at  timestamptz not null default now()
);

-- ── verification
create table verification (
  id            uuid primary key default uuid_generate_v7(),
  business_id   uuid not null references business(id) on delete cascade,
  evidence_type verif_evidence not null,
  state         verif_state not null default 'VERIFICATION_PENDING',
  reason_code   text,
  decided_by    uuid references staff_user(id),
  decided_at    timestamptz,
  resubmission_of uuid references verification(id),
  created_at    timestamptz not null default now()
);
create unique index verification_one_pending_ix on verification (business_id)
  where state = 'VERIFICATION_PENDING';

create table verification_document (
  id               uuid primary key default uuid_generate_v7(),
  verification_id  uuid not null references verification(id) on delete cascade,
  media_id         uuid not null references media_object(id),
  created_at       timestamptz not null default now()
);
