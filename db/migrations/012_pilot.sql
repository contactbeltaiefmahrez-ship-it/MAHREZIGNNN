-- 012 · Pilot execution: origin classification, windows, corridors, traffic
-- segmentation, support and incidents, configuration freeze.

-- ── The hazard this closes -------------------------------------------------
-- Before this migration, a business with source_code IS NULL counted as "real"
-- in any naive query, because only 'FIXTURE' was excluded. Test-suite rows had
-- no source at all. Investor metrics computed that way would silently include
-- test data — exactly what Phase 09 §52 forbids.
-- Origin is now an explicit, NOT NULL classification. There is no null case.
create type data_origin as enum ('REAL', 'FIXTURE', 'TEST');

alter table data_source add column origin data_origin not null default 'REAL';
update data_source set origin = 'FIXTURE' where kind = 'FIXTURE';

alter table business add column origin data_origin;
update business set origin = case
  when source_code = 'FIXTURE' then 'FIXTURE'::data_origin
  when source_code is null     then 'TEST'::data_origin   -- unmarked = test, never real
  else 'REAL'::data_origin end;
alter table business alter column origin set not null;
alter table business alter column origin set default 'TEST';

-- A REAL business must name an approved source. Real data cannot be anonymous.
alter table business add constraint real_requires_source
  check (origin <> 'REAL' or source_code is not null);

create index business_origin_ix on business (origin) where deleted_at is null;

-- ── Pilot structure --------------------------------------------------------
create type pilot_window_state as enum ('PLANNED','OPEN','FROZEN','CLOSED','ABORTED');

create table pilot_corridor (
  code        text primary key,
  name_ar     text not null,
  name_fr     text not null,
  density     text not null check (density in ('DENSE','MEDIUM','DISPERSED')),
  delegations text[] not null
);
insert into pilot_corridor (code,name_ar,name_fr,density,delegations) values
  ('A','تونس المركز','Tunis Centre','DENSE',      array['TUN-CENTRE']),
  ('B','المرسى','La Marsa','MEDIUM',              array['TUN-MARSA']),
  ('C','بن عروس','Ben Arous','DISPERSED',         array['BEN-RADES']);

create table pilot_window (
  id            uuid primary key default uuid_generate_v7(),
  ordinal       smallint not null unique,
  label         text not null,
  target_min    integer not null,
  target_max    integer not null,
  state         pilot_window_state not null default 'PLANNED',
  dataset_version_id uuid references pilot_dataset_version(id),
  -- Configuration freeze (§50): metrics are reproducible or they are not metrics.
  frozen_config jsonb,
  opened_at     timestamptz,
  frozen_at     timestamptz,
  closed_at     timestamptz,
  exit_decision text check (exit_decision in ('CONTINUE','ITERATE','PAUSE','STOP')),
  exit_evidence text,
  created_at    timestamptz not null default now()
);
insert into pilot_window (ordinal,label,target_min,target_max) values
  (0,'Window 0 — internal verification',0,0),
  (1,'Window 1 — first real businesses',10,25),
  (2,'Window 2 — expansion',50,100),
  (3,'Window 3 — pilot dataset',600,900);

-- ── Traffic segmentation (§42). Investor metrics must never include internal
--    traffic, so the segment is a column, not a convention.
create type traffic_segment as enum ('INTERNAL','OPS','BUSINESS','TEST_USER','ORGANIC','BOT');

alter table event_telemetry add column traffic_segment traffic_segment not null default 'ORGANIC';
alter table event_record   add column traffic_segment traffic_segment not null default 'ORGANIC';
create index event_telemetry_segment_ix on event_telemetry (traffic_segment, name, occurred_at desc);
create index event_record_segment_ix on event_record (traffic_segment, name, occurred_at desc);

-- Devices we know are not organic users.
create table traffic_exclusion (
  device_or_session text primary key,
  segment           traffic_segment not null,
  note              text,
  created_at        timestamptz not null default now()
);

-- ── Support and incidents (§28, §29)
create table support_ticket (
  id          uuid primary key default uuid_generate_v7(),
  severity    text not null check (severity in ('P0','P1','P2','P3')),
  reporter    text not null check (reporter in ('BUSINESS','USER','OPS','SYSTEM')),
  business_id uuid references business(id),
  issue_type  text not null,
  summary     text not null,
  state       text not null default 'OPEN' check (state in ('OPEN','ACKNOWLEDGED','RESOLVED','WONTFIX')),
  root_cause  text,
  opened_at   timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index support_open_ix on support_ticket (severity, opened_at) where state = 'OPEN';

create table pilot_incident (
  id          uuid primary key default uuid_generate_v7(),
  severity    text not null check (severity in ('P0','P1','P2','P3')),
  title       text not null,
  detected_at timestamptz not null default now(),
  contained_at timestamptz, resolved_at timestamptz,
  cause       text, remediation text,
  -- Hiding a problem by editing data is itself the incident.
  data_modified boolean not null default false,
  created_at  timestamptz not null default now()
);

create table pilot_decision_log (
  id          uuid primary key default uuid_generate_v7(),
  window_id   uuid references pilot_window(id),
  decision    text not null,
  evidence    text not null,
  decided_by  uuid references staff_user(id),
  decided_at  timestamptz not null default now()
);
