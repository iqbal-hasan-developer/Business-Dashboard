begin;
select plan(4);

select ok(
  exists (select 1 from pg_catalog.pg_extension where extname = 'pg_trgm'),
  'pg_trgm is installed for the PostgreSQL 17 target'
);
select ok(
  (select n.nspname = 'extensions'
   from pg_catalog.pg_extension e
   join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm'),
  'pg_trgm is installed in the expected extensions schema'
);
select is(
  (select count(*)::integer from pg_catalog.pg_indexes
   where schemaname = 'public' and indexname like '%\_trgm\_idx' escape '\'
     and indexdef like '%extensions.gin_trgm_ops%'),
  13,
  'all migration 006 trigram indexes use the installed operator class'
);

create temporary table pg_trgm_ci_probe (value text) on commit drop;
insert into pg_trgm_ci_probe(value)
select 'synthetic search fixture ' || n from generate_series(1, 20000) n;
insert into pg_trgm_ci_probe(value) values ('phase4c-unique-search-token');
create index pg_trgm_ci_probe_idx on pg_trgm_ci_probe using gin (value extensions.gin_trgm_ops);
analyze pg_trgm_ci_probe;
select is(
  (select count(*)::integer from pg_trgm_ci_probe where value ilike '%unique-search-token%'),
  1,
  'the trigram operator class supports the substring search used by the app'
);

select * from finish();
rollback;
