begin;

select plan(5);

select has_column(
  'public', 'dashboard_order_financials', 'recognized_courier_cost',
  'Delivered financials expose immutable courier or transportation cost'
);
select has_column(
  'public', 'dashboard_order_financials', 'recognized_packaging_cost',
  'Delivered financials expose immutable packaging cost'
);
select col_type_is(
  'public', 'dashboard_order_financials', 'recognized_courier_cost', 'numeric(14,2)',
  'courier cost keeps an exact numeric database type'
);
select col_type_is(
  'public', 'dashboard_order_financials', 'recognized_packaging_cost', 'numeric(14,2)',
  'packaging cost keeps an exact numeric database type'
);
select is(
  (
    select count(*)
    from public.dashboard_order_financials as financial
    where financial.fulfillment_costs_complete
      and financial.gross_profit - financial.contribution_profit
        is distinct from financial.recognized_courier_cost
          + financial.recognized_packaging_cost
  ),
  0::bigint,
  'courier and packaging components reconcile to the contribution-profit deduction'
);

select * from finish();
rollback;
