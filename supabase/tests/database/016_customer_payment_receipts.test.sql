begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'public',
  'record_customer_payment_receipt',
  array['uuid','timestamptz','date','text','uuid'],
  'controlled customer payment receipt RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)', 'EXECUTE'),
  'only authenticated dashboard callers can reach the receipt RPC'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'cash_movements_customer_payment_order_unique'
  ),
  'one original customer payment receipt is allowed per order'
);
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.cash_movements'::regclass
        and conname = 'cash_movements_transaction_type_allowed')
  ) ~* 'customer_payment',
  'cash transaction classification allows customer payments'
);
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.cash_movements'::regclass
        and conname = 'cash_movements_customer_payment_shape')
  ) ~* 'order_id IS NOT NULL',
  'customer payments must be order-linked inflows'
);
select ok(
  pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) ~* 'order_financial_snapshots'
  and pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) !~* 'p_amount|p_account_key',
  'receipt amount and account are derived after locking the order'
);
select ok(
  pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.](orders|cash_movements|products|order_financial_snapshots)'
  and pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from',
  'receipt workflow appends cash without rewriting business records'
);
select ok(
  pg_get_functiondef('public.record_customer_payment_receipt(uuid,timestamptz,date,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'receipt workflow uses exact database money without floating point'
);

select * from finish();
rollback;
