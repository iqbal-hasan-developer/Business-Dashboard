begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_column('public', 'settlement_records', 'receiving_method', 'settlements snapshot receiving method');
select has_column('public', 'settlement_records', 'gross_cod_amount', 'settlements store gross COD');
select has_column('public', 'settlement_records', 'idempotency_key', 'settlements store idempotency key');
select has_column('public', 'settlement_records', 'confirmed_at', 'settlements store confirmation time');
select has_view('public', 'dashboard_steadfast_settlement_eligible_orders', 'eligible-order read model exists');
select has_view('public', 'dashboard_steadfast_settlement_batches', 'batch-history read model exists');
select has_view('public', 'dashboard_steadfast_settlement_batch_orders', 'batch allocation read model exists');
select has_function('public', 'record_steadfast_cod_settlement', array['date','text','numeric','numeric','numeric','jsonb','uuid','text','text','text','text','text'], 'atomic settlement RPC exists');

select ok(
  procedure.prosecdef and exists (
    select 1
    from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
    where split_part(setting, '=', 1) = 'search_path'
      and btrim(split_part(setting, '=', 2), '"') = ''
  ),
  'settlement RPC is SECURITY DEFINER with an empty fixed search path'
)
from pg_proc procedure
where procedure.oid = 'public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure;

select ok(
  not has_function_privilege('authenticated', 'public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)', 'EXECUTE'),
  'retired v1 settlement RPC cannot bypass the current v3 workflow'
);

select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'expected_updated_at'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'dashboard_steadfast_settlement_eligible_orders',
  'settlement RPC locks and revalidates current eligible orders'
);

select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]settlement_records'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]settlement_order_allocations'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) ~* 'settlement_status = ''Settled''',
  'one RPC creates the batch, allocations, cash receipt, and Settled evidence'
);

select ok(
  pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) !~* 'update[[:space:]]+public[.]products'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) !~* 'order_financial_snapshots'
  and pg_get_functiondef('public.record_steadfast_cod_settlement(date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text)'::regprocedure) !~* 'payment_status[[:space:]]*=',
  'settlement RPC has no stock, financial-snapshot, or payment-status mutation path'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'settlement_order_allocations_order_history_idx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cash_movements_settlement_unique')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'settlement_records_idempotency_key_unique'),
  'unique evidence and idempotency indexes are installed'
);

select * from finish();
rollback;
