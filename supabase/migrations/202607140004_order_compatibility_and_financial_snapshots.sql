alter table public.orders
  add column if not exists order_date date,
  add column if not exists external_reference text,
  add column if not exists customer_location text,
  add column if not exists courier text,
  add column if not exists sales_channel text,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists campaign_name_snapshot text,
  add column if not exists dashboard_order_status text,
  add column if not exists dashboard_payment_status text,
  add column if not exists settlement_status text,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists refund_amount numeric(12,2) not null default 0,
  add column if not exists courier_cost_snapshot numeric(12,2),
  add column if not exists packaging_cost_snapshot numeric(12,2) not null default 0;

update public.orders set
  order_date = coalesce(order_date, created_at::date),
  customer_location = coalesce(customer_location, case when lower(delivery_area) like '%outside%' then 'Outside Dhaka' else 'Inside Dhaka' end),
  courier = coalesce(courier, 'Steadfast'),
  sales_channel = coalesce(sales_channel, 'Website'),
  campaign_name_snapshot = coalesce(campaign_name_snapshot, 'Always-on'),
  dashboard_order_status = coalesce(dashboard_order_status, case lower(order_status)
    when 'pending' then 'Pending' when 'confirmed' then 'Confirmed' when 'processing' then 'Confirmed'
    when 'shipped' then 'Dispatched' when 'delivered' then 'Delivered' when 'cancelled' then 'Cancelled' else 'Pending' end),
  dashboard_payment_status = coalesce(dashboard_payment_status, case lower(payment_status)
    when 'verified' then 'Paid' when 'refunded' then 'Refunded' else 'Unpaid' end),
  settlement_status = coalesce(settlement_status, 'Not Applicable')
where order_date is null or customer_location is null or courier is null or sales_channel is null
   or campaign_name_snapshot is null or dashboard_order_status is null
   or dashboard_payment_status is null or settlement_status is null;

alter table public.order_items
  add column if not exists sku_snapshot text,
  add column if not exists list_price_snapshot numeric(12,2),
  add column if not exists buying_cost_snapshot numeric(12,2),
  add column if not exists actual_unit_selling_price numeric(12,2);

update public.order_items set
  sku_snapshot = coalesce(sku_snapshot, product_slug),
  list_price_snapshot = coalesce(list_price_snapshot, unit_price),
  actual_unit_selling_price = coalesce(actual_unit_selling_price, unit_price)
where sku_snapshot is null or list_price_snapshot is null or actual_unit_selling_price is null;

create table if not exists public.order_financial_snapshots (
  order_id uuid primary key references public.orders(id) on delete cascade,
  recognition_status text not null,
  product_revenue numeric(12,2) not null,
  delivery_revenue numeric(12,2) not null,
  discount_amount numeric(12,2) not null,
  refund_amount numeric(12,2) not null,
  net_revenue numeric(12,2) not null,
  cogs numeric(12,2),
  courier_cost numeric(12,2) not null,
  packaging_cost numeric(12,2) not null,
  recognized_at timestamptz not null,
  snapshot_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_financial_snapshots_status_delivered check (recognition_status = 'Delivered'),
  constraint order_financial_snapshots_values_nonnegative check (
    product_revenue >= 0 and delivery_revenue >= 0 and discount_amount >= 0 and refund_amount >= 0
    and net_revenue >= 0 and (cogs is null or cogs >= 0) and courier_cost >= 0 and packaging_cost >= 0
  )
);

