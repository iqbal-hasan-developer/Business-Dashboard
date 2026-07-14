begin;
select plan(18);

select has_table('public', 'dashboard_user_profiles', 'dashboard profiles table exists');
select has_table('public', 'product_business_data', 'private product data table exists');
select has_table('public', 'campaigns', 'campaigns table exists');
select has_table('public', 'daily_ad_spend', 'ad spend table exists');
select has_table('public', 'expenses', 'expenses table exists');
select has_table('public', 'settlement_records', 'settlements table exists');
select has_table('public', 'cash_movements', 'cash movements table exists');
select has_table('public', 'audit_history', 'audit history table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.product_business_data'::regclass), 'private product data has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'orders have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.order_items'::regclass), 'order items have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.expenses'::regclass), 'expenses have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_history'::regclass), 'audit history has RLS');

select policies_are('public', 'product_business_data', array['Dashboard role read','Dashboard role insert','Dashboard role update','Dashboard role delete']);
select policies_are('public', 'orders', array['Dashboard role read','Dashboard role insert','Dashboard role update','Dashboard role delete']);
select policies_are('public', 'order_items', array['Dashboard role read','Dashboard role insert','Dashboard role update','Dashboard role delete']);
select policies_are('public', 'audit_history', array['Dashboard administrators read audit history']);
select function_privs_are('public', 'create_dashboard_order', array['jsonb','jsonb'], 'authenticated', array['EXECUTE']);

select * from finish();
rollback;
