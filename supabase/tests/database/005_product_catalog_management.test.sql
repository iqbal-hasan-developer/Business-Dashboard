-- Requires 202607200000 and one active owner profile. All fixtures roll back.
begin;
create temporary table pgtap_005_result_buffer (
  result_order bigint generated always as identity primary key,
  tap_result text not null
) on commit drop;

grant insert (tap_result)
on table pg_temp.pgtap_005_result_buffer
to authenticated;

grant usage
on sequence pg_temp.pgtap_005_result_buffer_result_order_seq
to authenticated;

set local search_path = public, extensions, pg_catalog;
do $pgtap_plan$
begin
  perform no_plan();
end
$pgtap_plan$;

insert into pg_temp.pgtap_005_result_buffer (tap_result)
select has_function('public', 'create_dashboard_product',
  array['text','text','text','numeric','boolean','uuid','numeric','integer','text','text','text'],
  'product create RPC has the reviewed signature');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select has_function('public', 'update_dashboard_product',
  array['uuid','text','text','text','numeric','boolean','uuid','numeric','integer','text','text','text'],
  'product update RPC has the reviewed signature');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok((
  select procedure.prosecdef and language.lanname = 'plpgsql'
  from pg_proc as procedure
  join pg_language as language on language.oid = procedure.prolang
  where procedure.oid =
    'public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'::regprocedure
), 'create is a PL/pgSQL security definer');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok((
  select procedure.prosecdef and language.lanname = 'plpgsql'
  from pg_proc as procedure
  join pg_language as language on language.oid = procedure.prolang
  where procedure.oid =
    'public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'::regprocedure
), 'update is a PL/pgSQL security definer');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok((
  select count(*) = 1
    and bool_and(
      btrim(
        substring(configuration from length('search_path=') + 1),
        '"'
      ) = ''
    )
  from pg_proc as procedure
  cross join lateral unnest(coalesce(procedure.proconfig, array[]::text[]))
    as configuration
  where procedure.oid =
      'public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'::regprocedure
    and split_part(configuration, '=', 1) = 'search_path'
), 'create has a fixed empty search path');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok((
  select count(*) = 1
    and bool_and(
      btrim(
        substring(configuration from length('search_path=') + 1),
        '"'
      ) = ''
    )
  from pg_proc as procedure
  cross join lateral unnest(coalesce(procedure.proconfig, array[]::text[]))
    as configuration
  where procedure.oid =
      'public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'::regprocedure
    and split_part(configuration, '=', 1) = 'search_path'
), 'update has a fixed empty search path');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select function_privs_are('public', 'create_dashboard_product',
  array['text','text','text','numeric','boolean','uuid','numeric','integer','text','text','text'],
  'authenticated', array['EXECUTE'], 'authenticated alone executes create');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select function_privs_are('public', 'update_dashboard_product',
  array['uuid','text','text','text','numeric','boolean','uuid','numeric','integer','text','text','text'],
  'authenticated', array['EXECUTE'], 'authenticated alone executes update');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok(not has_function_privilege('anon',
  'public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)', 'EXECUTE'),
  'anon cannot create products');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok(not has_function_privilege('service_role',
  'public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)', 'EXECUTE'),
  'service role has no product management expansion');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok(not has_table_privilege('authenticated','public.products','INSERT')
  and not has_table_privilege('authenticated','public.product_business_data','INSERT'),
  'authenticated direct product inserts remain denied');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok(to_regclass('public.products_slug_ci_uidx') is not null,
  'case-insensitive product slug uniqueness is enforced');

do $owner_context$
declare
  owner_id text;
begin
  select user_id::text into owner_id
  from public.dashboard_user_profiles
  where role = 'owner' and is_active
  order by created_at
  limit 1;
  perform set_config('request.jwt.claim.sub', owner_id, true);
end
$owner_context$;

set local role authenticated;
do $create_fixture$
begin
  perform set_config('pgtap.product_id', public.create_dashboard_product(
    'pgTAP product', 'pgtap-product-20260720', 'PGTAP-20260720', 199.99,
    true, null, 80.25, 4, 'PGTAP-DASH-20260720', 'Default', 'rollback only'
  )::text, true);
end
$create_fixture$;
reset role;

insert into pg_temp.pgtap_005_result_buffer (tap_result)
select ok(current_setting('pgtap.product_id')::uuid is not null,
  'create returns one product id');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select is((select stock from public.products
  where id = current_setting('pgtap.product_id')::uuid),
  0::integer, 'created stock is exactly zero');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select is((select price from public.products
  where id = current_setting('pgtap.product_id')::uuid),
  199.99::numeric, 'selling price remains exact numeric');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select is((select buying_price from public.product_business_data
  where product_id = current_setting('pgtap.product_id')::uuid),
  80.25::numeric, 'private buying price is atomically persisted');

set local role authenticated;
do $update_fixture$
begin
  perform public.update_dashboard_product(
    current_setting('pgtap.product_id')::uuid, 'pgTAP product edited',
    'pgtap-product-20260720', 'PGTAP-20260720', 209.99, false,
    null, 81.25, 5, 'PGTAP-DASH-20260720', 'Edited',
    'rollback only edited'
  );
end
$update_fixture$;
reset role;

insert into pg_temp.pgtap_005_result_buffer (tap_result)
select is((select stock from public.products
  where id = current_setting('pgtap.product_id')::uuid),
  0::integer, 'catalog update never changes stock');
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select is((select buying_price from public.product_business_data
  where product_id = current_setting('pgtap.product_id')::uuid),
  81.25::numeric, 'catalog update keeps private cost exact');

set local role authenticated;
insert into pg_temp.pgtap_005_result_buffer (tap_result)
select throws_ok($$select public.create_dashboard_product(
  'duplicate', 'pgtap-product-20260720', 'PGTAP-OTHER', 1, true,
  null, 0, 0, null, null, null)$$, '23505', null,
  'duplicate slug is rejected');
reset role;

insert into pg_temp.pgtap_005_result_buffer (tap_result)
select finish_output.tap_output
from finish() with ordinality as finish_output(tap_output, finish_order)
order by finish_output.finish_order;

with expanded_tap_output as (
  select
    buffered_output.result_order as buffered_result_order,
    output_line.line_order,
    output_line.tap_result
  from pg_temp.pgtap_005_result_buffer as buffered_output
  cross join lateral pg_catalog.regexp_split_to_table(
    buffered_output.tap_result,
    E'\r?\n'
  ) with ordinality as output_line(tap_result, line_order)
)
select
  row_number() over (
    order by buffered_result_order, line_order
  )::bigint as result_order,
  tap_result
from expanded_tap_output
order by buffered_result_order, line_order;
rollback;
