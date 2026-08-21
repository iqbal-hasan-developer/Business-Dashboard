begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public', 'purchase_batches', 'purchase batches exist');
select has_table('public', 'purchase_batch_items', 'purchase batch items exist');
select has_table('public', 'procurement_expense_allocations', 'procurement expense allocations exist');
select has_table('public', 'order_item_inventory_consumptions', 'immutable Delivered inventory consumptions exist');
select has_view('public', 'dashboard_inventory_cost_layers', 'inventory layer reconciliation view exists');
select has_view('public', 'dashboard_procurement_summary', 'procurement summary view exists');
select has_function(
  'public', 'record_purchase_batch',
  array['date', 'text', 'text', 'text', 'jsonb', 'jsonb'],
  'secured purchase batch RPC exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.purchase_batches'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.purchase_batch_items'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.procurement_expense_allocations'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.order_item_inventory_consumptions'::regclass),
  'all procurement and inventory ledgers have RLS'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_purchase_batch(date,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.record_purchase_batch(date,text,text,text,jsonb,jsonb)',
    'EXECUTE'
  ),
  'purchase batch writes require an authenticated dashboard role'
);

select is(
  (select count(*) from public.expenses
   where accounting_class = 'operating_expense'
     and category_key in ('inventory_purchase', 'freight_in', 'unallocated_procurement')),
  0::bigint,
  'procurement categories are never classified as operating expense'
);
select is(
  (select inventory_purchase_total from public.dashboard_procurement_summary),
  46980.00::numeric,
  'all reviewed product and mixed procurement records total BDT 46,980'
);
select is(
  (select freight_in_total from public.dashboard_procurement_summary),
  1480.00::numeric,
  'all reviewed supplier transportation totals BDT 1,480 freight-in'
);
select is(
  (select unallocated_procurement_total from public.dashboard_procurement_summary),
  48460.00::numeric,
  'legacy procurement remains explicitly unallocated without SKU and batch evidence'
);
select is(
  (select known_inventory_value from public.dashboard_procurement_summary),
  0.00::numeric,
  'no precise legacy inventory value is fabricated'
);
select is(
  (select expenses from public.dashboard_reconciliation),
  (select coalesce(sum(amount), 0)::numeric from public.expenses
   where accounting_class = 'operating_expense'),
  'procurement is excluded from Operating Expenses'
);
select is(
  (select cogs from public.dashboard_reconciliation),
  (select sum(recognized_cogs)::numeric from public.dashboard_order_financials),
  'Delivered COGS reconciles to immutable order financials'
);
select is(
  (select net_profit from public.dashboard_reconciliation),
  (select (contribution_profit - ad_spend - expenses)::numeric
   from public.dashboard_reconciliation),
  'Net Profit deducts ad spend and operating expense once without procurement'
);

select is(
  (select sum(allocated_poisha)::bigint from public.dashboard_allocate_poisha(
    101, array[
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    ], array[100, 100, 300]::bigint[]
  )),
  101::bigint,
  'proportional freight allocation reconciles every poisha'
);
select is(
  (select allocated_poisha from public.dashboard_allocate_poisha(
    101, array[
      '00000000-0000-4000-8000-000000000001'::uuid,
      '00000000-0000-4000-8000-000000000002'::uuid,
      '00000000-0000-4000-8000-000000000003'::uuid
    ], array[100, 100, 300]::bigint[]
  ) where allocation_key = '00000000-0000-4000-8000-000000000003'::uuid),
  61::bigint,
  'largest remainder allocation is deterministic'
);

select ok(
  pg_get_functiondef('public.dashboard_capture_delivered_snapshot()'::regprocedure)
    ~* 'dashboard_order_status is distinct from ''Delivered'''
  and pg_get_functiondef('public.dashboard_capture_delivered_snapshot()'::regprocedure)
    ~* 'dashboard_consume_landed_inventory',
  'only Delivered recognition consumes landed inventory'
);
select ok(
  pg_get_functiondef('public.dashboard_capture_delivered_snapshot()'::regprocedure)
    ~* 'order_financial_snapshots'
  and pg_get_functiondef('public.dashboard_capture_delivered_snapshot()'::regprocedure)
    ~* 'on conflict \(order_id\) do nothing',
  'existing immutable Delivered snapshot semantics remain idempotent'
);
select ok(
  exists (select 1 from pg_trigger
    where tgrelid = 'public.order_item_inventory_consumptions'::regclass
      and tgname = 'order_item_inventory_consumptions_immutable'
      and not tgisinternal),
  'landed-cost consumption history is append-only'
);
select is(
  (select procurement_records_missing_cash_movement
   from public.dashboard_data_quality_checks),
  9::bigint,
  'missing historical procurement cash links are surfaced instead of guessed'
);
select is(
  (select advertising_duplicated_in_expenses
   from public.dashboard_data_quality_checks),
  0::bigint,
  'advertising remains separate from Expenses'
);
select is(
  (select purchase_batch_allocation_mismatches
   from public.dashboard_data_quality_checks),
  0::bigint,
  'posted batch totals reconcile'
);

select * from finish();
rollback;
