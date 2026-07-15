-- EMERGENCY ROLLBACK ONLY -- REOPENS THE CONFIRMED EXPOSURE.
-- Do not run without a separate explicit approval and evidence that the
-- service_role-preserving hotfix broke the deployed checkout path.
-- This script does not call the function or change product/stock data.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $rollback_guard$
begin
  if pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  ) is null then
    raise exception
      'Rollback aborted: public.decrement_product_stock(uuid,integer) was not found.';
  end if;

  if pg_catalog.to_regrole('anon') is null
     or pg_catalog.to_regrole('authenticated') is null
     or pg_catalog.to_regrole('service_role') is null then
    raise exception
      'Rollback aborted: one or more expected Supabase roles are missing.';
  end if;
end
$rollback_guard$;

-- These grants deliberately restore the exposed privilege state.
grant execute on function public.decrement_product_stock(uuid, integer)
  to public;

grant execute on function public.decrement_product_stock(uuid, integer)
  to anon;

grant execute on function public.decrement_product_stock(uuid, integer)
  to authenticated;

grant execute on function public.decrement_product_stock(uuid, integer)
  to service_role;

commit;
