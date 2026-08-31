-- 007 · Zero-result capture. The one analytics exception that stores a query in
-- clear text (MVP Specification 19.3): a business people search for and cannot
-- find is a sales lead, not telemetry.
create table search_zero_result (
  id               uuid primary key default uuid_generate_v7(),
  query_text       text not null,
  query_normalized text not null,
  device_hash      text not null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index search_zero_norm_ix on search_zero_result (query_normalized, created_at desc);
