begin;

select plan(12);

select has_function('public', 'get_dashboard_procurement_summary', array[]::text[],
  'procurement summary has a protected read RPC');
select has_function('public', 'get_dashboard_data_quality_checks', array[]::text[],
  'data-quality checks have a protected read RPC');
select function_lang_is('public', 'get_dashboard_procurement_summary', array[]::text[], 'plpgsql',
  'procurement summary RPC uses plpgsql');
select function_lang_is('public', 'get_dashboard_data_quality_checks', array[]::text[], 'plpgsql',
  'data-quality RPC uses plpgsql');
select is_definer('public', 'get_dashboard_procurement_summary', array[]::text[],
  'procurement summary RPC is security definer');
select is_definer('public', 'get_dashboard_data_quality_checks', array[]::text[],
  'data-quality RPC is security definer');
select function_privs_are('public', 'get_dashboard_procurement_summary', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated users may execute the procurement summary RPC');
select function_privs_are('public', 'get_dashboard_data_quality_checks', array[]::text[], 'authenticated', array['EXECUTE'],
  'authenticated users may execute the data-quality RPC');
select function_privs_are('public', 'get_dashboard_procurement_summary', array[]::text[], 'anon', array[]::text[],
  'anonymous users cannot execute the procurement summary RPC');
select function_privs_are('public', 'get_dashboard_data_quality_checks', array[]::text[], 'anon', array[]::text[],
  'anonymous users cannot execute the data-quality RPC');
select has_trigger('public', 'expenses', 'expenses_protect_allocated_procurement',
  'expenses protect allocated procurement records');
select is_definer('public', 'dashboard_protect_allocated_procurement_expense', array[]::text[],
  'allocated-procurement protection trigger is security definer');

select * from finish();
rollback;
