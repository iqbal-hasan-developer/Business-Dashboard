-- Minimal ordinary Edit Order workflow. This function never changes order,
-- payment, or settlement status; never rewrites recognition; and never touches
-- products.stock or any inventory RPC.

-- Preserve explicit dashboard statuses during ordinary Website-order updates.
-- Legacy storefront values remain a fallback only when dashboard fields are
-- missing, which keeps the two status models compatible without collapsing a
-- dashboard-only value such as Partially Paid.
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
  new.sales_channel := coalesce(new.sales_channel, 'Website');

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
      new.dashboard_order_status,
      mapped_order_status
    );
    new.dashboard_payment_status := coalesce(
      new.dashboard_payment_status,
      mapped_payment_status
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

create or replace function public.update_dashboard_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_order jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_order public.orders%rowtype;
  persisted_order public.orders%rowtype;
  item_count integer;
  matched_count integer;
  existing_item_count integer;
  product_subtotal numeric(14,2);
  delivery_amount numeric(12,2) := coalesce(
    nullif(p_order ->> 'delivery_charged', '')::numeric,
    0
  );
  order_discount numeric(12,2) := coalesce(
    nullif(p_order ->> 'discount_amount', '')::numeric,
    0
  );
  courier_cost numeric(12,2) :=
    nullif(p_order ->> 'courier_cost_snapshot', '')::numeric;
  packaging_cost numeric(12,2) :=
    nullif(p_order ->> 'packaging_cost_snapshot', '')::numeric;
  edit_order_date date := nullif(p_order ->> 'order_date', '')::date;
  payment_input text := lower(btrim(coalesce(
    p_order ->> 'payment_method',
    ''
  )));
  legacy_payment_method text;
  requested_campaign_name text := nullif(btrim(p_order ->> 'campaign_name'), '');
  existing_items_signature jsonb;
  requested_items_signature jsonb;
  changed_fields text[] := array[]::text[];
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to edit dashboard orders'
      using errcode = '42501';
  end if;

  if p_order_id is null
     or p_expected_updated_at is null
     or edit_order_date is null
     or nullif(btrim(p_order ->> 'customer_name'), '') is null
     or nullif(btrim(p_order ->> 'customer_phone'), '') is null
     or nullif(btrim(p_order ->> 'customer_address'), '') is null
     or nullif(btrim(p_order ->> 'delivery_area'), '') is null
     or nullif(btrim(p_order ->> 'courier'), '') is null then
    raise exception 'Required order-edit fields are missing'
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
    raise exception 'Invalid payment method' using errcode = '22023';
  end if;

  if delivery_amount < 0
     or order_discount < 0
     or courier_cost < 0
     or packaging_cost < 0 then
    raise exception 'Money values cannot be negative' using errcode = '22023';
  end if;

  select * into current_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  -- A null payload means "preserve the current unknown/known value". This
  -- prevents a forged client flag from clearing a known fulfillment snapshot.
  courier_cost := coalesce(courier_cost, current_order.courier_cost_snapshot);
  packaging_cost := coalesce(
    packaging_cost,
    current_order.packaging_cost_snapshot
  );

  if current_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'Order was changed by another user'
      using errcode = '40001';
  end if;

  if current_order.dashboard_order_status in (
       'Delivered', 'Returned', 'Refunded'
     )
     or exists (
       select 1
       from public.order_financial_snapshots as snapshot
       where snapshot.order_id = current_order.id
     ) then
    raise exception 'Recognized financial records require a controlled correction workflow'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.orders as duplicate_order
    where duplicate_order.id <> current_order.id
      and lower(btrim(duplicate_order.order_number)) =
        lower(btrim(current_order.order_number))
  ) then
    raise exception 'Duplicate order number' using errcode = '23505';
  end if;

  with requested as (
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      quantity integer,
      actual_unit_selling_price numeric
    )
  ), validated as (
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
  from validated;

  if matched_count <> item_count then
    raise exception 'Every item must reference an active product with valid quantity and price'
      using errcode = '22023';
  end if;

  if order_discount > product_subtotal + delivery_amount then
    raise exception 'Discount exceeds the order value' using errcode = '22023';
  end if;

  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', item.product_id,
          'quantity', item.quantity,
          'actual_unit_selling_price', item.actual_unit_selling_price
        ) order by item.product_id, item.quantity, item.actual_unit_selling_price
      ),
      '[]'::jsonb
    )
  into existing_item_count, existing_items_signature
  from public.order_items as item
  where item.order_id = current_order.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', requested.product_id,
        'quantity', requested.quantity,
        'actual_unit_selling_price', requested.actual_unit_selling_price
      ) order by requested.product_id, requested.quantity,
        requested.actual_unit_selling_price
    ),
    '[]'::jsonb
  )
  into requested_items_signature
  from jsonb_to_recordset(p_items) as requested(
    product_id uuid,
    quantity integer,
    actual_unit_selling_price numeric
  );

  if current_order.external_reference is distinct from
      nullif(btrim(p_order ->> 'external_reference'), '') then
    changed_fields := array_append(changed_fields, 'external_reference');
  end if;
  if current_order.order_date is distinct from edit_order_date then
    changed_fields := array_append(changed_fields, 'order_date');
  end if;
  if current_order.customer_name is distinct from btrim(p_order ->> 'customer_name') then
    changed_fields := array_append(changed_fields, 'customer_name');
  end if;
  if current_order.customer_phone is distinct from btrim(p_order ->> 'customer_phone') then
    changed_fields := array_append(changed_fields, 'customer_phone');
  end if;
  if current_order.customer_address is distinct from btrim(p_order ->> 'customer_address') then
    changed_fields := array_append(changed_fields, 'customer_address');
  end if;
  if current_order.customer_note is distinct from
      nullif(btrim(p_order ->> 'customer_note'), '') then
    changed_fields := array_append(changed_fields, 'customer_note');
  end if;
  if current_order.customer_location is distinct from btrim(p_order ->> 'customer_location') then
    changed_fields := array_append(changed_fields, 'customer_location');
  end if;
  if current_order.courier is distinct from btrim(p_order ->> 'courier') then
    changed_fields := array_append(changed_fields, 'courier');
  end if;
  if current_order.sales_channel is distinct from btrim(p_order ->> 'sales_channel') then
    changed_fields := array_append(changed_fields, 'sales_channel');
  end if;
  if current_order.campaign_name_snapshot is distinct from requested_campaign_name then
    changed_fields := array_append(changed_fields, 'campaign_name_snapshot');
  end if;
  if current_order.payment_method is distinct from legacy_payment_method then
    changed_fields := array_append(changed_fields, 'payment_method');
  end if;
  if current_order.discount_amount is distinct from order_discount then
    changed_fields := array_append(changed_fields, 'discount_amount');
  end if;
  if current_order.delivery_charge is distinct from delivery_amount then
    changed_fields := array_append(changed_fields, 'delivery_charge');
  end if;
  if current_order.courier_cost_snapshot is distinct from courier_cost then
    changed_fields := array_append(changed_fields, 'courier_cost_snapshot');
  end if;
  if current_order.packaging_cost_snapshot is distinct from packaging_cost then
    changed_fields := array_append(changed_fields, 'packaging_cost_snapshot');
  end if;
  if existing_items_signature is distinct from requested_items_signature then
    changed_fields := array_append(changed_fields, 'items');
  end if;

  update public.orders
  set
    customer_name = btrim(p_order ->> 'customer_name'),
    customer_phone = btrim(p_order ->> 'customer_phone'),
    customer_address = btrim(p_order ->> 'customer_address'),
    delivery_area = btrim(p_order ->> 'delivery_area'),
    customer_note = nullif(btrim(p_order ->> 'customer_note'), ''),
    payment_method = legacy_payment_method,
    subtotal = product_subtotal,
    delivery_charge = delivery_amount,
    total = product_subtotal + delivery_amount - order_discount,
    order_date = edit_order_date,
    external_reference = nullif(btrim(p_order ->> 'external_reference'), ''),
    customer_location = btrim(p_order ->> 'customer_location'),
    courier = btrim(p_order ->> 'courier'),
    sales_channel = btrim(p_order ->> 'sales_channel'),
    campaign_id = case
      when current_order.campaign_name_snapshot is not distinct from
        requested_campaign_name then current_order.campaign_id
      else null
    end,
    campaign_name_snapshot = requested_campaign_name,
    discount_amount = order_discount,
    courier_cost_snapshot = courier_cost,
    packaging_cost_snapshot = packaging_cost,
    updated_at = now()
  where id = current_order.id;

  select * into persisted_order
  from public.orders
  where id = current_order.id;

  if persisted_order.order_status is distinct from current_order.order_status
     or persisted_order.payment_status is distinct from current_order.payment_status
     or persisted_order.dashboard_order_status is distinct from current_order.dashboard_order_status
     or persisted_order.dashboard_payment_status is distinct from current_order.dashboard_payment_status
     or persisted_order.settlement_status is distinct from current_order.settlement_status
     or persisted_order.refund_amount is distinct from current_order.refund_amount then
    raise exception 'Ordinary edits cannot change operational or financial status fields'
      using errcode = '22023';
  end if;

  delete from public.order_items
  where order_id = current_order.id;

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
    current_order.id,
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

  insert into public.audit_history (
    table_name,
    record_id,
    action,
    changed_by,
    old_values,
    new_values
  ) values (
    'orders',
    current_order.id::text,
    'UPDATE',
    (select auth.uid()),
    jsonb_build_object(
      'edit_summary', jsonb_build_object(
        'changed_fields', changed_fields,
        'item_count', existing_item_count
      )
    ),
    jsonb_build_object(
      'edit_summary', jsonb_build_object(
        'changed_fields', changed_fields,
        'item_count', item_count
      )
    )
  );

  return current_order.id;
end
$function$;

revoke all on function public.update_dashboard_order(
  uuid, timestamptz, jsonb, jsonb
) from public, anon;
grant execute on function public.update_dashboard_order(
  uuid, timestamptz, jsonb, jsonb
) to authenticated;
