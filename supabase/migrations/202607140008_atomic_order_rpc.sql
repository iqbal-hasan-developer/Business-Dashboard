create or replace function public.create_dashboard_order(p_order jsonb, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_order_id uuid;
  item_count integer;
  matched_count integer;
  product_subtotal numeric(12,2);
  cogs_total numeric(12,2);
  delivery_amount numeric(12,2) := coalesce((p_order ->> 'delivery_charged')::numeric, 0);
  discount_amount numeric(12,2) := coalesce((p_order ->> 'discount_amount')::numeric, 0);
  refund_amount numeric(12,2) := coalesce((p_order ->> 'refund_amount')::numeric, 0);
  courier_cost numeric(12,2) := coalesce((p_order ->> 'courier_cost_snapshot')::numeric, 0);
  packaging_cost numeric(12,2) := coalesce((p_order ->> 'packaging_cost_snapshot')::numeric, 0);
  dashboard_status text := coalesce(p_order ->> 'order_status', 'Pending');
  dashboard_payment text := coalesce(p_order ->> 'payment_status', 'Unpaid');
  legacy_status text;
  legacy_payment_status text;
  legacy_payment_method text := lower(coalesce(p_order ->> 'payment_method', 'cod'));
begin
  if not public.dashboard_has_any_role(array['owner','admin','data_entry']::public.dashboard_role[]) then
    raise exception 'Not authorized to create dashboard orders' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required' using errcode = '22023';
  end if;
  if legacy_payment_method not in ('cod', 'bkash', 'nagad') then
    raise exception 'Payment method is not compatible with the existing storefront schema' using errcode = '22023';
  end if;
  if dashboard_status not in ('Pending','Confirmed','Dispatched','Delivered','Cancelled','Returned','Refunded','Failed Delivery') then
    raise exception 'Invalid dashboard order status' using errcode = '22023';
  end if;
  if delivery_amount < 0 or discount_amount < 0 or refund_amount < 0 or courier_cost < 0 or packaging_cost < 0 then
    raise exception 'Money values cannot be negative' using errcode = '22023';
  end if;

  with requested as (
    select * from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer, actual_unit_selling_price numeric)
  ), priced as (
    select requested.*, product.price, business.buying_price
    from requested
    join public.products product on product.id = requested.product_id
    join public.product_business_data business on business.product_id = product.id
    where requested.quantity > 0 and requested.actual_unit_selling_price >= 0
  )
  select jsonb_array_length(p_items), count(*),
         coalesce(sum(quantity * actual_unit_selling_price), 0),
         coalesce(sum(quantity * buying_price), 0)
  into item_count, matched_count, product_subtotal, cogs_total
  from priced;

  if matched_count <> item_count then
    raise exception 'Every item must reference a product with private business data and valid quantity/price' using errcode = '22023';
  end if;

  legacy_status := case dashboard_status
    when 'Pending' then 'pending' when 'Confirmed' then 'confirmed' when 'Dispatched' then 'shipped'
    when 'Delivered' then 'delivered' else 'cancelled' end;
  legacy_payment_status := case dashboard_payment
    when 'Paid' then 'verified' when 'Refunded' then 'refunded' else 'unpaid' end;

  insert into public.orders (
    order_number, customer_name, customer_phone, customer_address, delivery_area, customer_note,
    payment_method, payment_status, order_status, subtotal, delivery_charge, total,
    order_date, external_reference, customer_location, courier, sales_channel, campaign_id,
    campaign_name_snapshot, dashboard_order_status, dashboard_payment_status, settlement_status,
    discount_amount, refund_amount, courier_cost_snapshot, packaging_cost_snapshot
  ) values (
    p_order ->> 'order_number', p_order ->> 'customer_name', p_order ->> 'customer_phone',
    p_order ->> 'customer_address', p_order ->> 'delivery_area', nullif(p_order ->> 'customer_note', ''),
    legacy_payment_method, legacy_payment_status, legacy_status, product_subtotal, delivery_amount,
    product_subtotal + delivery_amount - discount_amount,
    coalesce((p_order ->> 'order_date')::date, (now() at time zone 'Asia/Dhaka')::date), nullif(p_order ->> 'external_reference', ''),
    p_order ->> 'customer_location', coalesce(p_order ->> 'courier', 'Steadfast'),
    coalesce(p_order ->> 'sales_channel', 'Other'), nullif(p_order ->> 'campaign_id', '')::uuid,
    coalesce(p_order ->> 'campaign_name', 'Always-on'), dashboard_status, dashboard_payment,
    coalesce(p_order ->> 'settlement_status', 'Not Applicable'), discount_amount, refund_amount,
    courier_cost, packaging_cost
  ) returning id into new_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, product_slug, unit_price, quantity, line_total,
    sku_snapshot, list_price_snapshot, buying_cost_snapshot, actual_unit_selling_price
  )
  select new_order_id, product.id, product.name, product.slug, requested.actual_unit_selling_price,
         requested.quantity, requested.actual_unit_selling_price * requested.quantity,
         coalesce(business.sku_override, product.sku, product.slug), product.price, business.buying_price,
         requested.actual_unit_selling_price
  from jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer, actual_unit_selling_price numeric)
  join public.products product on product.id = requested.product_id
  join public.product_business_data business on business.product_id = product.id;

  if dashboard_status = 'Delivered' then
    insert into public.order_financial_snapshots (
      order_id, recognition_status, product_revenue, delivery_revenue, discount_amount, refund_amount,
      net_revenue, cogs, courier_cost, packaging_cost, recognized_at, created_by
    ) values (
      new_order_id, 'Delivered', product_subtotal, delivery_amount, discount_amount, refund_amount,
      greatest(product_subtotal + delivery_amount - discount_amount - refund_amount, 0),
      cogs_total, courier_cost, packaging_cost, now(), (select auth.uid())
    );
  end if;

  return new_order_id;
end $$;

revoke all on function public.create_dashboard_order(jsonb, jsonb) from public;
grant execute on function public.create_dashboard_order(jsonb, jsonb) to authenticated;
