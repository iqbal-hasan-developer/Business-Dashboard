-- DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create extension if not exists pgtap with schema extensions;

do $verify_pgtap$
begin
  if not exists (
    select 1
    from pg_catalog.pg_extension as extension
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = extension.extnamespace
    where extension.extname = 'pgtap'
      and namespace.nspname = 'extensions'
  ) then
    raise exception 'pgTAP was not installed in the extensions schema.';
  end if;
end
$verify_pgtap$;

commit;

select
  extension.extname as extension_name,
  namespace.nspname as extension_schema,
  extension.extversion as extension_version
from pg_catalog.pg_extension as extension
join pg_catalog.pg_namespace as namespace
  on namespace.oid = extension.extnamespace
where extension.extname = 'pgtap';
