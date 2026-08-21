begin;

select plan(4);

select has_function('public', 'get_dashboard_financial_summary', array['date', 'date', 'text', 'uuid'],
  'financial summary RPC remains installed');
select is_definer('public', 'get_dashboard_financial_summary', array['date', 'date', 'text', 'uuid'],
  'financial summary RPC remains security definer');

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.dashboard_user_profiles
   where role = 'owner' and is_active order by created_at limit 1),
  true
);

select lives_ok(
  $$select * from public.get_dashboard_financial_summary(null, null, null, null)$$,
  'lifetime financial summary resolves without ambiguous output columns'
);
select is(
  (select count(*) from public.get_dashboard_financial_summary(null, null, null, null)),
  1::bigint,
  'lifetime financial summary returns exactly one row'
);

select * from finish();
rollback;
