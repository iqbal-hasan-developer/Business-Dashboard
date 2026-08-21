begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_function('public','dashboard_expense_category_allowed',array['text'],'expense category allowlist exists');
select has_function('public','edit_dashboard_expense',array['uuid','date','text','text','numeric','text','uuid','text','text','text','timestamp with time zone'],'audited expense edit RPC exists');
select has_function('public','delete_dashboard_expense',array['uuid','text','timestamp with time zone'],'audited expense delete RPC exists');
select ok(
  has_function_privilege('authenticated','public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('anon','public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)','EXECUTE')
  and not has_function_privilege('service_role','public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)','EXECUTE'),
  'expense edit is authenticated-dashboard-only'
);
select ok(
  pg_get_functiondef('public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)'::regprocedure) ~* 'for update'
  and pg_get_functiondef('public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)'::regprocedure) ~* 'expected_updated_at',
  'expense edit locks and checks freshness'
);
select ok(
  pg_get_functiondef('public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)'::regprocedure) ~* 'trunc\(p_amount, 2\)'
  and pg_get_functiondef('public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'expense edit preserves exact decimal money'
);
select ok(
  pg_get_functiondef('public.delete_dashboard_expense(uuid,text,timestamptz)'::regprocedure) ~* 'array\[''owner''\]'
  and pg_get_functiondef('public.delete_dashboard_expense(uuid,text,timestamptz)'::regprocedure) ~* 'audit_reason',
  'expense deletion is owner-only and requires audit context'
);
select ok(
  pg_get_functiondef('public.edit_dashboard_expense(uuid,date,text,text,numeric,text,uuid,text,text,text,timestamptz)'::regprocedure) ~* 'cash_movements[[:space:]]+where[[:space:]]+expense_id'
  and pg_get_functiondef('public.delete_dashboard_expense(uuid,text,timestamptz)'::regprocedure) ~* 'cash_movements[[:space:]]+where[[:space:]]+expense_id',
  'linked cash evidence blocks expense mutation'
);
select ok(
  public.dashboard_expense_category_allowed('inventory_purchase')
  and public.dashboard_expense_category_allowed('freight_in')
  and public.dashboard_expense_category_allowed('business_transportation')
  and public.dashboard_expense_category_allowed('product_purchase')
  and public.dashboard_expense_category_allowed('transportation')
  and public.dashboard_expense_category_allowed('financial_fees')
  and public.dashboard_expense_category_allowed('other')
  and not public.dashboard_expense_category_allowed('advertising'),
  'current expense categories are controlled and advertising stays in its own ledger'
);

select * from finish();
rollback;
