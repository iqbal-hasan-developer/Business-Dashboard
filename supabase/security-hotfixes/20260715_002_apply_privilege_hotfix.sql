-- REVIEW ONLY UNTIL EXPLICITLY APPROVED.
-- Minimal transactional ACL hotfix for the exact existing function overload.
-- This script does not call the function, read product rows, change stock,
-- change ownership, or replace/alter the function body.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $hotfix_guard$
declare
  target_oid oid := pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )::oid;
begin
  if target_oid is null then
    raise exception
      'Hotfix aborted: public.decrement_product_stock(uuid,integer) was not found.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.oid = target_oid
      and p.prosecdef
      and pg_catalog.pg_get_function_result(p.oid) = 'boolean'
  ) then
    raise exception
      'Hotfix aborted: the target is not the expected SECURITY DEFINER boolean function.';
  end if;

  if pg_catalog.to_regrole('anon') is null
     or pg_catalog.to_regrole('authenticated') is null
     or pg_catalog.to_regrole('service_role') is null then
    raise exception
      'Hotfix aborted: one or more expected Supabase roles are missing.';
  end if;
end
$hotfix_guard$;

revoke execute on function public.decrement_product_stock(uuid, integer)
  from public;

revoke execute on function public.decrement_product_stock(uuid, integer)
  from anon;

revoke execute on function public.decrement_product_stock(uuid, integer)
  from authenticated;

grant execute on function public.decrement_product_stock(uuid, integer)
  to service_role;

commit;
