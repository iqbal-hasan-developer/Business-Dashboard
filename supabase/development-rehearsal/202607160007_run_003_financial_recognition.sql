-- DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.
-- SQL Editor runner for
-- supabase/tests/database/003_financial_recognition.test.sql.
-- Buffers every pgTAP line so all assertions and the final plan are returned
-- in one visible result set. All synthetic records are rolled back.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = public, extensions, pg_catalog;

create temporary table pg_temp.pgtap_results (
  result_order bigint generated always as identity primary key,
  tap_result text not null
) on commit drop;

do $setup_plan$
begin
  perform no_plan();
end
$setup_plan$;

create temporary table financial_test_ids (
  name text primary key,
  id uuid not null
) on commit drop;

insert into financial_test_ids values
  ('category', gen_random_uuid()),
  ('product', gen_random_uuid()),
  ('delivered_order', gen_random_uuid()),
  ('pending_order', gen_random_uuid());

insert into public.categories (id, name, slug)
select id, 'Financial fixture', 'financial-fixture-' || id
from financial_test_ids where name = 'category';

insert into public.products (
  id, category_id, name, slug, price, stock, sku
)
select
  product.id,
  category.id,
  'Financial fixture product',
  'financial-fixture-product-' || product.id,
  125,
  10,
  'FIN-' || product.id
from financial_test_ids as product
cross join financial_test_ids as category
where product.name = 'product' and category.name = 'category';

insert into public.product_business_data (
  product_id, buying_price, buying_price_verified_at
)
select id, 60, now()
from financial_test_ids where name = 'product';

insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, sales_channel, dashboard_order_status,
  dashboard_payment_status, settlement_status, discount_amount,
  refund_amount, courier_cost_snapshot, packaging_cost_snapshot
)
select
  id,
  'FIN-DELIVERED-' || id,
  'Test customer',
  '00000000000',
  'Test address',
  'Inside Dhaka',
  'cod',
  'unpaid',
  'pending',
  200,
  50,
  240,
  'Website',
  'Pending',
  'Unpaid',
  'Not Applicable',
  10,
  0,
  30,
  10
from financial_test_ids where name = 'delivered_order';

insert into public.order_items (
  order_id, product_id, product_name, product_slug, unit_price, quantity,
  line_total, actual_unit_selling_price
)
select
  orders.id,
  product.id,
  'Financial fixture product',
  'financial-fixture-product-' || product.id,
  100,
  2,
  200,
  100
from financial_test_ids as orders
cross join financial_test_ids as product
where orders.name = 'delivered_order' and product.name = 'product';

insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select count(*) from public.order_financial_snapshots
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  0::bigint,
  'a non-Delivered order has no recognized financial snapshot'
);

update public.orders
set order_status = 'delivered', dashboard_order_status = 'Delivered'
where id = (
  select id from financial_test_ids where name = 'delivered_order'
);
set constraints dashboard_capture_delivered_snapshot immediate;

insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select count(*) from public.order_financial_snapshots
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  1::bigint,
  'Delivered recognition creates exactly one immutable snapshot'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select recognized_product_revenue
    from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  200.00::numeric,
  'recognized product revenue reconciles to Delivered item revenue'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select net_revenue from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  240.00::numeric,
  'net revenue reconciles with delivery charge and discount'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select recognized_cogs from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  120.00::numeric,
  'COGS reconciles to verified buying-cost snapshots'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select gross_profit from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  120.00::numeric,
  'gross profit reconciles to net revenue less COGS'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select contribution_profit from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  80.00::numeric,
  'contribution profit includes frozen courier and packaging costs'
);

update public.products
set price = 999
where id = (select id from financial_test_ids where name = 'product');
update public.product_business_data
set buying_price = 999, buying_price_verified_at = now()
where product_id = (select id from financial_test_ids where name = 'product');

insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select product_revenue from public.order_financial_snapshots
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  200.00::numeric,
  'later product price changes do not rewrite recognized revenue'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select cogs from public.order_financial_snapshots
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  120.00::numeric,
  'later buying-cost changes do not rewrite recognized COGS'
);

insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, sales_channel, dashboard_order_status,
  dashboard_payment_status, settlement_status
)
select
  id,
  'FIN-PENDING-' || id,
  'Test customer',
  '00000000000',
  'Test address',
  'Inside Dhaka',
  'bkash',
  'pending',
  'pending',
  999,
  0,
  999,
  'Website',
  'Pending',
  'Unpaid',
  'Not Applicable'
from financial_test_ids where name = 'pending_order';

insert into public.order_items (
  order_id, product_id, product_name, product_slug, unit_price, quantity,
  line_total, actual_unit_selling_price
)
select
  orders.id,
  product.id,
  'Financial fixture product',
  'financial-fixture-product-' || product.id,
  999,
  1,
  999,
  999
from financial_test_ids as orders
cross join financial_test_ids as product
where orders.name = 'pending_order' and product.name = 'product';

insert into pg_temp.pgtap_results (tap_result)
select is(
  (select product_revenue from public.dashboard_reconciliation),
  200.00::numeric,
  'non-Delivered item revenue is excluded from Product Revenue'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (select average_order_value from public.dashboard_reconciliation),
  240.00::numeric,
  'Average Order Value uses only recognized Delivered orders'
);

update public.orders
set refund_amount = 20
where id = (
  select id from financial_test_ids where name = 'delivered_order'
);

insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select recognized_refund_amount
    from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  20.00::numeric,
  'post-recognition refunds are append-only adjustments'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select net_revenue from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  220.00::numeric,
  'adjusted net revenue reconciles after a refund'
);
insert into pg_temp.pgtap_results (tap_result)
select is(
  (
    select contribution_profit from public.dashboard_order_financials
    where order_id = (
      select id from financial_test_ids where name = 'delivered_order'
    )
  ),
  60.00::numeric,
  'adjusted contribution profit reconciles after a refund'
);

insert into pg_temp.pgtap_results (tap_result)
select finish_result
from finish() as finish_result;

select tap_result
from pg_temp.pgtap_results
order by result_order;

rollback;
