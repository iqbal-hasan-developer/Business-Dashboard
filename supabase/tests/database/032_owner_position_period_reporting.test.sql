begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_view(
  'public',
  'dashboard_owner_position_daily',
  'owner period reporting has one authoritative active classification view'
);

select columns_are(
  'public',
  'dashboard_owner_position_daily',
  array[
    'owner_label',
    'event_date',
    'owner_money_taken_in_period',
    'capital_return_in_period',
    'excess_due_in_period'
  ],
  'owner period reporting keeps its repository contract'
);

select ok(
  not has_table_privilege('anon', 'public.dashboard_owner_position_daily', 'SELECT')
  and has_table_privilege('authenticated', 'public.dashboard_owner_position_daily', 'SELECT'),
  'owner period reporting remains private and readable by dashboard users'
);

select ok(
  not exists (
    select 1
    from public.dashboard_owner_position_daily
    where owner_money_taken_in_period <> capital_return_in_period + excess_due_in_period
      or owner_money_taken_in_period < 0
      or capital_return_in_period < 0
      or excess_due_in_period < 0
  ),
  'every active daily classification is non-negative and decomposes exactly'
);

select ok(
  pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'dashboard_owner_held_funds'
  and pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'dashboard_owner_capital_returns'
  and pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'dashboard_owner_money_taken_history'
  and pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'not .*is_reversed'
  and pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'owner_held_event_id'
  and pg_get_viewdef('public.dashboard_owner_position_daily'::regclass, true) ~* 'capital_return_id',
  'the view combines legacy and unified sources while excluding reversals and linked duplicates'
);

select * from finish();
rollback;
