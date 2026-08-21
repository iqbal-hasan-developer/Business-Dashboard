begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  category_id uuid := gen_random_uuid();
  v_product_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  merchandise_expense_id uuid := gen_random_uuid();
  freight_expense_id uuid := gen_random_uuid();
  batch_id uuid;
  v_order_item_id uuid;
  before_known numeric(14,2);
begin
  select user_id into actor_id
  from public.dashboard_user_profiles
  where role = 'owner' and is_active
  order by created_at limit 1;
  if actor_id is null then raise exception 'Runtime test requires one active owner.'; end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select known_inventory_value into before_known
  from public.dashboard_procurement_summary;

  insert into public.categories(id, name, slug)
  values(category_id, 'Procurement runtime fixture', 'procurement-runtime-' || category_id);
  insert into public.products(id, category_id, name, slug, price, stock, sku)
  values(v_product_id, category_id, 'Procurement runtime product',
    'procurement-runtime-product-' || v_product_id, 10, 3, 'PROC-' || v_product_id);
  insert into public.product_business_data(product_id, buying_price, buying_price_verified_at)
  values(v_product_id, 60, now());

  insert into public.expenses(
    id, expense_date, category_key, description, amount, payment_method,
    created_by, updated_by
  ) values
    (merchandise_expense_id, current_date, 'inventory_purchase',
      'Rollback purchase batch merchandise', 9.99, 'cash', actor_id, actor_id),
    (freight_expense_id, current_date, 'freight_in',
      'Rollback purchase batch freight', 0.02, 'cash', actor_id, actor_id);
  insert into public.cash_movements(
    movement_date, movement_type, transaction_type, account_key, amount,
    expense_id, description, created_by
  ) values
    (current_date, 'outflow', 'expense', 'cash', 9.99,
      merchandise_expense_id, 'Rollback procurement cash outflow', actor_id),
    (current_date, 'outflow', 'expense', 'cash', 0.02,
      freight_expense_id, 'Rollback freight cash outflow', actor_id);

  batch_id := public.record_purchase_batch(
    current_date, 'Runtime supplier', 'RUNTIME-001', 'Rollback-only batch',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'quantity', 3,
      'supplier_unit_cost_poisha', 333
    )),
    jsonb_build_array(
      jsonb_build_object('expense_id', merchandise_expense_id,
        'allocation_type', 'merchandise', 'allocated_poisha', 999),
      jsonb_build_object('expense_id', freight_expense_id,
        'allocation_type', 'freight', 'allocated_poisha', 2)
    )
  );

  if (select allocated_freight_poisha from public.purchase_batch_items
      where purchase_batch_id = batch_id) <> 2
     or (select known_inventory_value from public.dashboard_procurement_summary)
        <> before_known + 10.01 then
    raise exception 'Posted procurement did not increase exact landed inventory value.';
  end if;

  insert into public.orders(
    id, order_number, customer_name, customer_phone, customer_address,
    delivery_area, payment_method, payment_status, order_status, subtotal,
    delivery_charge, total, sales_channel, dashboard_order_status,
    dashboard_payment_status, settlement_status, discount_amount,
    refund_amount, courier_cost_snapshot, packaging_cost_snapshot
  ) values (
    v_order_id, 'PROC-RUNTIME-' || v_order_id, 'Runtime customer', '00000000000',
    'Runtime address', 'Inside Dhaka', 'cod', 'unpaid', 'pending', 10,
    0, 10, 'Website', 'Pending', 'Unpaid', 'Not Applicable', 0, 0, 0, 0
  );
  insert into public.order_items(
    order_id, product_id, product_name, product_slug, unit_price, quantity,
    line_total, actual_unit_selling_price
  ) values (
    v_order_id, v_product_id, 'Procurement runtime product',
    'procurement-runtime-product-' || v_product_id, 10, 1, 10, 10
  ) returning id into v_order_item_id;

  if exists (select 1 from public.order_item_inventory_consumptions
      where order_item_id = v_order_item_id)
     or exists (select 1 from public.order_financial_snapshots
      where order_id = v_order_id) then
    raise exception 'Pending order recognized inventory or COGS.';
  end if;

  update public.orders
  set order_status = 'delivered', dashboard_order_status = 'Delivered'
  where id = v_order_id;
  set constraints dashboard_capture_delivered_snapshot immediate;

  if (select cogs from public.order_financial_snapshots where order_id = v_order_id)
       <> 3.34
     or (select landed_cogs_poisha from public.order_item_inventory_consumptions
         where order_item_id = v_order_item_id) <> 334
     or (select supplier_cogs_poisha from public.order_item_financial_allocations
         where order_item_id = v_order_item_id) <> 333
     or (select freight_cogs_poisha from public.order_item_financial_allocations
         where order_item_id = v_order_item_id) <> 1
     or (select known_inventory_value from public.dashboard_procurement_summary)
        <> before_known + 6.67 then
    raise exception 'Delivered landed COGS or remaining inventory did not reconcile.';
  end if;

  update public.product_business_data set buying_price = 999 where product_id = v_product_id;
  if (select cogs from public.order_financial_snapshots where order_id = v_order_id)
       <> 3.34 then
    raise exception 'Mutable product cost rewrote historical Delivered COGS.';
  end if;
end
$test$;

select 'purchase, cash, freight, inventory, and Delivered landed COGS runtime contract passed' as result;
rollback;
