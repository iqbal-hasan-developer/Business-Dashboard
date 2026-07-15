-- Financially significant writes are exposed only through authorized RPCs.
-- No function in this migration changes public.products.stock.

create or replace function public.create_dashboard_order(
  p_order jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_order_id uuid;
  item_count integer;
  matched_count integer;
  product_subtotal numeric(14,2);
  delivery_amount numeric(12,2) := coalesce(
    nullif(p_order ->> 'delivery_charged', '')::numeric,
    0
  );
  order_discount numeric(12,2) := coalesce(
    nullif(p_order ->> 'discount_amount', '')::numeric,
    0
  );
  order_refund numeric(12,2) := coalesce(
    nullif(p_order ->> 'refund_amount', '')::numeric,
    0
  );
  courier_cost numeric(12,2) :=
    nullif(p_order ->> 'courier_cost_snapshot', '')::numeric;
  packaging_cost numeric(12,2) :=
    nullif(p_order ->> 'packaging_cost_snapshot', '')::numeric;
  dashboard_status text := coalesce(
    nullif(p_order ->> 'order_status', ''),
    'Pending'
  );
  dashboard_payment text := coalesce(
    nullif(p_order ->> 'payment_status', ''),
    'Unpaid'
  );
  legacy_status text;
  legacy_payment_status text;
  legacy_payment_method text;
  payment_input text := lower(btrim(coalesce(
    p_order ->> 'payment_method',
    'cod'
  )));
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin', 'data_entry']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to create dashboard orders'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_order ->> 'order_number'), '') is null
     or nullif(btrim(p_order ->> 'customer_name'), '') is null
     or nullif(btrim(p_order ->> 'customer_phone'), '') is null
     or nullif(btrim(p_order ->> 'customer_address'), '') is null
     or nullif(btrim(p_order ->> 'delivery_area'), '') is null then
    raise exception 'Order number and required customer delivery fields are required'
      using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one order item is required'
      using errcode = '22023';
  end if;

  legacy_payment_method := case payment_input
    when 'cod' then 'cod'
    when 'bkash' then 'bkash'
    when 'nagad' then 'nagad'
    when 'cash' then 'cash'
    when 'bank transfer' then 'bank_transfer'
    when 'bank_transfer' then 'bank_transfer'
    else null
  end;

  if legacy_payment_method is null then
    raise exception 'Payment method must be COD, bKash, Nagad, Cash, or Bank Transfer'
      using errcode = '22023';
  end if;

  if dashboard_status not in (
    'Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled',
    'Returned', 'Refunded', 'Failed Delivery'
  ) then
    raise exception 'Invalid dashboard order status' using errcode = '22023';
  end if;

  if dashboard_payment not in (
    'Unpaid', 'Paid', 'Partially Paid', 'Refunded'
  ) then
    raise exception 'Invalid dashboard payment status' using errcode = '22023';
  end if;

  if delivery_amount < 0
     or order_discount < 0
     or order_refund < 0
     or courier_cost < 0
     or packaging_cost < 0 then
    raise exception 'Money values cannot be negative' using errcode = '22023';
  end if;

  with requested as (
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      quantity integer,
      actual_unit_selling_price numeric
    )
  ), priced as (
    select requested.*
    from requested
    join public.products as product
      on product.id = requested.product_id
    where requested.quantity > 0
      and requested.actual_unit_selling_price >= 0
      and product.is_active is true
  )
  select
    jsonb_array_length(p_items),
    count(*),
    coalesce(sum(quantity * actual_unit_selling_price), 0)::numeric(14,2)
  into item_count, matched_count, product_subtotal
  from priced;

  if matched_count <> item_count then
    raise exception 'Every item must reference an active product with valid quantity and price'
      using errcode = '22023';
  end if;

  if order_discount > product_subtotal + delivery_amount then
    raise exception 'Discount exceeds the order value' using errcode = '22023';
  end if;
  if order_refund > product_subtotal + delivery_amount - order_discount then
    raise exception 'Refund exceeds the discounted order value' using errcode = '22023';
  end if;

  legacy_status := case dashboard_status
    when 'Pending' then 'pending'
    when 'Confirmed' then 'confirmed'
    when 'Dispatched' then 'shipped'
    when 'Delivered' then 'delivered'
    else 'cancelled'
  end;
  legacy_payment_status := case dashboard_payment
    when 'Paid' then 'verified'
    when 'Refunded' then 'refunded'
    when 'Partially Paid' then 'pending'
    else 'unpaid'
  end;

  insert into public.orders (
    order_number,
    customer_name,
    customer_phone,
    customer_address,
    delivery_area,
    customer_note,
    payment_method,
    payment_status,
    order_status,
    subtotal,
    delivery_charge,
    total,
    order_date,
    external_reference,
    customer_location,
    courier,
    sales_channel,
    campaign_id,
    campaign_name_snapshot,
    dashboard_order_status,
    dashboard_payment_status,
    settlement_status,
    discount_amount,
    refund_amount,
    courier_cost_snapshot,
    packaging_cost_snapshot
  ) values (
    btrim(p_order ->> 'order_number'),
    btrim(p_order ->> 'customer_name'),
    btrim(p_order ->> 'customer_phone'),
    btrim(p_order ->> 'customer_address'),
    btrim(p_order ->> 'delivery_area'),
    nullif(btrim(p_order ->> 'customer_note'), ''),
    legacy_payment_method,
    legacy_payment_status,
    legacy_status,
    product_subtotal,
    delivery_amount,
    product_subtotal + delivery_amount - order_discount,
    coalesce(
      nullif(p_order ->> 'order_date', '')::date,
      (now() at time zone 'Asia/Dhaka')::date
    ),
    nullif(btrim(p_order ->> 'external_reference'), ''),
    coalesce(
      nullif(btrim(p_order ->> 'customer_location'), ''),
      btrim(p_order ->> 'delivery_area')
    ),
    nullif(btrim(p_order ->> 'courier'), ''),
    coalesce(nullif(btrim(p_order ->> 'sales_channel'), ''), 'Other'),
    nullif(p_order ->> 'campaign_id', '')::uuid,
    nullif(btrim(p_order ->> 'campaign_name'), ''),
    dashboard_status,
    dashboard_payment,
    coalesce(
      nullif(p_order ->> 'settlement_status', ''),
      'Not Applicable'
    ),
    order_discount,
    order_refund,
    courier_cost,
    packaging_cost
  )
  returning id into new_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    product_name,
    product_slug,
    product_image_url,
    unit_price,
    quantity,
    line_total,
    sku_snapshot,
    list_price_snapshot,
    buying_cost_snapshot,
    actual_unit_selling_price
  )
  select
    new_order_id,
    product.id,
    product.name,
    product.slug,
    product.image_url,
    requested.actual_unit_selling_price,
    requested.quantity,
    requested.actual_unit_selling_price * requested.quantity,
    coalesce(business.sku_override, product.sku),
    product.price,
    case when business.buying_price_verified_at is not null
      then business.buying_price else null end,
    requested.actual_unit_selling_price
  from jsonb_to_recordset(p_items) as requested(
    product_id uuid,
    quantity integer,
    actual_unit_selling_price numeric
  )
  join public.products as product on product.id = requested.product_id
  left join public.product_business_data as business
    on business.product_id = product.id;

  -- Delivery recognition is deferred until transaction end, after every item
  -- exists. Inventory remains owned by the storefront and is not changed here.
  return new_order_id;
end
$function$;

revoke all on function public.create_dashboard_order(jsonb, jsonb)
  from public, anon;
grant execute on function public.create_dashboard_order(jsonb, jsonb)
  to authenticated;

create or replace function public.transition_dashboard_order(
  p_order_id uuid,
  p_order_status text,
  p_payment_status text default null,
  p_settlement_status text default null,
  p_refund_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_role public.dashboard_role;
  current_order public.orders%rowtype;
  legacy_status text;
  legacy_payment_status text;
begin
  caller_role := public.dashboard_current_role();
  if caller_role not in ('owner', 'admin', 'data_entry') then
    raise exception 'Not authorized to transition dashboard orders'
      using errcode = '42501';
  end if;

  if caller_role = 'data_entry'
     and (p_payment_status is not null
       or p_settlement_status is not null
       or p_refund_amount is not null) then
    raise exception 'Data-entry users may change operational order status only'
      using errcode = '42501';
  end if;

  if p_order_status not in (
    'Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled',
    'Returned', 'Refunded', 'Failed Delivery'
  ) then
    raise exception 'Invalid dashboard order status' using errcode = '22023';
  end if;
  if p_payment_status is not null and p_payment_status not in (
    'Unpaid', 'Paid', 'Partially Paid', 'Refunded'
  ) then
    raise exception 'Invalid dashboard payment status' using errcode = '22023';
  end if;
  if p_settlement_status is not null and p_settlement_status not in (
    'Not Applicable', 'Awaiting', 'Partially Settled', 'Settled',
    'Refund Due', 'Refunded'
  ) then
    raise exception 'Invalid settlement status' using errcode = '22023';
  end if;

  select * into current_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if p_refund_amount is not null
     and (p_refund_amount < 0
       or p_refund_amount > current_order.total) then
    raise exception 'Refund must be between zero and the order total'
      using errcode = '22023';
  end if;

  legacy_status := case p_order_status
    when 'Pending' then 'pending'
    when 'Confirmed' then 'confirmed'
    when 'Dispatched' then 'shipped'
    when 'Delivered' then 'delivered'
    else 'cancelled'
  end;
  legacy_payment_status := case p_payment_status
    when 'Paid' then 'verified'
    when 'Refunded' then 'refunded'
    when 'Partially Paid' then 'pending'
    when 'Unpaid' then 'unpaid'
    else null
  end;

  update public.orders
  set
    order_status = legacy_status,
    payment_status = coalesce(legacy_payment_status, payment_status),
    dashboard_order_status = p_order_status,
    dashboard_payment_status = coalesce(
      p_payment_status,
      dashboard_payment_status
    ),
    settlement_status = coalesce(
      p_settlement_status,
      settlement_status
    ),
    refund_amount = coalesce(p_refund_amount, refund_amount)
  where id = p_order_id;
end
$function$;

revoke all on function public.transition_dashboard_order(
  uuid, text, text, text, numeric
) from public, anon;
grant execute on function public.transition_dashboard_order(
  uuid, text, text, text, numeric
) to authenticated;

create or replace function public.set_product_buying_cost(
  p_product_id uuid,
  p_buying_price numeric,
  p_reorder_level integer default 0,
  p_sku_override text default null,
  p_variation text default null,
  p_internal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to manage private product costs'
      using errcode = '42501';
  end if;
  if p_buying_price < 0 or p_reorder_level < 0 then
    raise exception 'Buying price and reorder level cannot be negative'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  insert into public.product_business_data (
    product_id,
    buying_price,
    buying_price_verified_at,
    buying_price_verified_by,
    reorder_level,
    sku_override,
    variation,
    internal_notes,
    created_by,
    updated_by
  ) values (
    p_product_id,
    p_buying_price,
    now(),
    actor,
    p_reorder_level,
    nullif(btrim(p_sku_override), ''),
    nullif(btrim(p_variation), ''),
    nullif(p_internal_notes, ''),
    actor,
    actor
  )
  on conflict (product_id) do update set
    buying_price = excluded.buying_price,
    buying_price_verified_at = excluded.buying_price_verified_at,
    buying_price_verified_by = excluded.buying_price_verified_by,
    reorder_level = excluded.reorder_level,
    sku_override = excluded.sku_override,
    variation = excluded.variation,
    internal_notes = excluded.internal_notes,
    updated_by = excluded.updated_by;
  return p_product_id;
end
$function$;

revoke all on function public.set_product_buying_cost(
  uuid, numeric, integer, text, text, text
) from public, anon;
grant execute on function public.set_product_buying_cost(
  uuid, numeric, integer, text, text, text
) to authenticated;

create or replace function public.set_business_setting(
  p_setting_key text,
  p_setting_value jsonb,
  p_description text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(
    array['owner']::public.dashboard_role[]
  ) then
    raise exception 'Only owners may change business settings'
      using errcode = '42501';
  end if;
  if nullif(btrim(p_setting_key), '') is null or p_setting_value is null then
    raise exception 'Setting key and value are required' using errcode = '22023';
  end if;

  insert into public.business_settings (
    setting_key, setting_value, description, updated_by
  ) values (
    btrim(p_setting_key), p_setting_value, p_description, (select auth.uid())
  )
  on conflict (setting_key) do update set
    setting_value = excluded.setting_value,
    description = excluded.description,
    updated_by = excluded.updated_by;
  return btrim(p_setting_key);
end
$function$;

revoke all on function public.set_business_setting(text, jsonb, text)
  from public, anon;
grant execute on function public.set_business_setting(text, jsonb, text)
  to authenticated;

create or replace function public.upsert_campaign(
  p_id uuid,
  p_name text,
  p_channel text,
  p_starts_on date,
  p_ends_on date,
  p_budget numeric,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  campaign_key uuid := coalesce(p_id, gen_random_uuid());
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to manage campaigns' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null
     or (p_budget is not null and p_budget < 0)
     or (p_ends_on is not null and p_starts_on is not null
       and p_ends_on < p_starts_on) then
    raise exception 'Invalid campaign values' using errcode = '22023';
  end if;

  insert into public.campaigns (
    id, name, channel, starts_on, ends_on, budget, is_active,
    created_by, updated_by
  ) values (
    campaign_key, btrim(p_name), nullif(btrim(p_channel), ''),
    p_starts_on, p_ends_on, p_budget, p_is_active, actor, actor
  )
  on conflict (id) do update set
    name = excluded.name,
    channel = excluded.channel,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    budget = excluded.budget,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by;
  return campaign_key;
end
$function$;

revoke all on function public.upsert_campaign(
  uuid, text, text, date, date, numeric, boolean
) from public, anon;
grant execute on function public.upsert_campaign(
  uuid, text, text, date, date, numeric, boolean
) to authenticated;

create or replace function public.record_daily_ad_spend(
  p_campaign_id uuid,
  p_spend_date date,
  p_platform text,
  p_amount numeric,
  p_source_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_id uuid;
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin', 'data_entry']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record advertising spend'
      using errcode = '42501';
  end if;
  if p_spend_date is null
     or nullif(btrim(p_platform), '') is null
     or p_amount < 0 then
    raise exception 'Invalid advertising-spend values' using errcode = '22023';
  end if;

  insert into public.daily_ad_spend (
    campaign_id, spend_date, platform, amount, source_reference,
    created_by, updated_by
  ) values (
    p_campaign_id, p_spend_date, btrim(p_platform), p_amount,
    nullif(btrim(p_source_reference), ''), actor, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_daily_ad_spend(
  uuid, date, text, numeric, text
) from public, anon;
grant execute on function public.record_daily_ad_spend(
  uuid, date, text, numeric, text
) to authenticated;

create or replace function public.record_expense(
  p_expense_date date,
  p_category_key text,
  p_description text,
  p_amount numeric,
  p_payment_method text default null,
  p_campaign_id uuid default null,
  p_sales_channel text default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_id uuid;
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record expenses' using errcode = '42501';
  end if;
  if p_expense_date is null
     or nullif(btrim(p_category_key), '') is null
     or nullif(btrim(p_description), '') is null
     or p_amount <= 0 then
    raise exception 'Invalid expense values' using errcode = '22023';
  end if;

  insert into public.expenses (
    expense_date, category_key, description, amount, payment_method,
    campaign_id, sales_channel, reference, created_by, updated_by
  ) values (
    p_expense_date, btrim(p_category_key), btrim(p_description), p_amount,
    nullif(btrim(p_payment_method), ''), p_campaign_id,
    nullif(btrim(p_sales_channel), ''), nullif(btrim(p_reference), ''),
    actor, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_expense(
  date, text, text, numeric, text, uuid, text, text
) from public, anon;
grant execute on function public.record_expense(
  date, text, text, numeric, text, uuid, text, text
) to authenticated;

create or replace function public.record_cash_movement(
  p_movement_date date,
  p_movement_type text,
  p_account_key text,
  p_amount numeric,
  p_description text,
  p_order_id uuid default null,
  p_settlement_id uuid default null,
  p_expense_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_id uuid;
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record cash movements'
      using errcode = '42501';
  end if;
  if p_movement_date is null
     or p_movement_type not in (
       'inflow', 'outflow', 'transfer_in', 'transfer_out'
     )
     or nullif(btrim(p_account_key), '') is null
     or nullif(btrim(p_description), '') is null
     or p_amount <= 0
     or ((p_order_id is not null)::integer
       + (p_settlement_id is not null)::integer
       + (p_expense_id is not null)::integer) > 1 then
    raise exception 'Invalid cash-movement values' using errcode = '22023';
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, account_key, amount, order_id,
    settlement_id, expense_id, description, created_by
  ) values (
    p_movement_date, p_movement_type, btrim(p_account_key), p_amount,
    p_order_id, p_settlement_id, p_expense_id, btrim(p_description),
    (select auth.uid())
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_cash_movement(
  date, text, text, numeric, text, uuid, uuid, uuid
) from public, anon;
grant execute on function public.record_cash_movement(
  date, text, text, numeric, text, uuid, uuid, uuid
) to authenticated;

create or replace function public.record_settlement(
  p_courier text,
  p_settlement_reference text,
  p_settlement_date date,
  p_amount_received numeric,
  p_fees_withheld numeric default 0,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_id uuid;
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record settlements' using errcode = '42501';
  end if;
  if nullif(btrim(p_courier), '') is null
     or p_settlement_date is null
     or p_amount_received < 0
     or p_fees_withheld < 0 then
    raise exception 'Invalid settlement values' using errcode = '22023';
  end if;

  insert into public.settlement_records (
    courier, settlement_reference, settlement_date, amount_received,
    fees_withheld, notes, created_by, updated_by
  ) values (
    btrim(p_courier), nullif(btrim(p_settlement_reference), ''),
    p_settlement_date, p_amount_received, p_fees_withheld,
    nullif(p_notes, ''), actor, actor
  ) returning id into new_id;
  return new_id;
end
$function$;

revoke all on function public.record_settlement(
  text, text, date, numeric, numeric, text
) from public, anon;
grant execute on function public.record_settlement(
  text, text, date, numeric, numeric, text
) to authenticated;
