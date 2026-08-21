begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_function('public', 'update_business_financial_defaults',
  array['text','bigint','bigint','bigint','integer'],
  'atomic owner settings RPC exists');
select has_function('public', 'get_business_order_defaults', array[]::text[], 'role-gated order defaults RPC exists');
select ok(
  has_function_privilege('authenticated', 'public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)', 'EXECUTE'),
  'only authenticated dashboard callers can reach the settings RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_business_order_defaults()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_business_order_defaults()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.get_business_order_defaults()', 'EXECUTE'),
  'only authenticated dashboard callers can reach the defaults reader'
);
select ok(
  procedure.prosecdef and exists (
    select 1
    from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
    where split_part(setting, '=', 1) = 'search_path'
      and btrim(split_part(setting, '=', 2), '"') = ''
  ),
  'settings RPC is SECURITY DEFINER with an empty fixed search path'
)
from pg_proc procedure
where procedure.oid = 'public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)'::regprocedure;

select is((select setting_value from public.business_settings where setting_key = 'currency'), '"BDT"'::jsonb, 'currency is BDT');
select is((select setting_value from public.business_settings where setting_key = 'business_timezone'), '"Asia/Dhaka"'::jsonb, 'timezone is Asia/Dhaka');
select is((select setting_value from public.business_settings where setting_key = 'inside_dhaka_courier_cost_poisha'), '6500'::jsonb, 'Inside Dhaka default is 6500 poisha');
select is((select setting_value from public.business_settings where setting_key = 'outside_dhaka_courier_cost_poisha'), '11500'::jsonb, 'Outside Dhaka default is 11500 poisha');
select is((select setting_value from public.business_settings where setting_key = 'packaging_cost_per_order_poisha'), '200'::jsonb, 'packaging default is 200 poisha');
select is((select setting_value from public.business_settings where setting_key = 'tax_vat_basis_points'), '0'::jsonb, 'tax default is zero basis points');
select is((select count(*) from public.business_lookup_values where lookup_type = 'cash_account' and is_active), 5::bigint, 'five active cash accounts are seeded');
select ok(not has_table_privilege('anon', 'public.business_settings', 'SELECT'), 'anonymous settings reads remain denied');
select ok(not has_table_privilege('authenticated', 'public.business_settings', 'INSERT'), 'authenticated direct settings inserts remain denied');
select ok(
  pg_get_functiondef('public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)'::regprocedure)
    !~* 'update[[:space:]]+public[.]orders',
  'changing defaults cannot rewrite historical orders'
);
select ok(
  pg_get_functiondef('public.update_business_financial_defaults(text,bigint,bigint,bigint,integer)'::regprocedure)
    !~* 'double precision|[[:space:]]real[[:space:]]',
  'settings RPC contains no floating-point financial path'
);

select * from finish();
rollback;
