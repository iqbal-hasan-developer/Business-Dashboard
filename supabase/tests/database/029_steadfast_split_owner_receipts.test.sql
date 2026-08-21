begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','settlement_receipt_allocations','split owner receipts use a normalized immutable child table');
select has_view('public','dashboard_steadfast_settlement_receipt_allocations','allocation history has a private read model');
select has_function('public','record_steadfast_cod_settlement_v3',array['date','text','text','jsonb','numeric','numeric','numeric','jsonb','uuid','text','text','text','text','text'],'split settlement posting is atomic');
select has_column('public','settlement_receipt_allocations','owner_held_event_id','each allocation links its Due-from-Owner event');
select has_column('public','settlement_receipt_allocations','reversal_of_id','allocation reversal evidence is append-only');

select ok(
  (select relrowsecurity from pg_class where oid='public.settlement_receipt_allocations'::regclass)
  and not has_table_privilege('anon','public.settlement_receipt_allocations','SELECT')
  and not has_table_privilege('authenticated','public.settlement_receipt_allocations','INSERT')
  and not has_table_privilege('authenticated','public.settlement_receipt_allocations','UPDATE')
  and not has_table_privilege('authenticated','public.settlement_receipt_allocations','DELETE'),
  'RLS and privileges prevent unauthorized reads and direct financial mutation'
);
select ok(
  has_function_privilege('authenticated','public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)','EXECUTE')
  and not has_function_privilege('service_role','public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)','EXECUTE'),
  'only authenticated dashboard callers can reach split settlement posting'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='settlement_receipt_allocations_active_owner_uidx')
  and exists (select 1 from pg_indexes where schemaname='public' and indexname='settlement_receipt_allocations_reversal_uidx')
  and exists (select 1 from pg_indexes where schemaname='public' and indexname='settlement_receipt_allocations_settlement_idx'),
  'duplicate owners, duplicate reversals, and settlement lookups are indexed'
);
select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'sum\(amount\)'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'allocation_total <> p_net_received'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'count\(distinct'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'pg_advisory_xact_lock'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'posting validates exact totals and unique owners with serialized exact-money writes'
);
select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]settlement_records'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]settlement_order_allocations'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]settlement_receipt_allocations'
  and pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]owner_held_fund_events',
  'one transaction creates the batch, order links, owner allocations, and Due-from-Owner events'
);
select ok(
  pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'for allocation in'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]settlement_receipt_allocations'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_held_fund_events'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from',
  'reversal appends an exact reversal for every allocation without deleting history'
);
select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement_v3(date,text,text,jsonb,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) !~* 'owner_investment|order_financial_snapshots|order_financial_adjustments|products'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'owner_investment|order_financial_snapshots|order_financial_adjustments|products',
  'posting and reversal do not mutate capital, Delivered economics, refunds, or inventory'
);

select * from finish();
rollback;
