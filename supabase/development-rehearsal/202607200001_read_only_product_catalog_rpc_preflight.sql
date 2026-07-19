-- Run in NexaNotion Business Dashboard Dev before considering 202607200000.
do $development_gate$
begin
  if '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
     is distinct from 'NexaNotion Business Dashboard Dev' then
    raise exception 'Development breadcrumb confirmation is missing.';
  end if;
end
$development_gate$;

with checks as (
  select
    '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__' =
      'NexaNotion Business Dashboard Dev' as development_breadcrumb_confirmed,
    to_regclass('public.products') is not null
      and to_regclass('public.product_business_data') is not null
      and to_regclass('public.categories') is not null as required_catalog_tables_exist,
    exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid = 'public.products'::regclass and conname = 'products_slug_key'
    ) as product_slug_unique_constraint_exists,
    to_regclass('public.products_sku_ci_uidx') is not null
      and to_regclass('public.product_business_data_sku_override_uidx') is not null
      as sku_uniqueness_indexes_exist,
    not exists (
      select 1 from public.products group by lower(btrim(slug)) having count(*) > 1
    ) as case_insensitive_product_slugs_are_unique,
    to_regprocedure('public.dashboard_has_any_role(public.dashboard_role[])') is not null
      as role_gate_exists,
    to_regprocedure('public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)') is null
      and to_regprocedure('public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)') is null
      as product_management_rpcs_are_pending,
    not has_table_privilege('authenticated', 'public.products', 'INSERT')
      and not has_table_privilege('authenticated', 'public.products', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.product_business_data', 'INSERT')
      and not has_table_privilege('authenticated', 'public.product_business_data', 'UPDATE')
      as authenticated_direct_catalog_writes_denied
)
select *,
  development_breadcrumb_confirmed
    and required_catalog_tables_exist
    and product_slug_unique_constraint_exists
    and sku_uniqueness_indexes_exist
    and case_insensitive_product_slugs_are_unique
    and role_gate_exists
    and product_management_rpcs_are_pending
    and authenticated_direct_catalog_writes_denied
    as followup_application_allowed,
  not (
    development_breadcrumb_confirmed
    and required_catalog_tables_exist
    and product_slug_unique_constraint_exists
    and sku_uniqueness_indexes_exist
    and case_insensitive_product_slugs_are_unique
    and role_gate_exists
    and product_management_rpcs_are_pending
    and authenticated_direct_catalog_writes_denied
  ) as stop_required
from checks;
