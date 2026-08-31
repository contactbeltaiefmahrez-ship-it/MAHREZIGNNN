-- 008 · The search projection.
--
-- Architecture 02.2 declares `search_document` as the search module's own table,
-- and 06.1 argues search should stay in CORE so the index cannot lag the record.
-- Both hold if the projection is written IN THE SAME TRANSACTION as the business
-- change: boundary-clean AND lag-free. See ADR-018.

create table search_document (
  business_id      uuid primary key references business(id) on delete cascade,
  name_ar          text not null,
  name_fr          text,
  name_normalized  text not null,
  aliases          text[] not null default '{}',
  delegation_code  text not null,
  category_id      uuid not null,
  trust_level      trust_level not null,
  searchable       boolean not null default true,
  index_version    smallint not null default 1,
  updated_at       timestamptz not null default now()
);
create index search_doc_trgm_ix on search_document using gin (name_normalized gin_trgm_ops);
create index search_doc_alias_ix on search_document using gin (aliases);
create index search_doc_searchable_ix on search_document (searchable) where searchable;

-- Backfill anything already published.
insert into search_document
  (business_id,name_ar,name_fr,name_normalized,aliases,delegation_code,category_id,trust_level,searchable)
select id,name_ar,name_fr,name_normalized,aliases,delegation_code,category_id,trust_level,
       (state='PUBLISHED' and deleted_at is null)
  from business
on conflict (business_id) do nothing;
