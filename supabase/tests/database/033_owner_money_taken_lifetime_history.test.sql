begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_view(
  'public',
  'dashboard_owner_money_taken_lifetime_history',
  'owner money taken has one authoritative row-level lifetime history'
);

select columns_are(
  'public',
  'dashboard_owner_money_taken_lifetime_history',
  array[
    'id', 'event_date', 'owner_label', 'event_type', 'amount',
    'capital_return_amount', 'excess_due_amount', 'source_account_key',
    'source_account_label', 'cash_movement_id', 'capital_return_id',
    'owner_held_event_id', 'reversal_of_id', 'is_reversed', 'description',
    'reference', 'created_at', 'record_source', 'can_reverse'
  ],
  'lifetime history keeps its repository contract'
);

select ok(
  not has_table_privilege('anon', 'public.dashboard_owner_money_taken_lifetime_history', 'SELECT')
  and has_table_privilege('authenticated', 'public.dashboard_owner_money_taken_lifetime_history', 'SELECT'),
  'lifetime owner history remains private and dashboard-readable'
);

select ok(
  not exists (
    select 1
    from public.dashboard_owner_money_taken_lifetime_history
    where amount <> capital_return_amount + excess_due_amount
      or amount < 0
      or capital_return_amount < 0
      or excess_due_amount < 0
  ),
  'every lifetime history row has an exact non-negative capital and Due split'
);

select ok(
  not exists (
    select 1
    from public.dashboard_owner_money_taken_lifetime_history
    where can_reverse is distinct from (
      record_source = 'unified' and event_type = 'taken' and not is_reversed
    )
  ),
  'only active unified workflow rows expose the atomic reversal action'
);

select ok(
  pg_get_viewdef('public.dashboard_owner_money_taken_lifetime_history'::regclass, true)
    ~* 'dashboard_owner_money_taken_history'
  and pg_get_viewdef('public.dashboard_owner_money_taken_lifetime_history'::regclass, true)
    ~* 'dashboard_owner_held_funds'
  and pg_get_viewdef('public.dashboard_owner_money_taken_lifetime_history'::regclass, true)
    ~* 'dashboard_owner_capital_returns'
  and pg_get_viewdef('public.dashboard_owner_money_taken_lifetime_history'::regclass, true)
    ~* 'owner_held_event_id = held[.]id'
  and pg_get_viewdef('public.dashboard_owner_money_taken_lifetime_history'::regclass, true)
    ~* 'capital_return_id = capital[.]id',
  'lifetime history combines all approved sources and excludes linked duplicates'
);

select is(
  (
    select sum(amount)::numeric
    from public.dashboard_owner_money_taken_lifetime_history
    where event_type = 'taken' and not is_reversed
  ),
  33834.00::numeric,
  'active lifetime history reconciles to Owner money taken'
);

select is(
  (
    select sum(capital_return_amount)::numeric
    from public.dashboard_owner_money_taken_lifetime_history
    where event_type = 'taken' and not is_reversed
  ),
  25120.00::numeric,
  'active lifetime history reconciles to the capital-return portion'
);

select is(
  (
    select sum(excess_due_amount)::numeric
    from public.dashboard_owner_money_taken_lifetime_history
    where event_type = 'taken' and not is_reversed
  ),
  8714.00::numeric,
  'active lifetime history reconciles to the Due-created portion'
);

select is(
  (
    select count(*)
    from public.dashboard_owner_money_taken_lifetime_history
    where event_type = 'taken' and not is_reversed
  ),
  6::bigint,
  'Development lifetime history exposes all six active classifications'
);

select ok(
  exists (
    select 1
    from public.dashboard_owner_money_taken_lifetime_history
    where owner_label = 'Ikbal'
  )
  and not exists (
    select 1
    from public.dashboard_owner_money_taken_lifetime_history
    where lower(owner_label) = 'iqbal'
  ),
  'lifetime history preserves canonical owner identity Ikbal'
);

select * from finish();
rollback;
