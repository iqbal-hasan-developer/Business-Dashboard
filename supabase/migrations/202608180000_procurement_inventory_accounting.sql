begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if to_regclass('public.expenses') is null
     or to_regclass('public.order_item_financial_allocations') is null
     or to_regprocedure('public.dashboard_allocate_poisha(bigint,uuid[],bigint[])') is null
     or to_regclass('public.audit_history') is null then
    raise exception 'Procurement accounting prerequisites are missing.';
  end if;
end
$preflight$;

create or replace function public.dashboard_expense_accounting_class(p_category_key text)
returns text
language sql
immutable
set search_path = pg_catalog
as $function$
  select case lower(btrim(coalesce(p_category_key, '')))
    when 'product_purchase' then 'inventory_purchase'
    when 'stock_purchase' then 'inventory_purchase'
    when 'inventory_purchase' then 'inventory_purchase'
    when 'freight_in' then 'freight_in'
    when 'inventory_procurement_transport' then 'freight_in'
    when 'unallocated_procurement' then 'unallocated_procurement'
    else 'operating_expense'
  end;
$function$;

alter table public.expenses
  add column if not exists accounting_class text;

update public.expenses
set accounting_class = public.dashboard_expense_accounting_class(category_key)
where accounting_class is null;

alter table public.expenses
  alter column accounting_class set not null,
  alter column accounting_class set default 'operating_expense',
  drop constraint if exists expenses_accounting_class_allowed,
  add constraint expenses_accounting_class_allowed check (
    accounting_class in (
      'operating_expense', 'inventory_purchase', 'freight_in',
      'unallocated_procurement'
    )
  );

create or replace function public.dashboard_classify_expense()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.accounting_class := public.dashboard_expense_accounting_class(new.category_key);
  return new;
end
$function$;

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
  captured_order_id uuid;
begin
  select * into current_order from public.orders where id = new.id;

  if current_order.dashboard_order_status is distinct from 'Delivered'
     or exists (
       select 1 from public.order_financial_snapshots
       where order_id = current_order.id
     ) then
    return new;
  end if;

  -- Only the Delivered transition consumes posted landed-cost layers. Pending
  -- and Cancelled orders never create inventory consumption or COGS.
  perform public.dashboard_consume_landed_inventory(current_order.id);

  select
    count(*)::integer,
    coalesce(sum(
      item.quantity * coalesce(item.actual_unit_selling_price, item.unit_price)
    ), 0)::numeric(14,2),
    count(*) > 0 and bool_and(
      item.landed_cost_total_snapshot_poisha is not null
      or item.buying_cost_snapshot is not null
    ),
    case when count(*) > 0 and bool_and(
      item.landed_cost_total_snapshot_poisha is not null
      or item.buying_cost_snapshot is not null
    ) then sum(case
      when item.landed_cost_total_snapshot_poisha is not null
        then public.dashboard_poisha_to_money(item.landed_cost_total_snapshot_poisha)
      else item.quantity * item.buying_cost_snapshot
    end)::numeric(14,2) else null end
  into item_count, recognized_product_revenue, costs_complete, recognized_cogs
  from public.order_items as item
  where item.order_id = current_order.id;

  if item_count = 0 then return new; end if;

  insert into public.order_financial_snapshots (
    order_id, order_number_snapshot, order_date, order_origin_date,
    sales_channel, campaign_id, campaign_name_snapshot, payment_method,
    settlement_status, recognition_status, product_revenue, delivery_revenue,
    discount_amount, refund_amount, original_refund_scope,
    original_return_disposition, original_refund_review_status, net_revenue,
    cogs, cogs_complete, courier_cost, packaging_cost, recognized_at,
    recognition_source, recognized_by
  ) values (
    current_order.id,
    current_order.order_number,
    (now() at time zone 'Asia/Dhaka')::date,
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
    case when current_order.refund_amount = 0 then null
      when current_order.refund_review_status = 'resolved'
        and current_order.refund_scope is not null
        and current_order.return_disposition in ('not_applicable', 'not_returned')
        then current_order.refund_scope
      else null end,
    case when current_order.refund_amount = 0 then 'not_applicable'
      when current_order.refund_review_status = 'resolved'
        and current_order.refund_scope is not null
        and current_order.return_disposition in ('not_applicable', 'not_returned')
        then current_order.return_disposition
      else null end,
    case when current_order.refund_amount = 0 then 'resolved'
      when current_order.refund_review_status = 'resolved'
        and current_order.refund_scope is not null
        and current_order.return_disposition in ('not_applicable', 'not_returned')
        then 'resolved'
      else 'needs_review' end,
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
  on conflict (order_id) do nothing
  returning order_id into captured_order_id;

  if captured_order_id is not null and (
    current_order.refund_amount = 0
    or (
      current_order.refund_review_status = 'resolved'
      and current_order.refund_scope is not null
      and current_order.return_disposition in ('not_applicable', 'not_returned')
    )
  ) then
    perform public.dashboard_build_item_allocations(captured_order_id);
  end if;
  return new;
end
$function$;

/* Deferred until procurement tables exist.
create or replace view public.dashboard_inventory_cost_layers
with (security_invoker = true)
as
select
  batch_item.id as purchase_batch_item_id,
  batch_item.purchase_batch_id,
  batch.purchase_date,
  batch_item.product_id,
  batch_item.quantity as received_quantity,
  coalesce(consumed.consumed_quantity, 0)::integer as consumed_quantity,
  (batch_item.quantity - coalesce(consumed.consumed_quantity, 0))::integer
    as remaining_quantity,
  batch_item.supplier_product_cost_poisha,
  batch_item.allocated_freight_poisha,
  batch_item.landed_cost_total_poisha,
  coalesce(consumed.supplier_cost_poisha, 0)::bigint as consumed_supplier_cost_poisha,
  coalesce(consumed.freight_cost_poisha, 0)::bigint as consumed_freight_cost_poisha,
  (batch_item.supplier_product_cost_poisha
    - coalesce(consumed.supplier_cost_poisha, 0))::bigint
    as remaining_supplier_cost_poisha,
  (batch_item.allocated_freight_poisha
    - coalesce(consumed.freight_cost_poisha, 0))::bigint
    as remaining_freight_poisha,
  (batch_item.landed_cost_total_poisha
    - coalesce(consumed.supplier_cost_poisha, 0)
    - coalesce(consumed.freight_cost_poisha, 0))::bigint
    as remaining_landed_cost_poisha
from public.purchase_batch_items as batch_item
join public.purchase_batches as batch
  on batch.id = batch_item.purchase_batch_id and batch.status = 'posted'
left join lateral (
  select sum(consumption.quantity)::integer as consumed_quantity,
         sum(consumption.supplier_cost_poisha)::bigint as supplier_cost_poisha,
         sum(consumption.freight_cost_poisha)::bigint as freight_cost_poisha
  from public.order_item_inventory_consumptions as consumption
  where consumption.purchase_batch_item_id = batch_item.id
) as consumed on true;

create or replace view public.dashboard_procurement_summary
with (security_invoker = true)
as
with expense_totals as (
  select
    coalesce(sum(public.dashboard_money_to_poisha(expense.amount)) filter (
      where expense.accounting_class in ('inventory_purchase', 'unallocated_procurement')
    ), 0)::bigint as inventory_purchase_poisha,
    coalesce(sum(public.dashboard_money_to_poisha(expense.amount)) filter (
      where expense.accounting_class = 'freight_in'
    ), 0)::bigint as freight_in_poisha
  from public.expenses as expense
), allocated as (
  select coalesce(sum(allocation.allocated_poisha), 0)::bigint as allocated_poisha
  from public.procurement_expense_allocations as allocation
), unallocated_records as (
  select count(*)::bigint as record_count
  from public.expenses as expense
  left join lateral (
    select coalesce(sum(allocation.allocated_poisha), 0)::bigint as allocated_poisha
    from public.procurement_expense_allocations as allocation
    where allocation.expense_id = expense.id
  ) as allocated on true
  where expense.accounting_class <> 'operating_expense'
    and public.dashboard_money_to_poisha(expense.amount) > allocated.allocated_poisha
), missing_cash as (
  select count(*)::bigint as record_count
  from public.expenses as expense
  where expense.accounting_class <> 'operating_expense'
    and not exists (
      select 1 from public.cash_movements as movement
      where movement.expense_id = expense.id
    )
), inventory as (
  select coalesce(sum(layer.remaining_landed_cost_poisha), 0)::bigint as value_poisha
  from public.dashboard_inventory_cost_layers as layer
)
select
  public.dashboard_poisha_to_money(expense.inventory_purchase_poisha)
    as inventory_purchase_total,
  public.dashboard_poisha_to_money(expense.freight_in_poisha) as freight_in_total,
  public.dashboard_poisha_to_money(allocated.allocated_poisha)
    as allocated_procurement_total,
  public.dashboard_poisha_to_money(
    expense.inventory_purchase_poisha + expense.freight_in_poisha
      - allocated.allocated_poisha
  ) as unallocated_procurement_total,
  public.dashboard_poisha_to_money(inventory.value_poisha) as known_inventory_value,
  unallocated_records.record_count as unallocated_record_count,
  missing_cash.record_count as missing_cash_movement_count
from expense_totals as expense
cross join allocated
cross join unallocated_records
cross join missing_cash
cross join inventory;

*/


drop trigger if exists dashboard_classify_expense on public.expenses;
create trigger dashboard_classify_expense
before insert or update of category_key on public.expenses
for each row execute function public.dashboard_classify_expense();

create or replace function public.dashboard_expense_category_allowed(p_category_key text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select lower(btrim(coalesce(p_category_key, ''))) = any (array[
    'operations', 'business_transportation', 'packaging_supplies',
    'software', 'utilities', 'professional_services', 'other',
    'inventory_purchase', 'freight_in', 'unallocated_procurement'
  ]::text[]);
$function$;

-- Exact development data guard. IDs, dates, descriptions, and amounts are
-- verified before only the accounting category is changed.
do $legacy_guard$
declare
  mismatches bigint;
begin
  with expected(id, expense_date, description, amount, target_category) as (
    values
      ('fa6fa4aa-12e8-4ca2-a9d4-29d2be4b1a0a'::uuid, '2026-08-15'::date, '32 pcs mal ana hoise', 15120.00::numeric, 'inventory_purchase'),
      ('bbcdf759-62c0-4095-ab37-357a8bf327c3'::uuid, '2026-07-20'::date, 'mal kena hoise', 5300.00::numeric, 'inventory_purchase'),
      ('1096c0a8-722e-4171-b95b-613fcd29869a'::uuid, '2026-07-15'::date, 'mal kena hoise', 6840.00::numeric, 'inventory_purchase'),
      ('c80cf0ae-0e12-4aec-bfc3-b01177c60df8'::uuid, '2026-07-13'::date, 'product kena hoise', 6840.00::numeric, 'inventory_purchase'),
      ('19da586d-e86c-4c86-99a8-ae7d3493a5b5'::uuid, '2026-07-12'::date, 'Product Kena Hoisilo', 6840.00::numeric, 'inventory_purchase'),
      ('a210d255-f291-4646-b3b8-c93d7e3c3de0'::uuid, '2026-06-22'::date, 'product + road khoroch', 6040.00::numeric, 'unallocated_procurement'),
      ('2566055f-895e-482b-a3eb-3894b556e71f'::uuid, '2026-08-15'::date, 'Vara', 480.00::numeric, 'freight_in'),
      ('c9ee5905-a14c-4add-8926-4486d47b6bf9'::uuid, '2026-08-12'::date, 'vara 200', 200.00::numeric, 'freight_in'),
      ('236cb12d-07e3-468c-8337-ae0f7d88cc28'::uuid, '2026-07-01'::date, 'vara khoroch', 800.00::numeric, 'freight_in')
  )
  select count(*) into mismatches
  from expected
  left join public.expenses as expense using (id)
  where expense.id is null
     or expense.expense_date is distinct from expected.expense_date
     or expense.description is distinct from expected.description
     or expense.amount is distinct from expected.amount
     or expense.category_key not in (
       'product_purchase', 'transportation', expected.target_category
     );
  if mismatches <> 0 then
    raise exception 'Legacy procurement rows do not match the reviewed nine-record allowlist.';
  end if;
end
$legacy_guard$;

select set_config(
  'nexanotion.audit_reason',
  'Reclassified inventory acquisition costs to correct procurement accounting and prevent double counting with COGS.',
  true
);

update public.expenses
set category_key = case id
    when 'a210d255-f291-4646-b3b8-c93d7e3c3de0'::uuid then 'unallocated_procurement'
    when '2566055f-895e-482b-a3eb-3894b556e71f'::uuid then 'freight_in'
    when 'c9ee5905-a14c-4add-8926-4486d47b6bf9'::uuid then 'freight_in'
    when '236cb12d-07e3-468c-8337-ae0f7d88cc28'::uuid then 'freight_in'
    else 'inventory_purchase'
  end,
  updated_by = coalesce(updated_by, created_by)
where id in (
  'fa6fa4aa-12e8-4ca2-a9d4-29d2be4b1a0a'::uuid,
  'bbcdf759-62c0-4095-ab37-357a8bf327c3'::uuid,
  '1096c0a8-722e-4171-b95b-613fcd29869a'::uuid,
  'c80cf0ae-0e12-4aec-bfc3-b01177c60df8'::uuid,
  '19da586d-e86c-4c86-99a8-ae7d3493a5b5'::uuid,
  'a210d255-f291-4646-b3b8-c93d7e3c3de0'::uuid,
  '2566055f-895e-482b-a3eb-3894b556e71f'::uuid,
  'c9ee5905-a14c-4add-8926-4486d47b6bf9'::uuid,
  '236cb12d-07e3-468c-8337-ae0f7d88cc28'::uuid
)
and category_key is distinct from case id
    when 'a210d255-f291-4646-b3b8-c93d7e3c3de0'::uuid then 'unallocated_procurement'
    when '2566055f-895e-482b-a3eb-3894b556e71f'::uuid then 'freight_in'
    when 'c9ee5905-a14c-4add-8926-4486d47b6bf9'::uuid then 'freight_in'
    when '236cb12d-07e3-468c-8337-ae0f7d88cc28'::uuid then 'freight_in'
    else 'inventory_purchase'
  end;

create table public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  supplier text,
  supplier_reference text,
  notes text,
  status text not null default 'posted',
  merchandise_total_poisha bigint not null,
  freight_total_poisha bigint not null default 0,
  landed_total_poisha bigint generated always as (
    merchandise_total_poisha + freight_total_poisha
  ) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_batches_status_allowed check (status in ('posted', 'void')),
  constraint purchase_batches_values_nonnegative check (
    merchandise_total_poisha > 0 and freight_total_poisha >= 0
  )
);

create table public.purchase_batch_items (
  id uuid primary key default gen_random_uuid(),
  purchase_batch_id uuid not null references public.purchase_batches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null,
  supplier_unit_cost_poisha bigint not null,
  supplier_product_cost_poisha bigint generated always as (
    quantity::bigint * supplier_unit_cost_poisha
  ) stored,
  allocated_freight_poisha bigint not null,
  landed_cost_total_poisha bigint generated always as (
    quantity::bigint * supplier_unit_cost_poisha + allocated_freight_poisha
  ) stored,
  landed_unit_cost_poisha numeric(20,6) generated always as (
    (quantity::numeric * supplier_unit_cost_poisha + allocated_freight_poisha)
      / quantity::numeric
  ) stored,
  created_at timestamptz not null default now(),
  constraint purchase_batch_items_batch_id_key unique (id, purchase_batch_id),
  constraint purchase_batch_items_product_key unique (purchase_batch_id, product_id),
  constraint purchase_batch_items_quantity_positive check (quantity > 0),
  constraint purchase_batch_items_values_nonnegative check (
    supplier_unit_cost_poisha >= 0 and allocated_freight_poisha >= 0
  )
);

create table public.procurement_expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete restrict,
  purchase_batch_id uuid not null references public.purchase_batches(id) on delete restrict,
  allocation_type text not null,
  allocated_poisha bigint not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint procurement_expense_allocations_unique
    unique (expense_id, purchase_batch_id, allocation_type),
  constraint procurement_expense_allocations_type_allowed
    check (allocation_type in ('merchandise', 'freight')),
  constraint procurement_expense_allocations_amount_positive check (allocated_poisha > 0)
);

create table public.order_item_inventory_consumptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  purchase_batch_item_id uuid not null references public.purchase_batch_items(id) on delete restrict,
  product_id_snapshot uuid not null references public.products(id) on delete restrict,
  quantity integer not null,
  supplier_cost_poisha bigint not null,
  freight_cost_poisha bigint not null,
  landed_cogs_poisha bigint generated always as (
    supplier_cost_poisha + freight_cost_poisha
  ) stored,
  recognized_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint order_item_inventory_consumptions_layer_key
    unique (order_item_id, purchase_batch_item_id),
  constraint order_item_inventory_consumptions_quantity_positive check (quantity > 0),
  constraint order_item_inventory_consumptions_values_nonnegative check (
    supplier_cost_poisha >= 0 and freight_cost_poisha >= 0
  )
);

create index purchase_batches_date_idx on public.purchase_batches (purchase_date, id);
create index purchase_batch_items_product_idx on public.purchase_batch_items (product_id, purchase_batch_id);
create index procurement_expense_allocations_batch_idx on public.procurement_expense_allocations (purchase_batch_id, allocation_type);
create index order_item_inventory_consumptions_layer_idx on public.order_item_inventory_consumptions (purchase_batch_item_id, order_item_id);
create index order_item_inventory_consumptions_order_idx on public.order_item_inventory_consumptions (order_id, order_item_id);

alter table public.order_items
  add column if not exists supplier_cost_total_snapshot_poisha bigint,
  add column if not exists freight_cost_total_snapshot_poisha bigint,
  add column if not exists landed_cost_total_snapshot_poisha bigint,
  add column if not exists landed_cost_snapshot_source text,
  add constraint order_items_landed_snapshot_consistent check (
    (supplier_cost_total_snapshot_poisha is null
      and freight_cost_total_snapshot_poisha is null
      and landed_cost_total_snapshot_poisha is null
      and landed_cost_snapshot_source is null)
    or
    (supplier_cost_total_snapshot_poisha >= 0
      and freight_cost_total_snapshot_poisha >= 0
      and landed_cost_total_snapshot_poisha
        = supplier_cost_total_snapshot_poisha + freight_cost_total_snapshot_poisha
      and landed_cost_snapshot_source = 'purchase_batch_fifo')
  );

alter table public.order_item_financial_allocations
  add column if not exists supplier_cogs_poisha bigint,
  add column if not exists freight_cogs_poisha bigint,
  add column if not exists landed_cost_snapshot_source text,
  add constraint order_item_allocations_landed_cogs_consistent check (
    (supplier_cogs_poisha is null and freight_cogs_poisha is null
      and landed_cost_snapshot_source is null)
    or
    (supplier_cogs_poisha >= 0 and freight_cogs_poisha >= 0
      and cogs_poisha = supplier_cogs_poisha + freight_cogs_poisha
      and landed_cost_snapshot_source = 'purchase_batch_fifo')
  );

create or replace function public.dashboard_reject_procurement_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $function$
begin
  raise exception 'Posted procurement and inventory history is immutable; append a correction instead.'
    using errcode = '42501';
end
$function$;

create trigger purchase_batch_items_immutable
before update or delete on public.purchase_batch_items
for each row execute function public.dashboard_reject_procurement_history_mutation();
create trigger procurement_expense_allocations_immutable
before update or delete on public.procurement_expense_allocations
for each row execute function public.dashboard_reject_procurement_history_mutation();
create trigger order_item_inventory_consumptions_immutable
before update or delete on public.order_item_inventory_consumptions
for each row execute function public.dashboard_reject_procurement_history_mutation();

create or replace function public.dashboard_fill_allocation_landed_cost()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  select item.supplier_cost_total_snapshot_poisha,
         item.freight_cost_total_snapshot_poisha,
         item.landed_cost_snapshot_source,
         coalesce(item.landed_cost_total_snapshot_poisha, new.cogs_poisha)
  into new.supplier_cogs_poisha, new.freight_cogs_poisha,
       new.landed_cost_snapshot_source, new.cogs_poisha
  from public.order_items as item where item.id = new.order_item_id;
  return new;
end
$function$;

create trigger dashboard_fill_allocation_landed_cost
before insert on public.order_item_financial_allocations
for each row execute function public.dashboard_fill_allocation_landed_cost();

create or replace function public.record_purchase_batch(
  p_purchase_date date,
  p_supplier text,
  p_supplier_reference text,
  p_notes text,
  p_items jsonb,
  p_expense_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  batch_id uuid := gen_random_uuid();
  merchandise_total bigint;
  freight_total bigint;
  item_keys uuid[];
  item_weights bigint[];
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record purchase batches' using errcode = '42501';
  end if;
  if p_purchase_date is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_typeof(p_expense_allocations) is distinct from 'array'
     or char_length(coalesce(p_supplier, '')) > 200
     or char_length(coalesce(p_supplier_reference, '')) > 200
     or char_length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Invalid purchase batch values' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity integer, supplier_unit_cost_poisha bigint)
    where item.product_id is null or item.quantity <= 0
      or item.supplier_unit_cost_poisha < 0
      or not exists (select 1 from public.products where id = item.product_id)
  ) or (
    select count(*) from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity integer, supplier_unit_cost_poisha bigint)
  ) <> (
    select count(distinct item.product_id) from jsonb_to_recordset(p_items)
      as item(product_id uuid, quantity integer, supplier_unit_cost_poisha bigint)
  ) then
    raise exception 'Purchase items require unique products, positive quantities, and exact non-negative costs.'
      using errcode = '22023';
  end if;

  select coalesce(sum(item.quantity::bigint * item.supplier_unit_cost_poisha), 0),
         array_agg(item.product_id order by item.product_id),
         array_agg(item.quantity::bigint * item.supplier_unit_cost_poisha order by item.product_id)
  into merchandise_total, item_keys, item_weights
  from jsonb_to_recordset(p_items)
    as item(product_id uuid, quantity integer, supplier_unit_cost_poisha bigint);

  select coalesce(sum(allocation.allocated_poisha) filter (
           where allocation.allocation_type = 'freight'
         ), 0)::bigint
  into freight_total
  from jsonb_to_recordset(p_expense_allocations)
    as allocation(expense_id uuid, allocation_type text, allocated_poisha bigint);

  if merchandise_total <= 0 then
    raise exception 'Purchase batch merchandise total must be positive.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_expense_allocations)
      as allocation(expense_id uuid, allocation_type text, allocated_poisha bigint)
    where allocation.expense_id is null
      or allocation.allocation_type not in ('merchandise', 'freight')
      or allocation.allocated_poisha <= 0
  ) then
    raise exception 'Expense allocations are invalid.' using errcode = '22023';
  end if;
  if merchandise_total is distinct from (
    select coalesce(sum(allocation.allocated_poisha), 0)::bigint
    from jsonb_to_recordset(p_expense_allocations)
      as allocation(expense_id uuid, allocation_type text, allocated_poisha bigint)
    where allocation.allocation_type = 'merchandise'
  ) then
    raise exception 'Merchandise expense allocations must exactly equal item merchandise cost.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_expense_allocations)
      as requested(expense_id uuid, allocation_type text, allocated_poisha bigint)
    left join public.expenses as expense on expense.id = requested.expense_id
    left join lateral (
      select coalesce(sum(existing.allocated_poisha), 0)::bigint as allocated_poisha
      from public.procurement_expense_allocations as existing
      where existing.expense_id = requested.expense_id
    ) as prior on true
    where expense.id is null
      or expense.accounting_class = 'operating_expense'
      or public.dashboard_money_to_poisha(expense.amount)
        < prior.allocated_poisha + requested.allocated_poisha
      or (requested.allocation_type = 'merchandise'
          and expense.accounting_class = 'freight_in')
      or (requested.allocation_type = 'freight'
          and expense.accounting_class = 'inventory_purchase')
  ) then
    raise exception 'An expense allocation exceeds or conflicts with its procurement record.'
      using errcode = '23514';
  end if;

  insert into public.purchase_batches (
    id, purchase_date, supplier, supplier_reference, notes,
    merchandise_total_poisha, freight_total_poisha, created_by
  ) values (
    batch_id, p_purchase_date, nullif(btrim(p_supplier), ''),
    nullif(btrim(p_supplier_reference), ''), nullif(btrim(p_notes), ''),
    merchandise_total, freight_total, actor
  );

  insert into public.purchase_batch_items (
    purchase_batch_id, product_id, quantity, supplier_unit_cost_poisha,
    allocated_freight_poisha
  )
  select batch_id, item.product_id, item.quantity,
         item.supplier_unit_cost_poisha, freight.allocated_poisha
  from jsonb_to_recordset(p_items)
    as item(product_id uuid, quantity integer, supplier_unit_cost_poisha bigint)
  join public.dashboard_allocate_poisha(freight_total, item_keys, item_weights)
    as freight on freight.allocation_key = item.product_id;

  insert into public.procurement_expense_allocations (
    expense_id, purchase_batch_id, allocation_type, allocated_poisha, created_by
  )
  select allocation.expense_id, batch_id, allocation.allocation_type,
         allocation.allocated_poisha, actor
  from jsonb_to_recordset(p_expense_allocations)
    as allocation(expense_id uuid, allocation_type text, allocated_poisha bigint);

  return batch_id;
end
$function$;

create or replace function public.dashboard_consume_landed_inventory(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ordered_item record;
  layer record;
  required_quantity integer;
  available_quantity bigint;
  take_quantity integer;
  consumed_before integer;
  freight_base bigint;
  freight_remainder integer;
  freight_take bigint;
  supplier_take bigint;
  item_supplier bigint;
  item_freight bigint;
begin
  for ordered_item in
    select item.id, item.product_id, item.quantity
    from public.order_items as item
    where item.order_id = p_order_id
    order by item.id
  loop
    if ordered_item.product_id is null or exists (
      select 1 from public.order_item_inventory_consumptions
      where order_item_id = ordered_item.id
    ) then
      continue;
    end if;

    -- Serialize inventory consumption per product so concurrent Delivered
    -- transitions cannot consume the same remaining layer quantity.
    perform 1 from public.products
    where id = ordered_item.product_id
    for update;

    select coalesce(sum(batch_item.quantity - coalesce(used.quantity, 0)), 0)
    into available_quantity
    from public.purchase_batch_items as batch_item
    join public.purchase_batches as batch
      on batch.id = batch_item.purchase_batch_id and batch.status = 'posted'
    left join lateral (
      select coalesce(sum(consumption.quantity), 0)::integer as quantity
      from public.order_item_inventory_consumptions as consumption
      where consumption.purchase_batch_item_id = batch_item.id
    ) as used on true
    where batch_item.product_id = ordered_item.product_id;

    if available_quantity < ordered_item.quantity then
      continue;
    end if;

    required_quantity := ordered_item.quantity;
    item_supplier := 0;
    item_freight := 0;
    for layer in
      select batch_item.*, batch.purchase_date,
             coalesce(used.quantity, 0)::integer as consumed_quantity
      from public.purchase_batch_items as batch_item
      join public.purchase_batches as batch
        on batch.id = batch_item.purchase_batch_id and batch.status = 'posted'
      left join lateral (
        select coalesce(sum(consumption.quantity), 0)::integer as quantity
        from public.order_item_inventory_consumptions as consumption
        where consumption.purchase_batch_item_id = batch_item.id
      ) as used on true
      where batch_item.product_id = ordered_item.product_id
        and batch_item.quantity > coalesce(used.quantity, 0)
      order by batch.purchase_date, batch.id, batch_item.id
      for update of batch_item
    loop
      exit when required_quantity = 0;
      consumed_before := layer.consumed_quantity;
      take_quantity := least(required_quantity, layer.quantity - consumed_before);
      freight_base := layer.allocated_freight_poisha / layer.quantity;
      freight_remainder := (layer.allocated_freight_poisha % layer.quantity)::integer;
      freight_take := freight_base * take_quantity
        + greatest(least(freight_remainder - consumed_before, take_quantity), 0);
      supplier_take := layer.supplier_unit_cost_poisha * take_quantity;

      insert into public.order_item_inventory_consumptions (
        order_id, order_item_id, purchase_batch_item_id, product_id_snapshot,
        quantity, supplier_cost_poisha, freight_cost_poisha, recognized_at
      ) values (
        p_order_id, ordered_item.id, layer.id, ordered_item.product_id,
        take_quantity, supplier_take, freight_take, now()
      );
      item_supplier := item_supplier + supplier_take;
      item_freight := item_freight + freight_take;
      required_quantity := required_quantity - take_quantity;
    end loop;

    update public.order_items
    set supplier_cost_total_snapshot_poisha = item_supplier,
        freight_cost_total_snapshot_poisha = item_freight,
        landed_cost_total_snapshot_poisha = item_supplier + item_freight,
        landed_cost_snapshot_source = 'purchase_batch_fifo',
        buying_cost_snapshot = (
          (item_supplier + item_freight)::numeric / 100 / ordered_item.quantity
        )::numeric(12,2)
    where id = ordered_item.id;
  end loop;
end
$function$;

create or replace view public.dashboard_inventory_cost_layers
with (security_invoker = true)
as
select
  batch_item.id as purchase_batch_item_id,
  batch_item.purchase_batch_id,
  batch.purchase_date,
  batch_item.product_id,
  batch_item.quantity as received_quantity,
  coalesce(consumed.consumed_quantity, 0)::integer as consumed_quantity,
  (batch_item.quantity - coalesce(consumed.consumed_quantity, 0))::integer
    as remaining_quantity,
  batch_item.supplier_product_cost_poisha,
  batch_item.allocated_freight_poisha,
  batch_item.landed_cost_total_poisha,
  coalesce(consumed.supplier_cost_poisha, 0)::bigint as consumed_supplier_cost_poisha,
  coalesce(consumed.freight_cost_poisha, 0)::bigint as consumed_freight_cost_poisha,
  (batch_item.supplier_product_cost_poisha
    - coalesce(consumed.supplier_cost_poisha, 0))::bigint
    as remaining_supplier_cost_poisha,
  (batch_item.allocated_freight_poisha
    - coalesce(consumed.freight_cost_poisha, 0))::bigint
    as remaining_freight_poisha,
  (batch_item.landed_cost_total_poisha
    - coalesce(consumed.supplier_cost_poisha, 0)
    - coalesce(consumed.freight_cost_poisha, 0))::bigint
    as remaining_landed_cost_poisha
from public.purchase_batch_items as batch_item
join public.purchase_batches as batch
  on batch.id = batch_item.purchase_batch_id and batch.status = 'posted'
left join lateral (
  select sum(consumption.quantity)::integer as consumed_quantity,
         sum(consumption.supplier_cost_poisha)::bigint as supplier_cost_poisha,
         sum(consumption.freight_cost_poisha)::bigint as freight_cost_poisha
  from public.order_item_inventory_consumptions as consumption
  where consumption.purchase_batch_item_id = batch_item.id
) as consumed on true;

create or replace view public.dashboard_procurement_summary
with (security_invoker = true)
as
with expense_totals as (
  select
    coalesce(sum(public.dashboard_money_to_poisha(expense.amount)) filter (
      where expense.accounting_class in ('inventory_purchase', 'unallocated_procurement')
    ), 0)::bigint as inventory_purchase_poisha,
    coalesce(sum(public.dashboard_money_to_poisha(expense.amount)) filter (
      where expense.accounting_class = 'freight_in'
    ), 0)::bigint as freight_in_poisha
  from public.expenses as expense
), allocated as (
  select coalesce(sum(allocation.allocated_poisha), 0)::bigint as allocated_poisha
  from public.procurement_expense_allocations as allocation
), unallocated_records as (
  select count(*)::bigint as record_count
  from public.expenses as expense
  left join lateral (
    select coalesce(sum(allocation.allocated_poisha), 0)::bigint as allocated_poisha
    from public.procurement_expense_allocations as allocation
    where allocation.expense_id = expense.id
  ) as allocated on true
  where expense.accounting_class <> 'operating_expense'
    and public.dashboard_money_to_poisha(expense.amount) > allocated.allocated_poisha
), missing_cash as (
  select count(*)::bigint as record_count
  from public.expenses as expense
  where expense.accounting_class <> 'operating_expense'
    and not exists (
      select 1 from public.cash_movements as movement
      where movement.expense_id = expense.id
    )
), inventory as (
  select coalesce(sum(layer.remaining_landed_cost_poisha), 0)::bigint as value_poisha
  from public.dashboard_inventory_cost_layers as layer
)
select
  public.dashboard_poisha_to_money(expense.inventory_purchase_poisha)
    as inventory_purchase_total,
  public.dashboard_poisha_to_money(expense.freight_in_poisha) as freight_in_total,
  public.dashboard_poisha_to_money(allocated.allocated_poisha)
    as allocated_procurement_total,
  public.dashboard_poisha_to_money(
    expense.inventory_purchase_poisha + expense.freight_in_poisha
      - allocated.allocated_poisha
  ) as unallocated_procurement_total,
  public.dashboard_poisha_to_money(inventory.value_poisha) as known_inventory_value,
  unallocated_records.record_count as unallocated_record_count,
  missing_cash.record_count as missing_cash_movement_count
from expense_totals as expense
cross join allocated
cross join unallocated_records
cross join missing_cash
cross join inventory;

create or replace view public.dashboard_reconciliation
with (security_invoker = true)
as
with order_totals as (
  select
    count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint
      as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue), 0)::numeric(14,2) as product_revenue,
    coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(recognized_cogs), 0)::numeric(14,2) end as cogs,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(gross_profit), 0)::numeric(14,2) end as gross_profit,
    case when count(*) filter (
      where not cogs_complete or not fulfillment_costs_complete
    ) = 0 then coalesce(sum(contribution_profit), 0)::numeric(14,2)
      end as contribution_profit
  from public.dashboard_order_financials
), ads as (
  select coalesce(sum(amount), 0)::numeric(14,2) as ad_spend
  from public.daily_ad_spend
), operating as (
  select coalesce(sum(amount), 0)::numeric(14,2) as expenses
  from public.expenses where accounting_class = 'operating_expense'
)
select
  orders.delivered_order_count,
  orders.delivered_orders_missing_cogs,
  orders.delivered_orders_missing_fulfillment_costs,
  orders.product_revenue,
  orders.net_revenue,
  orders.cogs,
  orders.gross_profit,
  orders.contribution_profit,
  case when orders.delivered_order_count = 0 then 0 else round(
    orders.net_revenue / orders.delivered_order_count, 2
  ) end::numeric(14,2) as average_order_value,
  ads.ad_spend,
  operating.expenses,
  case when orders.contribution_profit is null then null else
    (orders.contribution_profit - ads.ad_spend - operating.expenses)::numeric(14,2)
  end as net_profit,
  case when orders.contribution_profit is null or orders.net_revenue = 0
    then null else round(
      (orders.contribution_profit - ads.ad_spend - operating.expenses)
        / orders.net_revenue * 100, 2
    ) end::numeric(8,2) as profit_margin
from order_totals as orders cross join ads cross join operating;

create or replace view public.dashboard_daily_financials
with (security_invoker = true)
as
with orders_by_day as (
  select
    order_date as business_date,
    count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint
      as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue), 0)::numeric(14,2) as product_revenue,
    coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(recognized_cogs), 0)::numeric(14,2) end as cogs,
    case when count(*) filter (where not cogs_complete) = 0
      then coalesce(sum(gross_profit), 0)::numeric(14,2) end as gross_profit,
    case when count(*) filter (
      where not cogs_complete or not fulfillment_costs_complete
    ) = 0 then coalesce(sum(contribution_profit), 0)::numeric(14,2)
      end as contribution_profit
  from public.dashboard_order_financials group by order_date
), expenses_by_day as (
  select expense_date as business_date, sum(amount)::numeric(14,2) as expenses
  from public.expenses where accounting_class = 'operating_expense'
  group by expense_date
), ads_by_day as (
  select spend_date as business_date, sum(amount)::numeric(14,2) as ad_spend
  from public.daily_ad_spend group by spend_date
), business_dates as (
  select business_date from orders_by_day union
  select business_date from expenses_by_day union
  select business_date from ads_by_day
)
select
  dates.business_date,
  coalesce(orders.delivered_order_count, 0)::bigint as delivered_order_count,
  coalesce(orders.delivered_orders_missing_cogs, 0)::bigint as delivered_orders_missing_cogs,
  coalesce(orders.delivered_orders_missing_fulfillment_costs, 0)::bigint
    as delivered_orders_missing_fulfillment_costs,
  coalesce(orders.product_revenue, 0)::numeric(14,2) as product_revenue,
  coalesce(orders.net_revenue, 0)::numeric(14,2) as net_revenue,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.cogs, 0)::numeric(14,2) end as cogs,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
    then coalesce(orders.gross_profit, 0)::numeric(14,2) end as gross_profit,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) = 0
      and coalesce(orders.delivered_orders_missing_fulfillment_costs, 0) = 0
    then coalesce(orders.contribution_profit, 0)::numeric(14,2)
    end as contribution_profit,
  case when coalesce(orders.delivered_order_count, 0) = 0 then 0 else round(
    orders.net_revenue / orders.delivered_order_count, 2
  ) end::numeric(14,2) as average_order_value,
  coalesce(expenses.expenses, 0)::numeric(14,2) as expenses,
  coalesce(ads.ad_spend, 0)::numeric(14,2) as ad_spend,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) > 0
      or coalesce(orders.delivered_orders_missing_fulfillment_costs, 0) > 0
    then null else (coalesce(orders.contribution_profit, 0)
      - coalesce(expenses.expenses, 0) - coalesce(ads.ad_spend, 0))::numeric(14,2)
    end as net_profit,
  case when coalesce(orders.delivered_orders_missing_cogs, 0) > 0
      or coalesce(orders.delivered_orders_missing_fulfillment_costs, 0) > 0
      or coalesce(orders.net_revenue, 0) = 0 then null else round(
        (coalesce(orders.contribution_profit, 0)
          - coalesce(expenses.expenses, 0) - coalesce(ads.ad_spend, 0))
          / orders.net_revenue * 100, 2
      ) end::numeric(8,2) as profit_margin
from business_dates as dates
left join orders_by_day as orders using (business_date)
left join expenses_by_day as expenses using (business_date)
left join ads_by_day as ads using (business_date);

create or replace function public.get_dashboard_financial_summary(
  p_start_date date default null,
  p_end_date date default null,
  p_sales_channel text default null,
  p_campaign_id uuid default null
)
returns table (
  delivered_order_count bigint,
  delivered_orders_missing_cogs bigint,
  delivered_orders_missing_fulfillment_costs bigint,
  product_revenue numeric(14,2),
  net_revenue numeric(14,2),
  cogs numeric(14,2),
  gross_profit numeric(14,2),
  contribution_profit numeric(14,2),
  average_order_value numeric(14,2),
  ad_spend numeric(14,2),
  expenses numeric(14,2),
  net_profit numeric(14,2),
  profit_margin numeric(8,2)
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(array[
    'owner', 'admin', 'viewer'
  ]::public.dashboard_role[]) then
    raise exception 'Dashboard reporting access is required.' using errcode = '42501';
  end if;
  if p_start_date is not null and p_end_date is not null
     and p_start_date > p_end_date then
    raise exception 'Start date must not be after end date.' using errcode = '22023';
  end if;

  return query
  with filtered_orders as (
    select financial.* from public.dashboard_order_financials as financial
    where (p_start_date is null or financial.order_date >= p_start_date)
      and (p_end_date is null or financial.order_date <= p_end_date)
      and (p_sales_channel is null
        or lower(financial.sales_channel) = lower(p_sales_channel))
      and (p_campaign_id is null or financial.campaign_id = p_campaign_id)
  ), orders as (
    select
      count(*)::bigint as delivered_order_count,
      count(*) filter (where not cogs_complete)::bigint as missing_cogs,
      count(*) filter (where not fulfillment_costs_complete)::bigint as missing_fulfillment,
      coalesce(sum(recognized_product_revenue), 0)::numeric(14,2) as product_revenue,
      coalesce(sum(net_revenue), 0)::numeric(14,2) as net_revenue,
      case when count(*) filter (where not cogs_complete) = 0
        then coalesce(sum(recognized_cogs), 0)::numeric(14,2) end as cogs,
      case when count(*) filter (where not cogs_complete) = 0
        then coalesce(sum(gross_profit), 0)::numeric(14,2) end as gross_profit,
      case when count(*) filter (
        where not cogs_complete or not fulfillment_costs_complete
      ) = 0 then coalesce(sum(contribution_profit), 0)::numeric(14,2)
        end as contribution_profit
    from filtered_orders
  ), ads as (
    select coalesce(sum(spend.amount), 0)::numeric(14,2) as ad_spend
    from public.daily_ad_spend as spend
    where (p_start_date is null or spend.spend_date >= p_start_date)
      and (p_end_date is null or spend.spend_date <= p_end_date)
      and (p_sales_channel is null or lower(spend.platform) = lower(p_sales_channel))
      and (p_campaign_id is null or spend.campaign_id = p_campaign_id)
  ), operating as (
    select coalesce(sum(expense.amount), 0)::numeric(14,2) as expenses
    from public.expenses as expense
    where expense.accounting_class = 'operating_expense'
      and (p_start_date is null or expense.expense_date >= p_start_date)
      and (p_end_date is null or expense.expense_date <= p_end_date)
      and (p_sales_channel is null
        or lower(expense.sales_channel) = lower(p_sales_channel))
      and (p_campaign_id is null or expense.campaign_id = p_campaign_id)
  )
  select
    orders.delivered_order_count,
    orders.missing_cogs,
    orders.missing_fulfillment,
    orders.product_revenue,
    orders.net_revenue,
    orders.cogs,
    orders.gross_profit,
    orders.contribution_profit,
    case when orders.delivered_order_count = 0 then 0 else round(
      orders.net_revenue / orders.delivered_order_count, 2
    ) end::numeric(14,2),
    ads.ad_spend,
    operating.expenses,
    case when orders.contribution_profit is null then null else
      (orders.contribution_profit - ads.ad_spend - operating.expenses)::numeric(14,2)
    end,
    case when orders.contribution_profit is null or orders.net_revenue = 0
      then null else round(
        (orders.contribution_profit - ads.ad_spend - operating.expenses)
          / orders.net_revenue * 100, 2
      ) end::numeric(8,2)
  from orders cross join ads cross join operating;
end
$function$;

create or replace view public.dashboard_data_quality_checks
with (security_invoker = true)
as
select
  (select count(*) from public.order_items
    where order_id is null or product_id is null)::bigint
    as order_items_with_missing_links,
  (select count(*) from (
    select order_number from public.orders group by order_number having count(*) > 1
  ) duplicates)::bigint as duplicate_order_numbers,
  (select count(*) from public.products
    where sku is null or btrim(sku) = '')::bigint as products_with_missing_sku,
  (select count(*) from (
    select lower(btrim(sku)) from public.products
    where sku is not null and btrim(sku) <> ''
    group by lower(btrim(sku)) having count(*) > 1
  ) duplicates)::bigint as duplicate_product_skus,
  (select count(*) from public.orders as orders
    where orders.dashboard_order_status = 'Delivered' and not exists (
      select 1 from public.order_items as item where item.order_id = orders.id
    ))::bigint as delivered_orders_without_items,
  (select count(*) from public.orders as orders
    where orders.dashboard_order_status = 'Delivered'
      and exists (select 1 from public.order_items item where item.order_id = orders.id)
      and not exists (select 1 from public.order_financial_snapshots snapshot
        where snapshot.order_id = orders.id))::bigint
    as delivered_orders_missing_financial_snapshot,
  (select count(*) from public.order_financial_snapshots as snapshot
    where snapshot.product_revenue is distinct from (
      select coalesce(sum(item.quantity * coalesce(
        item.actual_unit_selling_price, item.unit_price
      )), 0)::numeric(14,2)
      from public.order_items as item where item.order_id = snapshot.order_id
    ))::bigint as snapshot_product_revenue_mismatches,
  (select count(*) from public.order_financial_snapshots as snapshot
    where snapshot.cogs_complete and snapshot.cogs is distinct from (
      select sum(case when item.landed_cost_total_snapshot_poisha is not null
        then public.dashboard_poisha_to_money(item.landed_cost_total_snapshot_poisha)
        else item.quantity * item.buying_cost_snapshot end)::numeric(14,2)
      from public.order_items as item where item.order_id = snapshot.order_id
    ))::bigint as snapshot_cogs_mismatches,
  (select count(*) from public.expenses
    where accounting_class = 'operating_expense'
      and lower(category_key) in ('product_purchase', 'stock_purchase', 'inventory_purchase'))::bigint
    as inventory_purchases_recorded_as_operating_expense,
  (select count(*) from public.expenses
    where accounting_class = 'operating_expense'
      and lower(category_key) in ('freight_in', 'inventory_procurement_transport'))::bigint
    as supplier_freight_recorded_as_operating_expense,
  (select count(*) from public.order_item_financial_allocations
    where landed_cost_snapshot_source is null)::bigint
    as delivered_items_missing_landed_cost_snapshot,
  (select count(*) from public.purchase_batch_items where quantity <= 0)::bigint
    as procurement_batches_missing_quantity,
  (select count(*) from public.purchase_batch_items where product_id is null)::bigint
    as procurement_batches_missing_product,
  (select count(*) from public.expenses as expense
    left join lateral (
      select coalesce(sum(allocation.allocated_poisha), 0)::bigint as amount
      from public.procurement_expense_allocations allocation
      where allocation.expense_id = expense.id
        and allocation.allocation_type = 'freight'
    ) allocated on true
    where expense.accounting_class = 'freight_in'
      and public.dashboard_money_to_poisha(expense.amount) > allocated.amount)::bigint
    as unallocated_freight_in,
  (select count(*) from public.purchase_batch_items
    where supplier_unit_cost_poisha < 0 or allocated_freight_poisha < 0
      or landed_cost_total_poisha < 0 or landed_unit_cost_poisha < 0)::bigint
    as invalid_landed_cost,
  (select count(*) from public.purchase_batches as batch
    left join lateral (
      select coalesce(sum(item.supplier_product_cost_poisha), 0)::bigint as merchandise,
             coalesce(sum(item.allocated_freight_poisha), 0)::bigint as freight
      from public.purchase_batch_items item where item.purchase_batch_id = batch.id
    ) item_totals on true
    left join lateral (
      select coalesce(sum(allocation.allocated_poisha) filter (
               where allocation.allocation_type = 'merchandise'), 0)::bigint as merchandise,
             coalesce(sum(allocation.allocated_poisha) filter (
               where allocation.allocation_type = 'freight'), 0)::bigint as freight
      from public.procurement_expense_allocations allocation
      where allocation.purchase_batch_id = batch.id
    ) expense_totals on true
    where batch.merchandise_total_poisha <> item_totals.merchandise
      or batch.freight_total_poisha <> item_totals.freight
      or batch.merchandise_total_poisha <> expense_totals.merchandise
      or batch.freight_total_poisha <> expense_totals.freight)::bigint
    as purchase_batch_allocation_mismatches,
  (select count(*) from public.expenses
    where lower(category_key) in ('advertising', 'advertising_spend', 'ad_spend'))::bigint
    as advertising_duplicated_in_expenses,
  (select count(*) from public.expenses
    where lower(category_key) in (
      'courier', 'courier_cost', 'order_fulfillment', 'order_packaging'
    ))::bigint as fulfillment_duplicated_in_expenses,
  (select count(*) from public.dashboard_inventory_cost_layers
    where remaining_quantity < 0 or remaining_landed_cost_poisha < 0)::bigint
    as inventory_valuation_mismatches,
  (select unallocated_record_count from public.dashboard_procurement_summary)::bigint
    as unallocated_procurement_records,
  (select missing_cash_movement_count from public.dashboard_procurement_summary)::bigint
    as procurement_records_missing_cash_movement;

alter table public.purchase_batches enable row level security;
alter table public.purchase_batch_items enable row level security;
alter table public.procurement_expense_allocations enable row level security;
alter table public.order_item_inventory_consumptions enable row level security;

create policy "Dashboard owners and admins read purchase batches"
on public.purchase_batches for select to authenticated
using (public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]));
create policy "Dashboard owners and admins read purchase batch items"
on public.purchase_batch_items for select to authenticated
using (public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]));
create policy "Dashboard owners and admins read procurement allocations"
on public.procurement_expense_allocations for select to authenticated
using (public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]));
create policy "Dashboard owners and admins read inventory consumptions"
on public.order_item_inventory_consumptions for select to authenticated
using (public.dashboard_has_any_role(array['owner', 'admin']::public.dashboard_role[]));

revoke all on table public.purchase_batches, public.purchase_batch_items,
  public.procurement_expense_allocations, public.order_item_inventory_consumptions
from public, anon, authenticated, service_role;
grant select on table public.purchase_batches, public.purchase_batch_items,
  public.procurement_expense_allocations, public.order_item_inventory_consumptions
to authenticated;

revoke all on table public.dashboard_inventory_cost_layers,
  public.dashboard_procurement_summary, public.dashboard_reconciliation,
  public.dashboard_daily_financials, public.dashboard_data_quality_checks
from public, anon, authenticated, service_role;
grant select on table public.dashboard_inventory_cost_layers,
  public.dashboard_procurement_summary, public.dashboard_reconciliation,
  public.dashboard_daily_financials, public.dashboard_data_quality_checks
to authenticated;

revoke all on function public.dashboard_expense_accounting_class(text),
  public.dashboard_classify_expense(),
  public.dashboard_reject_procurement_history_mutation(),
  public.dashboard_fill_allocation_landed_cost(),
  public.dashboard_consume_landed_inventory(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.record_purchase_batch(
  date, text, text, text, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_purchase_batch(
  date, text, text, text, jsonb, jsonb
) to authenticated;

revoke all on function public.get_dashboard_financial_summary(
  date, date, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.get_dashboard_financial_summary(
  date, date, text, uuid
) to authenticated, service_role;

grant execute on function public.dashboard_capture_delivered_snapshot()
to authenticated, service_role;

commit;
