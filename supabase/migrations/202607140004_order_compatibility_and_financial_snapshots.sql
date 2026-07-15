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
  add column if not exists packaging_cost_snapshot numeric(12,2);

alter table public.order_items
  add column if not exists sku_snapshot text,
  add column if not exists list_price_snapshot numeric(12,2),
  add column if not exists buying_cost_snapshot numeric(12,2),
  add column if not exists actual_unit_selling_price numeric(12,2);

create table if not exists public.order_financial_snapshots (
  order_id uuid primary key references public.orders(id) on delete restrict,
  order_number_snapshot text not null,
  order_date date not null,
  sales_channel text not null,
  campaign_id uuid,
  campaign_name_snapshot text,
  payment_method text not null,
  settlement_status text not null,
  recognition_status text not null,
  product_revenue numeric(14,2) not null,
  delivery_revenue numeric(14,2) not null,
  discount_amount numeric(14,2) not null,
  refund_amount numeric(14,2) not null,
  net_revenue numeric(14,2) not null,
  cogs numeric(14,2),
  cogs_complete boolean not null,
  courier_cost numeric(14,2),
  packaging_cost numeric(14,2),
  recognized_at timestamptz not null,
  recognition_source text not null,
  recognized_by uuid,
  snapshot_version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint order_financial_snapshots_status_delivered
    check (recognition_status = 'Delivered'),
  constraint order_financial_snapshots_source_allowed
    check (recognition_source in ('website', 'dashboard', 'approved_backfill')),
  constraint order_financial_snapshots_values_nonnegative check (
    product_revenue >= 0
    and delivery_revenue >= 0
    and discount_amount >= 0
    and refund_amount >= 0
    and net_revenue >= 0
    and (cogs is null or cogs >= 0)
    and (courier_cost is null or courier_cost >= 0)
    and (packaging_cost is null or packaging_cost >= 0)
  ),
  constraint order_financial_snapshots_net_reconciles check (
    net_revenue = product_revenue + delivery_revenue
      - discount_amount - refund_amount
  ),
  constraint order_financial_snapshots_cogs_consistent check (
    (cogs_complete and cogs is not null)
    or (not cogs_complete and cogs is null)
  )
);

create table if not exists public.order_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  adjustment_type text not null,
  amount_delta numeric(14,2) not null,
  occurred_on date not null,
  occurred_at timestamptz not null default now(),
  adjustment_source text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint order_financial_adjustments_type_allowed
    check (adjustment_type = 'refund'),
  constraint order_financial_adjustments_delta_nonzero
    check (amount_delta <> 0),
  constraint order_financial_adjustments_source_allowed
    check (adjustment_source in ('website', 'dashboard', 'approved_backfill'))
);

create or replace function public.dashboard_sync_order_compatibility()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  mapped_order_status text;
  mapped_payment_status text;
begin
  new.order_date := coalesce(
    new.order_date,
    case
      when new.created_at is not null
        then (new.created_at at time zone 'Asia/Dhaka')::date
      else null
    end
  );
  new.customer_location := coalesce(new.customer_location, new.delivery_area);

  if new.sales_channel is null then
    new.sales_channel := 'Website';
  end if;

  if lower(new.sales_channel) = 'website' then
    new.sales_channel := 'Website';
    mapped_order_status := case lower(new.order_status)
      when 'pending' then 'Pending'
      when 'confirmed' then 'Confirmed'
      when 'processing' then 'Confirmed'
      when 'shipped' then 'Dispatched'
      when 'delivered' then 'Delivered'
      when 'cancelled' then 'Cancelled'
      else null
    end;
    mapped_payment_status := case lower(new.payment_status)
      when 'verified' then 'Paid'
      when 'refunded' then 'Refunded'
      when 'unpaid' then 'Unpaid'
      when 'pending' then 'Unpaid'
      when 'failed' then 'Unpaid'
      else null
    end;

    new.dashboard_order_status := coalesce(
      mapped_order_status,
      new.dashboard_order_status
    );
    new.dashboard_payment_status := coalesce(
      mapped_payment_status,
      new.dashboard_payment_status
    );

    if lower(new.payment_method) = 'cod'
       and new.dashboard_order_status = 'Delivered'
       and (new.settlement_status is null
         or new.settlement_status = 'Not Applicable') then
      new.settlement_status := 'Awaiting';
    elsif new.settlement_status is null then
      new.settlement_status := 'Not Applicable';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function public.dashboard_sync_order_compatibility()
  from public, anon;
grant execute on function public.dashboard_sync_order_compatibility()
  to authenticated, service_role;

drop trigger if exists dashboard_sync_order_compatibility
  on public.orders;
create trigger dashboard_sync_order_compatibility
before insert or update on public.orders
for each row execute function public.dashboard_sync_order_compatibility();

-- Existing storefront fields are trustworthy compatibility sources. Courier,
-- campaign, SKU, buying cost, and fulfillment cost are deliberately not guessed.
update public.orders
set
  order_date = coalesce(
    order_date,
    case when created_at is not null
      then (created_at at time zone 'Asia/Dhaka')::date
      else null
    end
  ),
  customer_location = coalesce(customer_location, delivery_area),
  sales_channel = coalesce(sales_channel, 'Website'),
  dashboard_order_status = coalesce(
    dashboard_order_status,
    case lower(order_status)
      when 'pending' then 'Pending'
      when 'confirmed' then 'Confirmed'
      when 'processing' then 'Confirmed'
      when 'shipped' then 'Dispatched'
      when 'delivered' then 'Delivered'
      when 'cancelled' then 'Cancelled'
      else null
    end
  ),
  dashboard_payment_status = coalesce(
    dashboard_payment_status,
    case lower(payment_status)
      when 'verified' then 'Paid'
      when 'refunded' then 'Refunded'
      when 'unpaid' then 'Unpaid'
      when 'pending' then 'Unpaid'
      when 'failed' then 'Unpaid'
      else null
    end
  ),
  settlement_status = coalesce(
    settlement_status,
    case
      when lower(payment_method) = 'cod'
        and lower(order_status) = 'delivered' then 'Awaiting'
      else 'Not Applicable'
    end
  )
where order_date is null
   or customer_location is null
   or sales_channel is null
   or dashboard_order_status is null
   or dashboard_payment_status is null
   or settlement_status is null;

update public.order_items
set
  list_price_snapshot = coalesce(list_price_snapshot, unit_price),
  actual_unit_selling_price = coalesce(actual_unit_selling_price, unit_price)
where list_price_snapshot is null
   or actual_unit_selling_price is null;

create or replace function public.dashboard_snapshot_new_order_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_sku text;
  current_list_price numeric(12,2);
  verified_buying_cost numeric(12,2);
begin
  select
    product.sku,
    product.price::numeric(12,2),
    case
      when business.buying_price_verified_at is not null
        then business.buying_price
      else null
    end
  into current_sku, current_list_price, verified_buying_cost
  from public.products as product
  left join public.product_business_data as business
    on business.product_id = product.id
  where product.id = new.product_id;

  new.sku_snapshot := coalesce(new.sku_snapshot, current_sku);
  new.list_price_snapshot := coalesce(
    new.list_price_snapshot,
    current_list_price,
    new.unit_price
  );
  new.actual_unit_selling_price := coalesce(
    new.actual_unit_selling_price,
    new.unit_price
  );
  new.buying_cost_snapshot := coalesce(
    new.buying_cost_snapshot,
    verified_buying_cost
  );
  return new;
end
$function$;

revoke all on function public.dashboard_snapshot_new_order_item()
  from public, anon;
grant execute on function public.dashboard_snapshot_new_order_item()
  to authenticated, service_role;

drop trigger if exists dashboard_snapshot_new_order_item
  on public.order_items;
create trigger dashboard_snapshot_new_order_item
before insert on public.order_items
for each row execute function public.dashboard_snapshot_new_order_item();

create or replace function public.dashboard_capture_delivered_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_order public.orders%rowtype;
  item_count integer;
  recognized_product_revenue numeric(14,2);
  recognized_cogs numeric(14,2);
  costs_complete boolean;
begin
  select * into current_order
  from public.orders
  where id = new.id;

  if current_order.dashboard_order_status is distinct from 'Delivered' then
    return new;
  end if;

  if exists (
    select 1 from public.order_financial_snapshots
    where order_id = current_order.id
  ) then
    return new;
  end if;

  select
    count(*)::integer,
    coalesce(sum(
      item.quantity * coalesce(
        item.actual_unit_selling_price,
        item.unit_price
      )
    ), 0)::numeric(14,2),
    count(*) > 0 and bool_and(item.buying_cost_snapshot is not null),
    case
      when count(*) > 0 and bool_and(item.buying_cost_snapshot is not null)
        then sum(item.quantity * item.buying_cost_snapshot)::numeric(14,2)
      else null
    end
  into item_count, recognized_product_revenue, costs_complete, recognized_cogs
  from public.order_items as item
  where item.order_id = current_order.id;

  if item_count = 0 then
    return new;
  end if;

  insert into public.order_financial_snapshots (
    order_id,
    order_number_snapshot,
    order_date,
    sales_channel,
    campaign_id,
    campaign_name_snapshot,
    payment_method,
    settlement_status,
    recognition_status,
    product_revenue,
    delivery_revenue,
    discount_amount,
    refund_amount,
    net_revenue,
    cogs,
    cogs_complete,
    courier_cost,
    packaging_cost,
    recognized_at,
    recognition_source,
    recognized_by
  ) values (
    current_order.id,
    current_order.order_number,
    current_order.order_date,
    coalesce(current_order.sales_channel, 'Website'),
    current_order.campaign_id,
    current_order.campaign_name_snapshot,
    current_order.payment_method,
    current_order.settlement_status,
    'Delivered',
    recognized_product_revenue,
    current_order.delivery_charge,
    current_order.discount_amount,
    current_order.refund_amount,
    recognized_product_revenue + current_order.delivery_charge
      - current_order.discount_amount - current_order.refund_amount,
    recognized_cogs,
    costs_complete,
    current_order.courier_cost_snapshot,
    current_order.packaging_cost_snapshot,
    now(),
    case when lower(coalesce(current_order.sales_channel, 'Website')) = 'website'
      then 'website' else 'dashboard' end,
    (select auth.uid())
  )
  on conflict (order_id) do nothing;

  return new;
end
$function$;

revoke all on function public.dashboard_capture_delivered_snapshot()
  from public, anon;
grant execute on function public.dashboard_capture_delivered_snapshot()
  to authenticated, service_role;

drop trigger if exists dashboard_capture_delivered_snapshot
  on public.orders;
create constraint trigger dashboard_capture_delivered_snapshot
after insert or update on public.orders
deferrable initially deferred
for each row execute function public.dashboard_capture_delivered_snapshot();

create or replace function public.dashboard_capture_refund_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.refund_amount is distinct from old.refund_amount
     and exists (
       select 1 from public.order_financial_snapshots
       where order_id = new.id
     ) then
    insert into public.order_financial_adjustments (
      order_id,
      adjustment_type,
      amount_delta,
      occurred_on,
      adjustment_source,
      created_by
    ) values (
      new.id,
      'refund',
      new.refund_amount - old.refund_amount,
      (now() at time zone 'Asia/Dhaka')::date,
      case when lower(coalesce(new.sales_channel, 'Website')) = 'website'
        then 'website' else 'dashboard' end,
      (select auth.uid())
    );
  end if;
  return new;
end
$function$;

revoke all on function public.dashboard_capture_refund_adjustment()
  from public, anon;
grant execute on function public.dashboard_capture_refund_adjustment()
  to authenticated, service_role;

drop trigger if exists dashboard_capture_refund_adjustment
  on public.orders;
create trigger dashboard_capture_refund_adjustment
after update of refund_amount on public.orders
for each row execute function public.dashboard_capture_refund_adjustment();

create or replace function public.dashboard_reject_financial_history_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception 'Recognized financial history is immutable. Append an approved adjustment instead.'
    using errcode = '42501';
end
$function$;

revoke all on function public.dashboard_reject_financial_history_mutation()
  from public, anon;
grant execute on function public.dashboard_reject_financial_history_mutation()
  to authenticated, service_role;

drop trigger if exists order_financial_snapshots_immutable
  on public.order_financial_snapshots;
create trigger order_financial_snapshots_immutable
before update or delete on public.order_financial_snapshots
for each row execute function public.dashboard_reject_financial_history_mutation();

drop trigger if exists order_financial_adjustments_immutable
  on public.order_financial_adjustments;
create trigger order_financial_adjustments_immutable
before update or delete on public.order_financial_adjustments
for each row execute function public.dashboard_reject_financial_history_mutation();
