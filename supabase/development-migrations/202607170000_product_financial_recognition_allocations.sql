-- DEVELOPMENT SQL EDITOR PROPOSAL ONLY. NOT APPROVED FOR PRODUCTION.
-- Apply only after setting the acknowledgement documented in the review contract.
-- This proposal requires an empty recognition ledger and performs no backfill.

do $development_guard$
begin
  if current_setting(
    'nexanotion.development_financial_allocation_ack',
    true
  ) is distinct from 'reviewed-development-only' then
    raise exception 'Development financial-allocation acknowledgement is missing.';
  end if;

  if to_regclass('public.order_financial_snapshots') is null
     or to_regclass('public.order_financial_adjustments') is null
     or to_regclass('public.order_items') is null
     or to_regprocedure('public.dashboard_has_any_role(public.dashboard_role[])') is null then
    raise exception 'The verified dashboard migration chain must exist first.';
  end if;

  if exists (select 1 from public.order_financial_snapshots)
     or exists (select 1 from public.order_financial_adjustments) then
    raise exception 'Recognition history exists. Use a separately reviewed evidence-based backfill.';
  end if;
end
$development_guard$;

alter table public.orders
  add column refund_scope text,
  add column return_disposition text,
  add column refund_review_status text not null default 'needs_review';

alter table public.orders
  add constraint orders_refund_scope_allowed
    check (
      refund_scope is null
      or refund_scope in ('product_only', 'delivery_only', 'full_order')
    ),
  add constraint orders_return_disposition_allowed
    check (
      return_disposition is null
      or return_disposition in ('not_applicable', 'not_returned')
    ),
  add constraint orders_refund_review_status_allowed
    check (refund_review_status in ('resolved', 'needs_review')),
  add constraint orders_refund_evidence_consistent check (
    (
      refund_review_status = 'needs_review'
      and refund_scope is null
      and return_disposition is null
    )
    or (
      refund_review_status = 'resolved'
      and return_disposition is not null
      and (refund_amount = 0 or refund_scope is not null)
    )
  );

alter table public.order_financial_snapshots
  add column order_origin_date date,
  add column original_refund_scope text,
  add column original_return_disposition text,
  add column original_refund_review_status text not null
    default 'needs_review';

alter table public.order_financial_snapshots
  add constraint order_financial_snapshots_refund_scope_allowed
    check (
      original_refund_scope is null
      or original_refund_scope in (
        'product_only', 'delivery_only', 'full_order'
      )
    ),
  add constraint order_financial_snapshots_return_disposition_allowed
    check (
      original_return_disposition is null
      or original_return_disposition in ('not_applicable', 'not_returned')
    ),
  add constraint order_financial_snapshots_review_status_allowed
    check (original_refund_review_status in ('resolved', 'needs_review')),
  add constraint order_financial_snapshots_refund_evidence_consistent check (
    (
      original_refund_review_status = 'needs_review'
      and original_refund_scope is null
      and original_return_disposition is null
      and refund_amount > 0
    )
    or (
      original_refund_review_status = 'resolved'
      and original_return_disposition is not null
      and (refund_amount = 0 or original_refund_scope is not null)
    )
  );

create table public.order_item_financial_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null
    references public.order_financial_snapshots(order_id) on delete restrict,
  order_item_id uuid not null
    references public.order_items(id) on delete restrict,
  product_id_snapshot uuid not null
    references public.products(id) on delete restrict,
  sku_snapshot text not null,
  product_name_snapshot text not null,
  quantity integer not null,
  gross_product_revenue_poisha bigint not null,
  delivery_revenue_poisha bigint not null,
  product_discount_poisha bigint not null,
  delivery_discount_poisha bigint not null,
  discount_poisha bigint generated always as (
    product_discount_poisha + delivery_discount_poisha
  ) stored,
  original_product_refund_poisha bigint not null,
  original_delivery_refund_poisha bigint not null,
  original_refund_poisha bigint generated always as (
    original_product_refund_poisha + original_delivery_refund_poisha
  ) stored,
  product_net_revenue_poisha bigint generated always as (
    gross_product_revenue_poisha - product_discount_poisha
      - original_product_refund_poisha
  ) stored,
  delivery_net_revenue_poisha bigint generated always as (
    delivery_revenue_poisha - delivery_discount_poisha
      - original_delivery_refund_poisha
  ) stored,
  net_revenue_poisha bigint generated always as (
    gross_product_revenue_poisha + delivery_revenue_poisha
      - product_discount_poisha - delivery_discount_poisha
      - original_product_refund_poisha
      - original_delivery_refund_poisha
  ) stored,
  cogs_poisha bigint,
  courier_cost_poisha bigint,
  packaging_cost_poisha bigint,
  recognized_at timestamptz not null,
  allocation_version smallint not null default 2,
  created_at timestamptz not null default now(),
  constraint order_item_financial_allocations_order_item_key
    unique (order_item_id),
  constraint order_item_financial_allocations_id_order_key
    unique (id, order_id),
  constraint order_item_financial_allocations_quantity_positive
    check (quantity > 0),
  constraint order_item_financial_allocations_dimensions_present check (
    btrim(sku_snapshot) <> '' and btrim(product_name_snapshot) <> ''
  ),
  constraint order_item_financial_allocations_values_nonnegative check (
    gross_product_revenue_poisha >= 0
    and delivery_revenue_poisha >= 0
    and product_discount_poisha >= 0
    and delivery_discount_poisha >= 0
    and product_discount_poisha <= gross_product_revenue_poisha
    and delivery_discount_poisha <= delivery_revenue_poisha
    and original_product_refund_poisha >= 0
    and original_delivery_refund_poisha >= 0
    and original_product_refund_poisha
      <= gross_product_revenue_poisha - product_discount_poisha
    and original_delivery_refund_poisha
      <= delivery_revenue_poisha - delivery_discount_poisha
    and product_net_revenue_poisha >= 0
    and delivery_net_revenue_poisha >= 0
    and net_revenue_poisha >= 0
    and (cogs_poisha is null or cogs_poisha >= 0)
    and (courier_cost_poisha is null or courier_cost_poisha >= 0)
    and (packaging_cost_poisha is null or packaging_cost_poisha >= 0)
  ),
  constraint order_item_financial_allocations_version_two
    check (allocation_version = 2)
);

alter table public.order_financial_adjustments
  add column allocation_method text not null
    default 'unallocated_needs_review',
  add column refund_scope text,
  add column return_disposition text,
  add column refund_review_status text not null default 'needs_review',
  add column item_allocation_request jsonb,
  add column idempotency_key text;

alter table public.order_financial_adjustments
  drop constraint order_financial_adjustments_delta_nonzero;
alter table public.order_financial_adjustments
  add constraint order_financial_adjustments_delta_positive
    check (amount_delta > 0),
  add constraint order_financial_adjustments_allocation_method_allowed
    check (allocation_method in (
      'explicit', 'proportional_remaining', 'unallocated_needs_review'
    )),
  add constraint order_financial_adjustments_refund_scope_allowed
    check (
      refund_scope is null
      or refund_scope in ('product_only', 'delivery_only', 'full_order')
    ),
  add constraint order_financial_adjustments_return_disposition_allowed
    check (
      return_disposition is null
      or return_disposition in ('not_applicable', 'not_returned')
    ),
  add constraint order_financial_adjustments_review_status_allowed
    check (refund_review_status in ('resolved', 'needs_review')),
  add constraint order_financial_adjustments_evidence_consistent check (
    (
      refund_review_status = 'needs_review'
      and refund_scope is null
      and return_disposition is null
      and allocation_method = 'unallocated_needs_review'
      and item_allocation_request is null
    )
    or (
      refund_review_status = 'resolved'
      and refund_scope is not null
      and return_disposition is not null
      and allocation_method in ('explicit', 'proportional_remaining')
    )
  ),
  add constraint order_financial_adjustments_refund_request_consistent check (
    refund_review_status = 'needs_review'
    or (
      allocation_method = 'explicit'
      and refund_scope in ('product_only', 'delivery_only')
      and item_allocation_request is not null
      and jsonb_typeof(item_allocation_request) = 'array'
    )
    or (
      allocation_method = 'proportional_remaining'
      and item_allocation_request is null
    )
  ),
  add constraint order_financial_adjustments_id_order_key
    unique (id, order_id);

create unique index order_financial_adjustments_idempotency_uidx
  on public.order_financial_adjustments (order_id, idempotency_key)
  where idempotency_key is not null;

create table public.order_item_refund_allocations (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null,
  recognition_allocation_id uuid not null,
  order_id uuid not null,
  product_refund_poisha bigint not null default 0,
  delivery_refund_poisha bigint not null default 0,
  refund_poisha bigint generated always as (
    product_refund_poisha + delivery_refund_poisha
  ) stored,
  created_at timestamptz not null default now(),
  constraint order_item_refund_allocations_adjustment_order_fkey
    foreign key (adjustment_id, order_id)
    references public.order_financial_adjustments(id, order_id)
    on delete restrict,
  constraint order_item_refund_allocations_recognition_order_fkey
    foreign key (recognition_allocation_id, order_id)
    references public.order_item_financial_allocations(id, order_id)
    on delete restrict,
  constraint order_item_refund_allocations_event_item_key
    unique (adjustment_id, recognition_allocation_id),
  constraint order_item_refund_allocations_amount_positive check (
    product_refund_poisha >= 0
    and delivery_refund_poisha >= 0
    and refund_poisha > 0
  )
);

create table public.order_return_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null
    references public.order_financial_snapshots(order_id) on delete restrict,
  return_disposition text not null,
  occurred_on date not null,
  return_source text not null,
  item_request jsonb not null,
  idempotency_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_return_events_id_order_key unique (id, order_id),
  constraint order_return_events_idempotency_key
    unique (order_id, idempotency_key),
  constraint order_return_events_disposition_allowed
    check (return_disposition in ('returned_resellable', 'returned_damaged')),
  constraint order_return_events_source_allowed
    check (return_source in ('dashboard', 'approved_backfill')),
  constraint order_return_events_request_array
    check (jsonb_typeof(item_request) = 'array')
);

create table public.order_item_return_allocations (
  id uuid primary key default gen_random_uuid(),
  return_event_id uuid not null,
  recognition_allocation_id uuid not null,
  order_id uuid not null,
  return_disposition text not null,
  returned_quantity integer not null,
  potential_cogs_reversal_poisha bigint,
  created_at timestamptz not null default now(),
  constraint order_item_return_allocations_event_order_fkey
    foreign key (return_event_id, order_id)
    references public.order_return_events(id, order_id)
    on delete restrict,
  constraint order_item_return_allocations_recognition_order_fkey
    foreign key (recognition_allocation_id, order_id)
    references public.order_item_financial_allocations(id, order_id)
    on delete restrict,
  constraint order_item_return_allocations_event_item_key
    unique (return_event_id, recognition_allocation_id),
  constraint order_item_return_allocations_id_order_key
    unique (id, order_id),
  constraint order_item_return_allocations_disposition_allowed
    check (return_disposition in (
      'returned_resellable', 'returned_damaged'
    )),
  constraint order_item_return_allocations_quantity_positive
    check (returned_quantity > 0),
  constraint order_item_return_allocations_cogs_nonnegative check (
    potential_cogs_reversal_poisha is null
    or potential_cogs_reversal_poisha >= 0
  )
);

create table public.order_return_inspections (
  id uuid primary key default gen_random_uuid(),
  return_event_id uuid not null unique
    references public.order_return_events(id) on delete restrict,
  inspection_outcome text not null,
  inspected_on date not null,
  idempotency_key text not null unique,
  inspected_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint order_return_inspections_outcome_allowed check (
    inspection_outcome in ('confirmed_resellable', 'confirmed_damaged')
  )
);

create table public.inventory_restoration_movements (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.order_return_inspections(id) on delete restrict,
  return_allocation_id uuid not null unique,
  order_id uuid not null,
  product_id_snapshot uuid not null,
  quantity_delta integer not null,
  cogs_reversal_poisha bigint,
  movement_type text not null default 'returned_resellable',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inventory_restoration_movements_return_order_fkey
    foreign key (return_allocation_id, order_id)
    references public.order_item_return_allocations(id, order_id)
    on delete restrict,
  constraint inventory_restoration_movements_product_fkey
    foreign key (product_id_snapshot)
    references public.products(id) on delete restrict,
  constraint inventory_restoration_movements_quantity_positive
    check (quantity_delta > 0),
  constraint inventory_restoration_movements_cogs_nonnegative
    check (cogs_reversal_poisha is null or cogs_reversal_poisha >= 0),
  constraint inventory_restoration_movements_type_allowed
    check (movement_type = 'returned_resellable')
);

create index order_item_financial_allocations_order_idx
  on public.order_item_financial_allocations (order_id, order_item_id);
create index order_item_financial_allocations_product_idx
  on public.order_item_financial_allocations (
    product_id_snapshot, lower(sku_snapshot), order_id
  );
create index order_item_refund_allocations_recognition_idx
  on public.order_item_refund_allocations (
    recognition_allocation_id, adjustment_id
  );
create index order_item_refund_allocations_order_idx
  on public.order_item_refund_allocations (order_id, adjustment_id);
create index order_item_return_allocations_recognition_idx
  on public.order_item_return_allocations (
    recognition_allocation_id, return_event_id
  );
create index order_item_return_allocations_order_idx
  on public.order_item_return_allocations (order_id, return_event_id);
create index order_return_events_order_idx
  on public.order_return_events (order_id, occurred_on, id);
create index order_return_events_created_by_idx
  on public.order_return_events (created_by)
  where created_by is not null;
create index order_return_inspections_event_idx
  on public.order_return_inspections (return_event_id, inspected_on);
create index order_return_inspections_inspected_by_idx
  on public.order_return_inspections (inspected_by, inspected_on);
create index inventory_restoration_movements_inspection_idx
  on public.inventory_restoration_movements (inspection_id, order_id);
create index inventory_restoration_movements_order_idx
  on public.inventory_restoration_movements (order_id, occurred_at);
create index inventory_restoration_movements_product_idx
  on public.inventory_restoration_movements (
    product_id_snapshot, occurred_at
  );

create or replace function public.dashboard_money_to_poisha(amount numeric)
returns bigint
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
begin
  if amount <> round(amount, 2) then
    raise exception 'Money must have at most two decimal places.'
      using errcode = '22023';
  end if;
  if amount * 100 > 9223372036854775807::numeric
     or amount * 100 < -9223372036854775808::numeric then
    raise exception 'Money exceeds the integer-poisha range.'
      using errcode = '22003';
  end if;
  return (amount * 100)::bigint;
end
$function$;

create or replace function public.dashboard_poisha_to_money(amount bigint)
returns numeric(14,2)
language sql
immutable
strict
set search_path = pg_catalog
as $function$
  select (amount::numeric / 100)::numeric(14,2);
$function$;

create or replace function public.dashboard_allocate_poisha(
  p_total_poisha bigint,
  p_allocation_keys uuid[],
  p_weights bigint[]
)
returns table (allocation_key uuid, allocated_poisha bigint)
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
declare
  weight_sum numeric;
begin
  if p_total_poisha < 0
     or cardinality(p_allocation_keys) = 0
     or cardinality(p_allocation_keys) <> cardinality(p_weights) then
    raise exception 'Allocation total, keys, and weights are invalid.'
      using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_weights) as weight where weight < 0) then
    raise exception 'Allocation weights cannot be negative.'
      using errcode = '22023';
  end if;
  if (
    select count(distinct key_value)
    from unnest(p_allocation_keys) as key_value
  ) <> cardinality(p_allocation_keys) then
    raise exception 'Allocation keys must be unique.' using errcode = '22023';
  end if;

  select sum(weight)::numeric into weight_sum
  from unnest(p_weights) as weight;
  if weight_sum <= 0 then
    raise exception 'At least one allocation weight must be positive.'
      using errcode = '22023';
  end if;

  return query
  with basis as (
    select
      input.key_value,
      input.weight_value,
      floor(
        p_total_poisha::numeric * input.weight_value::numeric / weight_sum
      )::bigint as base_poisha,
      mod(
        p_total_poisha::numeric * input.weight_value::numeric,
        weight_sum
      ) as fractional_numerator
    from unnest(p_allocation_keys, p_weights)
      as input(key_value, weight_value)
  ), ranked as (
    select
      basis.*,
      sum(basis.base_poisha) over ()::bigint as base_total,
      row_number() over (
        order by basis.fractional_numerator desc, basis.key_value
      )::bigint as remainder_rank
    from basis
  )
  select
    ranked.key_value,
    ranked.base_poisha + case
      when ranked.remainder_rank <= p_total_poisha - ranked.base_total
        then 1
      else 0
    end
  from ranked;
end
$function$;

create or replace function public.dashboard_build_item_allocations(
  p_order_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  financial_snapshot public.order_financial_snapshots%rowtype;
  item_count integer;
  line_revenue_total bigint;
  known_cogs_total bigint;
  item_cogs_complete boolean;
  delivery_total bigint;
  discount_total bigint;
  product_discount_total bigint;
  delivery_discount_total bigint;
  original_refund_total bigint;
  product_refund_total bigint;
  delivery_refund_total bigint;
  product_refundable_total bigint;
  delivery_refundable_total bigint;
  courier_total bigint;
  packaging_total bigint;
begin
  select * into strict financial_snapshot
  from public.order_financial_snapshots
  where order_id = p_order_id;

  if financial_snapshot.recognition_status <> 'Delivered' then
    raise exception 'Only Delivered snapshots receive item allocations.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.order_item_financial_allocations
    where order_id = p_order_id
  ) then
    raise exception 'Item recognition allocations already exist.'
      using errcode = '23505';
  end if;

  select
    count(*)::integer,
    coalesce(sum(public.dashboard_money_to_poisha(
      item.quantity::numeric * coalesce(
        item.actual_unit_selling_price,
        item.unit_price
      )
    )), 0)::bigint,
    count(*) > 0 and bool_and(item.buying_cost_snapshot is not null),
    coalesce(sum(public.dashboard_money_to_poisha(
      item.quantity::numeric * item.buying_cost_snapshot
    )) filter (where item.buying_cost_snapshot is not null), 0)::bigint
  into item_count, line_revenue_total, item_cogs_complete, known_cogs_total
  from public.order_items as item
  where item.order_id = p_order_id;

  if item_count = 0 then
    raise exception 'Delivered recognition requires at least one order item.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.order_items as item
    left join public.products as product on product.id = item.product_id
    where item.order_id = p_order_id
      and (
        item.product_id is null
        or nullif(btrim(coalesce(item.sku_snapshot, product.sku)), '') is null
        or nullif(btrim(item.product_name), '') is null
      )
  ) then
    raise exception 'Every recognized item requires immutable product and SKU dimensions.'
      using errcode = '23514';
  end if;

  if line_revenue_total <> public.dashboard_money_to_poisha(
    financial_snapshot.product_revenue
  ) then
    raise exception 'Item revenue does not reconcile to the order snapshot.'
      using errcode = '23514';
  end if;
  if item_cogs_complete is distinct from financial_snapshot.cogs_complete then
    raise exception 'Item COGS completeness does not reconcile to the order snapshot.'
      using errcode = '23514';
  end if;
  if financial_snapshot.cogs_complete
     and known_cogs_total <> public.dashboard_money_to_poisha(
       financial_snapshot.cogs
     ) then
    raise exception 'Item COGS does not reconcile to the order snapshot.'
      using errcode = '23514';
  end if;

  delivery_total := public.dashboard_money_to_poisha(
    financial_snapshot.delivery_revenue
  );
  discount_total := public.dashboard_money_to_poisha(
    financial_snapshot.discount_amount
  );
  original_refund_total := public.dashboard_money_to_poisha(
    financial_snapshot.refund_amount
  );
  courier_total := public.dashboard_money_to_poisha(
    financial_snapshot.courier_cost
  );
  packaging_total := public.dashboard_money_to_poisha(
    financial_snapshot.packaging_cost
  );

  product_discount_total := least(discount_total, line_revenue_total);
  delivery_discount_total := discount_total - product_discount_total;
  product_refundable_total := line_revenue_total - product_discount_total;
  delivery_refundable_total := delivery_total - delivery_discount_total;

  if product_refundable_total < 0 or delivery_refundable_total < 0 then
    raise exception 'Discount components exceed recognized revenue.'
      using errcode = '23514';
  end if;

  if financial_snapshot.original_refund_review_status <> 'resolved' then
    raise exception 'Unresolved original refunds cannot be allocated to products.'
      using errcode = '23514';
  elsif original_refund_total = 0 then
    product_refund_total := 0;
    delivery_refund_total := 0;
  elsif financial_snapshot.original_refund_scope = 'product_only' then
    if original_refund_total > product_refundable_total then
      raise exception 'Product-only refund exceeds recognized product capacity.'
        using errcode = '23514';
    end if;
    product_refund_total := original_refund_total;
    delivery_refund_total := 0;
  elsif financial_snapshot.original_refund_scope = 'delivery_only' then
    if original_refund_total > delivery_refundable_total then
      raise exception 'Delivery-only refund exceeds recognized delivery capacity.'
        using errcode = '23514';
    end if;
    product_refund_total := 0;
    delivery_refund_total := original_refund_total;
  elsif financial_snapshot.original_refund_scope = 'full_order' then
    if original_refund_total
       <> product_refundable_total + delivery_refundable_total then
      raise exception 'Full-order refund must equal all refundable Net Revenue.'
        using errcode = '23514';
    else
      product_refund_total := product_refundable_total;
      delivery_refund_total := delivery_refundable_total;
    end if;
  else
    raise exception 'Resolved original refunds require a supported scope.'
      using errcode = '23514';
  end if;

  with item_basis as (
    select
      item.id as order_item_id,
      item.product_id,
      coalesce(item.sku_snapshot, product.sku) as sku_snapshot,
      item.product_name,
      item.quantity,
      public.dashboard_money_to_poisha(
        item.quantity::numeric * coalesce(
          item.actual_unit_selling_price,
          item.unit_price
        )
      ) as gross_revenue_poisha,
      case when item.buying_cost_snapshot is null then null
        else public.dashboard_money_to_poisha(
          item.quantity::numeric * item.buying_cost_snapshot
        )
      end as cogs_poisha
    from public.order_items as item
    join public.products as product on product.id = item.product_id
    where item.order_id = p_order_id
  ), delivery_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when line_revenue_total > 0
          then gross_revenue_poisha else quantity::bigint end
        order by order_item_id
      ) as weights
    from item_basis
  ), delivery as (
    select allocation.*
    from delivery_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      delivery_total, parameters.keys, parameters.weights
    ) as allocation
  ), after_delivery as (
    select
      item_basis.*,
      delivery.allocated_poisha as delivery_poisha
    from item_basis
    join delivery on delivery.allocation_key = item_basis.order_item_id
  ), product_discount_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when line_revenue_total > 0
          then gross_revenue_poisha else quantity::bigint end
        order by order_item_id
      ) as weights
    from after_delivery
  ), product_discount as (
    select allocation.*
    from product_discount_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      product_discount_total, parameters.keys, parameters.weights
    ) as allocation
  ), delivery_discount_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when delivery_total > 0
          then delivery_poisha else quantity::bigint end
        order by order_item_id
      ) as weights
    from after_delivery
  ), delivery_discount as (
    select allocation.*
    from delivery_discount_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      delivery_discount_total, parameters.keys, parameters.weights
    ) as allocation
  ), after_discount as (
    select
      after_delivery.*,
      product_discount.allocated_poisha as product_discount_poisha,
      delivery_discount.allocated_poisha as delivery_discount_poisha,
      after_delivery.gross_revenue_poisha
        - product_discount.allocated_poisha as product_refundable_poisha,
      after_delivery.delivery_poisha
        - delivery_discount.allocated_poisha as delivery_refundable_poisha
    from after_delivery
    join product_discount
      on product_discount.allocation_key = after_delivery.order_item_id
    join delivery_discount
      on delivery_discount.allocation_key = after_delivery.order_item_id
  ), product_refund_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when product_refundable_total > 0
          then product_refundable_poisha else quantity::bigint end
        order by order_item_id
      ) as weights
    from after_discount
  ), original_product_refund as (
    select allocation.*
    from product_refund_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      product_refund_total, parameters.keys, parameters.weights
    ) as allocation
  ), delivery_refund_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when delivery_refundable_total > 0
          then delivery_refundable_poisha else quantity::bigint end
        order by order_item_id
      ) as weights
    from after_discount
  ), original_delivery_refund as (
    select allocation.*
    from delivery_refund_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      delivery_refund_total, parameters.keys, parameters.weights
    ) as allocation
  ), fulfillment_parameters as (
    select
      array_agg(order_item_id order by order_item_id) as keys,
      array_agg(
        case when product_refundable_total + delivery_refundable_total > 0
          then product_refundable_poisha + delivery_refundable_poisha
          else quantity::bigint end
        order by order_item_id
      ) as weights
    from after_discount
  ), courier as (
    select allocation.*
    from fulfillment_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      courier_total, parameters.keys, parameters.weights
    ) as allocation
  ), packaging as (
    select allocation.*
    from fulfillment_parameters as parameters
    cross join lateral public.dashboard_allocate_poisha(
      packaging_total, parameters.keys, parameters.weights
    ) as allocation
  )
  insert into public.order_item_financial_allocations (
    order_id,
    order_item_id,
    product_id_snapshot,
    sku_snapshot,
    product_name_snapshot,
    quantity,
    gross_product_revenue_poisha,
    delivery_revenue_poisha,
    product_discount_poisha,
    delivery_discount_poisha,
    original_product_refund_poisha,
    original_delivery_refund_poisha,
    cogs_poisha,
    courier_cost_poisha,
    packaging_cost_poisha,
    recognized_at
  )
  select
    p_order_id,
    item.order_item_id,
    item.product_id,
    item.sku_snapshot,
    item.product_name,
    item.quantity,
    item.gross_revenue_poisha,
    item.delivery_poisha,
    item.product_discount_poisha,
    item.delivery_discount_poisha,
    original_product_refund.allocated_poisha,
    original_delivery_refund.allocated_poisha,
    item.cogs_poisha,
    courier.allocated_poisha,
    packaging.allocated_poisha,
    financial_snapshot.recognized_at
  from after_discount as item
  join original_product_refund
    on original_product_refund.allocation_key = item.order_item_id
  join original_delivery_refund
    on original_delivery_refund.allocation_key = item.order_item_id
  left join courier on courier.allocation_key = item.order_item_id
  left join packaging on packaging.allocation_key = item.order_item_id;
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
  select * into current_order
  from public.orders
  where id = new.id;

  if current_order.dashboard_order_status is distinct from 'Delivered'
     or exists (
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
    case when count(*) > 0
        and bool_and(item.buying_cost_snapshot is not null)
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
    order_id, order_number_snapshot, order_date, order_origin_date,
    sales_channel, campaign_id, campaign_name_snapshot, payment_method,
    settlement_status,
    recognition_status, product_revenue, delivery_revenue, discount_amount,
    refund_amount, original_refund_scope, original_return_disposition,
    original_refund_review_status, net_revenue, cogs, cogs_complete,
    courier_cost, packaging_cost, recognized_at, recognition_source, recognized_by
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

create or replace function public.dashboard_validate_refund_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  financial_snapshot public.order_financial_snapshots%rowtype;
  event_poisha bigint;
  product_remaining_poisha bigint;
  delivery_remaining_poisha bigint;
  requested_count integer;
  distinct_item_count integer;
  requested_total bigint;
begin
  select * into financial_snapshot
  from public.order_financial_snapshots
  where order_id = new.order_id
  for update;
  if not found then
    raise exception 'Refunds require an immutable Delivered snapshot.'
      using errcode = '23514';
  end if;

  event_poisha := public.dashboard_money_to_poisha(new.amount_delta);
  new.idempotency_key := nullif(btrim(new.idempotency_key), '');
  if new.idempotency_key is not null and exists (
    select 1
    from public.order_financial_adjustments as adjustment
    where adjustment.order_id = new.order_id
      and adjustment.idempotency_key = new.idempotency_key
  ) then
    raise exception 'The refund idempotency key is already used for this order.'
      using errcode = '23505';
  end if;

  if event_poisha <= 0 then
    raise exception 'Refund adjustments must be positive.' using errcode = '23514';
  end if;
  if new.refund_review_status = 'needs_review' then
    return new;
  elsif new.refund_review_status <> 'resolved' then
    raise exception 'Unknown refund review status.' using errcode = '22023';
  end if;

  with prior as (
    select
      refund.recognition_allocation_id,
      sum(refund.product_refund_poisha)::bigint as product_refund_poisha,
      sum(refund.delivery_refund_poisha)::bigint as delivery_refund_poisha
    from public.order_item_refund_allocations as refund
    where refund.order_id = new.order_id
    group by refund.recognition_allocation_id
  )
  select
    coalesce(sum(
      allocation.product_net_revenue_poisha
        - coalesce(prior.product_refund_poisha, 0)
    ), 0)::bigint,
    coalesce(sum(
      allocation.delivery_net_revenue_poisha
        - coalesce(prior.delivery_refund_poisha, 0)
    ), 0)::bigint
  into product_remaining_poisha, delivery_remaining_poisha
  from public.order_item_financial_allocations as allocation
  left join prior on prior.recognition_allocation_id = allocation.id
  where allocation.order_id = new.order_id;

  if new.refund_scope = 'product_only'
      and event_poisha > product_remaining_poisha then
    raise exception 'Product-only refund exceeds remaining recognized product revenue.'
      using errcode = '23514';
  elsif new.refund_scope = 'delivery_only'
      and event_poisha > delivery_remaining_poisha then
    raise exception 'Delivery refund exceeds remaining recognized delivery revenue.'
      using errcode = '23514';
  elsif new.refund_scope = 'full_order'
      and event_poisha
        <> product_remaining_poisha + delivery_remaining_poisha then
    raise exception 'Full-order refund must equal all remaining recognized Net Revenue.'
      using errcode = '23514';
  elsif new.refund_scope not in (
    'product_only', 'delivery_only', 'full_order'
  ) then
    raise exception 'Unknown refund scope.' using errcode = '22023';
  end if;

  if new.allocation_method = 'explicit' then
    if new.refund_scope = 'full_order' then
      raise exception 'Full-order refunds use complete remaining allocation.'
        using errcode = '22023';
    end if;
    if new.item_allocation_request is null
       or jsonb_typeof(new.item_allocation_request) <> 'array'
       or jsonb_array_length(new.item_allocation_request) = 0 then
      raise exception 'Explicit refunds require item allocations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(new.item_allocation_request) as request(value)
      where jsonb_typeof(request.value) <> 'object'
        or request.value - 'order_item_id' - 'refund_poisha' <> '{}'::jsonb
        or not pg_catalog.pg_input_is_valid(
          request.value ->> 'order_item_id', 'uuid'
        )
        or coalesce(request.value ->> 'refund_poisha', '') !~ '^[0-9]+$'
        or (request.value ->> 'refund_poisha')::numeric <= 0
        or (request.value ->> 'refund_poisha')::numeric
          > 9223372036854775807::numeric
    ) then
      raise exception 'Explicit item allocations must use UUIDs and positive integer poisha.'
        using errcode = '22023';
    end if;

    select
      count(*)::integer,
      count(distinct (request.value ->> 'order_item_id')::uuid)::integer,
      sum((request.value ->> 'refund_poisha')::bigint)::bigint
    into requested_count, distinct_item_count, requested_total
    from jsonb_array_elements(new.item_allocation_request) as request(value);

    if requested_count <> distinct_item_count or requested_total <> event_poisha then
      raise exception 'Explicit item allocations must be unique and equal the refund event.'
        using errcode = '23514';
    end if;

    if exists (
      with requested as (
        select
          (request.value ->> 'order_item_id')::uuid as order_item_id,
          (request.value ->> 'refund_poisha')::bigint as refund_poisha
        from jsonb_array_elements(new.item_allocation_request) as request(value)
      ), prior as (
        select
          refund.recognition_allocation_id,
          sum(refund.product_refund_poisha)::bigint as product_refund_poisha,
          sum(refund.delivery_refund_poisha)::bigint as delivery_refund_poisha
        from public.order_item_refund_allocations as refund
        group by refund.recognition_allocation_id
      )
      select 1
      from requested
      left join public.order_item_financial_allocations as allocation
        on allocation.order_item_id = requested.order_item_id
       and allocation.order_id = new.order_id
      left join prior on prior.recognition_allocation_id = allocation.id
      where allocation.id is null
         or requested.refund_poisha > case new.refund_scope
           when 'product_only' then allocation.product_net_revenue_poisha
             - coalesce(prior.product_refund_poisha, 0)
           when 'delivery_only' then allocation.delivery_net_revenue_poisha
             - coalesce(prior.delivery_refund_poisha, 0)
           else 0
         end
    ) then
      raise exception 'An explicit refund exceeds the item remaining scoped revenue.'
        using errcode = '23514';
    end if;
  elsif new.item_allocation_request is not null then
    raise exception 'Fallback refunds cannot contain explicit item allocations.'
      using errcode = '22023';
  end if;

  return new;
end
$function$;

create or replace function public.dashboard_allocate_refund_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_poisha bigint := public.dashboard_money_to_poisha(new.amount_delta);
begin
  if new.refund_review_status = 'needs_review' then
    return new;
  elsif new.allocation_method = 'explicit' then
    insert into public.order_item_refund_allocations (
      adjustment_id, recognition_allocation_id, order_id,
      product_refund_poisha, delivery_refund_poisha
    )
    select
      new.id,
      allocation.id,
      new.order_id,
      case when new.refund_scope = 'product_only'
        then (request.value ->> 'refund_poisha')::bigint else 0 end,
      case when new.refund_scope = 'delivery_only'
        then (request.value ->> 'refund_poisha')::bigint else 0 end
    from jsonb_array_elements(new.item_allocation_request) as request(value)
    join public.order_item_financial_allocations as allocation
      on allocation.order_item_id = (request.value ->> 'order_item_id')::uuid
     and allocation.order_id = new.order_id;
  elsif new.refund_scope = 'full_order' then
    with prior as (
      select
        refund.recognition_allocation_id,
        sum(refund.product_refund_poisha)::bigint as product_refund_poisha,
        sum(refund.delivery_refund_poisha)::bigint as delivery_refund_poisha
      from public.order_item_refund_allocations as refund
      where refund.order_id = new.order_id
      group by refund.recognition_allocation_id
    ), remaining as (
      select
        allocation.id,
        allocation.product_net_revenue_poisha
          - coalesce(prior.product_refund_poisha, 0)
          as product_remaining_poisha,
        allocation.delivery_net_revenue_poisha
          - coalesce(prior.delivery_refund_poisha, 0)
          as delivery_remaining_poisha
      from public.order_item_financial_allocations as allocation
      left join prior on prior.recognition_allocation_id = allocation.id
      where allocation.order_id = new.order_id
    )
    insert into public.order_item_refund_allocations (
      adjustment_id, recognition_allocation_id, order_id,
      product_refund_poisha, delivery_refund_poisha
    )
    select
      new.id, remaining.id, new.order_id,
      remaining.product_remaining_poisha,
      remaining.delivery_remaining_poisha
    from remaining
    where remaining.product_remaining_poisha
      + remaining.delivery_remaining_poisha > 0;
  else
    with prior as (
      select
        refund.recognition_allocation_id,
        sum(refund.product_refund_poisha)::bigint as product_refund_poisha,
        sum(refund.delivery_refund_poisha)::bigint as delivery_refund_poisha
      from public.order_item_refund_allocations as refund
      where refund.order_id = new.order_id
      group by refund.recognition_allocation_id
    ), remaining as (
      select
        allocation.id,
        allocation.order_item_id,
        case new.refund_scope
          when 'product_only' then allocation.product_net_revenue_poisha
            - coalesce(prior.product_refund_poisha, 0)
          when 'delivery_only' then allocation.delivery_net_revenue_poisha
            - coalesce(prior.delivery_refund_poisha, 0)
        end as remaining_poisha
      from public.order_item_financial_allocations as allocation
      left join prior on prior.recognition_allocation_id = allocation.id
      where allocation.order_id = new.order_id
    ), parameters as (
      select
        array_agg(order_item_id order by order_item_id) as keys,
        array_agg(remaining_poisha order by order_item_id) as weights
      from remaining
    ), apportioned as (
      select allocation.*
      from parameters
      cross join lateral public.dashboard_allocate_poisha(
        event_poisha, parameters.keys, parameters.weights
      ) as allocation
    )
    insert into public.order_item_refund_allocations (
      adjustment_id, recognition_allocation_id, order_id,
      product_refund_poisha, delivery_refund_poisha
    )
    select
      new.id, remaining.id, new.order_id,
      case when new.refund_scope = 'product_only'
        then apportioned.allocated_poisha else 0 end,
      case when new.refund_scope = 'delivery_only'
        then apportioned.allocated_poisha else 0 end
    from apportioned
    join remaining on remaining.order_item_id = apportioned.allocation_key
    where apportioned.allocated_poisha > 0;
  end if;
  return new;
end
$function$;

drop trigger if exists order_financial_adjustments_validate_refund
  on public.order_financial_adjustments;
create trigger order_financial_adjustments_validate_refund
before insert on public.order_financial_adjustments
for each row execute function public.dashboard_validate_refund_adjustment();

drop trigger if exists order_financial_adjustments_allocate_refund
  on public.order_financial_adjustments;
create trigger order_financial_adjustments_allocate_refund
after insert on public.order_financial_adjustments
for each row execute function public.dashboard_allocate_refund_adjustment();

create or replace function public.dashboard_validate_return_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_count integer;
  distinct_item_count integer;
begin
  perform 1
  from public.order_financial_snapshots
  where order_id = new.order_id and recognition_status = 'Delivered'
  for update;
  if not found then
    raise exception 'Returns require an immutable Delivered snapshot.'
      using errcode = '23514';
  end if;
  new.idempotency_key := nullif(btrim(new.idempotency_key), '');
  if new.idempotency_key is null
     or jsonb_array_length(new.item_request) = 0 then
    raise exception 'Returns require an idempotency key and item quantities.'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.item_request) as request(value)
    where jsonb_typeof(request.value) <> 'object'
      or request.value - 'order_item_id' - 'returned_quantity' <> '{}'::jsonb
      or not pg_catalog.pg_input_is_valid(
        request.value ->> 'order_item_id', 'uuid'
      )
      or coalesce(request.value ->> 'returned_quantity', '') !~ '^[0-9]+$'
      or (request.value ->> 'returned_quantity')::numeric <= 0
      or (request.value ->> 'returned_quantity')::numeric > 2147483647::numeric
  ) then
    raise exception 'Return items must use UUIDs and positive integer quantities.'
      using errcode = '22023';
  end if;
  select count(*)::integer,
    count(distinct (request.value ->> 'order_item_id')::uuid)::integer
  into requested_count, distinct_item_count
  from jsonb_array_elements(new.item_request) as request(value);
  if requested_count <> distinct_item_count then
    raise exception 'Return item requests must use unique order-item IDs.'
      using errcode = '23514';
  end if;
  if exists (
    with requested as (
      select
        (request.value ->> 'order_item_id')::uuid as order_item_id,
        (request.value ->> 'returned_quantity')::integer as returned_quantity
      from jsonb_array_elements(new.item_request) as request(value)
    ), prior as (
      select recognition_allocation_id,
        sum(returned_quantity)::integer as returned_quantity
      from public.order_item_return_allocations
      group by recognition_allocation_id
    )
    select 1
    from requested
    left join public.order_item_financial_allocations as allocation
      on allocation.order_item_id = requested.order_item_id
     and allocation.order_id = new.order_id
    left join prior on prior.recognition_allocation_id = allocation.id
    where allocation.id is null
       or requested.returned_quantity
         > allocation.quantity - coalesce(prior.returned_quantity, 0)
  ) then
    raise exception 'Returned quantity exceeds immutable delivered quantity.'
      using errcode = '23514';
  end if;
  return new;
end
$function$;

create or replace function public.dashboard_allocate_return_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin

  insert into public.order_item_return_allocations (
    return_event_id, recognition_allocation_id, order_id,
    return_disposition, returned_quantity, potential_cogs_reversal_poisha
  )
  select
    new.id,
    allocation.id,
    new.order_id,
    new.return_disposition,
    (request.value ->> 'returned_quantity')::integer,
    case when allocation.cogs_poisha is null then null
      when mod(allocation.cogs_poisha, allocation.quantity) <> 0 then null
      else allocation.cogs_poisha / allocation.quantity
        * (request.value ->> 'returned_quantity')::integer
    end
  from jsonb_array_elements(new.item_request) as request(value)
  join public.order_item_financial_allocations as allocation
    on allocation.order_item_id = (request.value ->> 'order_item_id')::uuid
   and allocation.order_id = new.order_id
  order by allocation.order_item_id;
  return new;
end
$function$;

create trigger order_return_events_validate
before insert on public.order_return_events
for each row execute function public.dashboard_validate_return_event();

create trigger order_return_events_allocate
after insert on public.order_return_events
for each row execute function public.dashboard_allocate_return_event();

create or replace function public.dashboard_capture_refund_adjustment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  financial_snapshot public.order_financial_snapshots%rowtype;
  ledger_refund numeric(14,2);
  maximum_refund numeric(14,2);
  explicit_refund_evidence boolean;
begin
  if new.refund_amount is not distinct from old.refund_amount then
    return new;
  end if;

  select * into financial_snapshot
  from public.order_financial_snapshots
  where order_id = new.id
  for update;
  if not found then
    return new;
  end if;

  select (
    financial_snapshot.refund_amount + coalesce(sum(amount_delta), 0)
  )::numeric(14,2)
  into ledger_refund
  from public.order_financial_adjustments
  where order_id = new.id;
  maximum_refund := (
    financial_snapshot.product_revenue
    + financial_snapshot.delivery_revenue
    - financial_snapshot.discount_amount
  )::numeric(14,2);

  if new.refund_amount < ledger_refund then
    raise exception 'Recognized refunds cannot be reduced or deleted.'
      using errcode = '23514';
  end if;
  if new.refund_amount > maximum_refund then
    raise exception 'Refund exceeds remaining recognized Net Revenue.'
      using errcode = '23514';
  end if;
  explicit_refund_evidence :=
    new.refund_review_status = 'resolved'
    and new.refund_scope is not null
    and new.return_disposition in ('not_applicable', 'not_returned')
    and (
      new.refund_scope is distinct from old.refund_scope
      or new.return_disposition is distinct from old.return_disposition
      or new.refund_review_status is distinct from old.refund_review_status
    );
  if new.refund_amount > ledger_refund then
    insert into public.order_financial_adjustments (
      order_id, adjustment_type, amount_delta, occurred_on,
      adjustment_source, created_by, allocation_method, refund_scope,
      return_disposition, refund_review_status
    ) values (
      new.id,
      'refund',
      new.refund_amount - ledger_refund,
      (now() at time zone 'Asia/Dhaka')::date,
      case when lower(coalesce(new.sales_channel, 'Website')) = 'website'
        then 'website' else 'dashboard' end,
      (select auth.uid()),
      case when explicit_refund_evidence then 'proportional_remaining'
        else 'unallocated_needs_review' end,
      case when explicit_refund_evidence then new.refund_scope else null end,
      case when explicit_refund_evidence
        then new.return_disposition else null end,
      case when explicit_refund_evidence then 'resolved' else 'needs_review' end
    );
    if not explicit_refund_evidence then
      update public.orders
      set refund_scope = null,
          return_disposition = null,
          refund_review_status = 'needs_review'
      where id = new.id;
    end if;
  end if;
  return new;
end
$function$;

create or replace function public.record_dashboard_refund(
  p_order_id uuid,
  p_amount numeric,
  p_refund_scope text,
  p_idempotency_key text,
  p_occurred_on date default null,
  p_item_allocations jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_order public.orders%rowtype;
  existing_adjustment public.order_financial_adjustments%rowtype;
  new_adjustment_id uuid;
  normalized_key text := nullif(btrim(p_idempotency_key), '');
  requested_method text := case when p_item_allocations is null
    then 'proportional_remaining' else 'explicit' end;
  ledger_refund numeric(14,2);
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record refunds.' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or normalized_key is null then
    raise exception 'A positive refund and idempotency key are required.'
      using errcode = '22023';
  end if;
  if p_refund_scope not in ('product_only', 'delivery_only', 'full_order') then
    raise exception 'A valid refund scope is required.' using errcode = '22023';
  end if;
  if p_refund_scope = 'full_order' and p_item_allocations is not null then
    raise exception 'Full-order refunds cannot use a partial item request.'
      using errcode = '22023';
  end if;
  perform public.dashboard_money_to_poisha(p_amount);

  select * into current_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.order_financial_snapshots
    where order_id = p_order_id and recognition_status = 'Delivered'
  ) then
    raise exception 'Refunds require recognized Delivered financials.'
      using errcode = '23514';
  end if;

  select * into existing_adjustment
  from public.order_financial_adjustments
    where order_id = p_order_id and idempotency_key = normalized_key
  ;
  if found then
    if existing_adjustment.amount_delta = p_amount::numeric(14,2)
       and existing_adjustment.refund_scope = p_refund_scope
       and existing_adjustment.return_disposition = 'not_applicable'
       and existing_adjustment.allocation_method = requested_method
       and existing_adjustment.item_allocation_request
         is not distinct from p_item_allocations
       and (
         p_occurred_on is null
         or existing_adjustment.occurred_on = p_occurred_on
       ) then
      return existing_adjustment.id;
    end if;
    raise exception 'The refund idempotency key is already used by a different request.'
      using errcode = '23505';
  end if;

  insert into public.order_financial_adjustments (
    order_id, adjustment_type, amount_delta, occurred_on, adjustment_source,
    created_by, allocation_method, refund_scope, return_disposition,
    refund_review_status, item_allocation_request, idempotency_key
  ) values (
    p_order_id,
    'refund',
    p_amount,
    coalesce(p_occurred_on, (now() at time zone 'Asia/Dhaka')::date),
    'dashboard',
    (select auth.uid()),
    requested_method,
    p_refund_scope,
    'not_applicable',
    'resolved',
    p_item_allocations, normalized_key
  )
  returning id into new_adjustment_id;

  select (
    snapshot.refund_amount + coalesce(sum(adjustment.amount_delta), 0)
  )::numeric(14,2)
  into ledger_refund
  from public.order_financial_snapshots as snapshot
  left join public.order_financial_adjustments as adjustment
    on adjustment.order_id = snapshot.order_id
  where snapshot.order_id = p_order_id
  group by snapshot.refund_amount;

  update public.orders
  set refund_amount = ledger_refund,
      refund_scope = p_refund_scope,
      return_disposition = 'not_applicable',
      refund_review_status = 'resolved'
  where id = p_order_id;
  return new_adjustment_id;
end
$function$;

create or replace function public.record_dashboard_return(
  p_order_id uuid,
  p_return_disposition text,
  p_idempotency_key text,
  p_occurred_on date default null,
  p_return_items jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_order public.orders%rowtype;
  existing_event public.order_return_events%rowtype;
  new_event_id uuid;
  normalized_key text := nullif(btrim(p_idempotency_key), '');
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to record returns.' using errcode = '42501';
  end if;
  if p_return_disposition not in ('returned_resellable', 'returned_damaged')
     or normalized_key is null or p_return_items is null then
    raise exception 'A return disposition, idempotency key, and item quantities are required.'
      using errcode = '22023';
  end if;
  select * into current_order
  from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  select * into existing_event
  from public.order_return_events
  where order_id = p_order_id and idempotency_key = normalized_key;
  if found then
    if existing_event.return_disposition = p_return_disposition
       and existing_event.item_request is not distinct from p_return_items
       and (p_occurred_on is null or existing_event.occurred_on = p_occurred_on)
    then
      return existing_event.id;
    end if;
    raise exception 'The return idempotency key is already used by a different request.'
      using errcode = '23505';
  end if;
  insert into public.order_return_events (
    order_id, return_disposition, occurred_on, return_source,
    item_request, idempotency_key, created_by
  ) values (
    p_order_id, p_return_disposition,
    coalesce(p_occurred_on, (now() at time zone 'Asia/Dhaka')::date),
    'dashboard', p_return_items, normalized_key, (select auth.uid())
  ) returning id into new_event_id;
  return new_event_id;
end
$function$;

create or replace function public.inspect_dashboard_return(
  p_return_event_id uuid,
  p_inspection_outcome text,
  p_idempotency_key text,
  p_inspected_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_event public.order_return_events%rowtype;
  existing_inspection public.order_return_inspections%rowtype;
  new_inspection_id uuid;
  normalized_key text := nullif(btrim(p_idempotency_key), '');
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to inspect returns.' using errcode = '42501';
  end if;
  if normalized_key is null or p_inspection_outcome not in (
    'confirmed_resellable', 'confirmed_damaged'
  ) then
    raise exception 'A valid inspection outcome and idempotency key are required.'
      using errcode = '22023';
  end if;
  select * into current_event
  from public.order_return_events
  where id = p_return_event_id
  for update;
  if not found then
    raise exception 'Return event not found.' using errcode = 'P0002';
  end if;
  if (current_event.return_disposition = 'returned_resellable'
      and p_inspection_outcome <> 'confirmed_resellable')
     or (current_event.return_disposition = 'returned_damaged'
      and p_inspection_outcome <> 'confirmed_damaged') then
    raise exception 'Inspection outcome conflicts with the recorded disposition.'
      using errcode = '23514';
  end if;
  select * into existing_inspection
  from public.order_return_inspections
  where return_event_id = p_return_event_id;
  if found then
    if existing_inspection.inspection_outcome = p_inspection_outcome
       and existing_inspection.idempotency_key = normalized_key
       and (p_inspected_on is null
         or existing_inspection.inspected_on = p_inspected_on) then
      return existing_inspection.id;
    end if;
    raise exception 'A return event can be inspected and restored only once.'
      using errcode = '23505';
  end if;
  insert into public.order_return_inspections (
    return_event_id, inspection_outcome, inspected_on,
    idempotency_key, inspected_by
  ) values (
    p_return_event_id, p_inspection_outcome,
    coalesce(p_inspected_on, (now() at time zone 'Asia/Dhaka')::date),
    normalized_key, (select auth.uid())
  ) returning id into new_inspection_id;

  if p_inspection_outcome = 'confirmed_resellable' then
    -- The explicit owner/admin inspection action records exactly-once
    -- restoration movements. It never updates products.stock and never calls
    -- an inventory mutation RPC; physical stock integration remains separate.
    insert into public.inventory_restoration_movements (
      inspection_id, return_allocation_id, order_id, product_id_snapshot,
      quantity_delta, cogs_reversal_poisha, movement_type, occurred_at
    )
    select
      new_inspection_id, returned.id, returned.order_id,
      allocation.product_id_snapshot, returned.returned_quantity,
      returned.potential_cogs_reversal_poisha,
      'returned_resellable', now()
    from public.order_item_return_allocations as returned
    join public.order_item_financial_allocations as allocation
      on allocation.id = returned.recognition_allocation_id
    where returned.return_event_id = p_return_event_id
    order by allocation.order_item_id;
  end if;
  return new_inspection_id;
end
$function$;

drop trigger if exists order_item_financial_allocations_immutable
  on public.order_item_financial_allocations;
create trigger order_item_financial_allocations_immutable
before update or delete on public.order_item_financial_allocations
for each row execute function public.dashboard_reject_financial_history_mutation();

drop trigger if exists order_item_refund_allocations_immutable
  on public.order_item_refund_allocations;
create trigger order_item_refund_allocations_immutable
before update or delete on public.order_item_refund_allocations
for each row execute function public.dashboard_reject_financial_history_mutation();

drop trigger if exists order_item_return_allocations_immutable
  on public.order_item_return_allocations;
create trigger order_item_return_allocations_immutable
before update or delete on public.order_item_return_allocations
for each row execute function public.dashboard_reject_financial_history_mutation();

create trigger order_return_events_immutable
before update or delete on public.order_return_events
for each row execute function public.dashboard_reject_financial_history_mutation();

create trigger order_return_inspections_immutable
before update or delete on public.order_return_inspections
for each row execute function public.dashboard_reject_financial_history_mutation();

drop trigger if exists inventory_restoration_movements_immutable
  on public.inventory_restoration_movements;
create trigger inventory_restoration_movements_immutable
before update or delete on public.inventory_restoration_movements
for each row execute function public.dashboard_reject_financial_history_mutation();

drop trigger if exists dashboard_audit_change
  on public.order_item_financial_allocations;
create trigger dashboard_audit_change
after insert or update or delete on public.order_item_financial_allocations
for each row execute function public.dashboard_write_audit_history();

drop trigger if exists dashboard_audit_change
  on public.order_item_refund_allocations;
create trigger dashboard_audit_change
after insert or update or delete on public.order_item_refund_allocations
for each row execute function public.dashboard_write_audit_history();

drop trigger if exists dashboard_audit_change
  on public.order_item_return_allocations;
create trigger dashboard_audit_change
after insert or update or delete on public.order_item_return_allocations
for each row execute function public.dashboard_write_audit_history();

create trigger dashboard_audit_change
after insert or update or delete on public.order_return_events
for each row execute function public.dashboard_write_audit_history();

create trigger dashboard_audit_change
after insert or update or delete on public.order_return_inspections
for each row execute function public.dashboard_write_audit_history();

drop trigger if exists dashboard_audit_change
  on public.inventory_restoration_movements;
create trigger dashboard_audit_change
after insert or update or delete on public.inventory_restoration_movements
for each row execute function public.dashboard_write_audit_history();

-- Preserve the installed order-level response shape while making verified
-- resellable returns reverse Recognized COGS. Unverified return cost keeps
-- COGS/profit NULL; damaged and not-returned dispositions retain original COGS.
create or replace view public.dashboard_order_financials
with (security_invoker = true)
as
with refund_adjustments as (
  select
    adjustment.order_id,
    coalesce(sum(adjustment.amount_delta), 0)::numeric(14,2)
      as refund_amount_delta
  from public.order_financial_adjustments as adjustment
  where adjustment.adjustment_type = 'refund'
  group by adjustment.order_id
), return_cogs as (
  select
    movement.order_id,
    count(*) filter (
      where movement.cogs_reversal_poisha is null
    )::bigint as missing_cogs_reversal_count,
    coalesce(sum(movement.cogs_reversal_poisha), 0)::bigint
      as cogs_reversal_poisha
  from public.inventory_restoration_movements as movement
  group by movement.order_id
), recognized as (
  select
    snapshot.*,
    (
      snapshot.refund_amount
      + coalesce(refund.refund_amount_delta, 0)
    )::numeric(14,2) as adjusted_refund_amount,
    snapshot.cogs_complete
      and coalesce(returned.missing_cogs_reversal_count, 0) = 0
      as adjusted_cogs_complete,
    case when snapshot.cogs_complete
        and coalesce(returned.missing_cogs_reversal_count, 0) = 0
      then snapshot.cogs - public.dashboard_poisha_to_money(
        coalesce(returned.cogs_reversal_poisha, 0)
      )
      else null
    end::numeric(14,2) as adjusted_cogs
  from public.order_financial_snapshots as snapshot
  left join refund_adjustments as refund on refund.order_id = snapshot.order_id
  left join return_cogs as returned on returned.order_id = snapshot.order_id
  where snapshot.recognition_status = 'Delivered'
)
select
  order_id,
  order_number_snapshot as order_number,
  order_date,
  sales_channel,
  campaign_id,
  campaign_name_snapshot,
  payment_method,
  settlement_status,
  recognized_at,
  recognition_source,
  true as is_delivered,
  adjusted_cogs_complete as cogs_complete,
  (courier_cost is not null and packaging_cost is not null)
    as fulfillment_costs_complete,
  product_revenue::numeric(14,2) as recognized_product_revenue,
  delivery_revenue::numeric(14,2) as recognized_delivery_revenue,
  discount_amount::numeric(14,2) as recognized_discount_amount,
  adjusted_refund_amount::numeric(14,2) as recognized_refund_amount,
  (
    product_revenue + delivery_revenue
      - discount_amount - adjusted_refund_amount
  )::numeric(14,2) as net_revenue,
  adjusted_cogs::numeric(14,2) as recognized_cogs,
  case when adjusted_cogs_complete then
    product_revenue + delivery_revenue - discount_amount
      - adjusted_refund_amount - adjusted_cogs
  else null end::numeric(14,2) as gross_profit,
  case when adjusted_cogs_complete
      and courier_cost is not null and packaging_cost is not null then
    product_revenue + delivery_revenue - discount_amount
      - adjusted_refund_amount - adjusted_cogs
      - courier_cost - packaging_cost
  else null end::numeric(14,2) as contribution_profit
from recognized;

create or replace view public.dashboard_product_allocation_reconciliation
with (security_invoker = true)
as
with refund_by_allocation as (
  select
    recognition_allocation_id,
    sum(product_refund_poisha)::bigint as product_refund_poisha,
    sum(delivery_refund_poisha)::bigint as delivery_refund_poisha,
    sum(refund_poisha)::bigint as refund_poisha
  from public.order_item_refund_allocations
  group by recognition_allocation_id
), return_by_allocation as (
  select
    returned.recognition_allocation_id,
    sum(returned.returned_quantity)::bigint as returned_quantity,
    count(*) filter (
      where movement.id is not null and movement.cogs_reversal_poisha is null
    )::bigint as missing_cogs_reversal_count,
    coalesce(sum(movement.cogs_reversal_poisha), 0)::bigint
      as cogs_reversal_poisha
  from public.order_item_return_allocations as returned
  left join public.inventory_restoration_movements as movement
    on movement.return_allocation_id = returned.id
  group by returned.recognition_allocation_id
), allocation_totals as (
  select
    allocation.order_id,
    count(*)::bigint as allocation_count,
    sum(allocation.gross_product_revenue_poisha)::bigint as product_poisha,
    sum(allocation.delivery_revenue_poisha)::bigint as delivery_poisha,
    sum(allocation.product_discount_poisha)::bigint
      as product_discount_poisha,
    sum(allocation.delivery_discount_poisha)::bigint
      as delivery_discount_poisha,
    sum(allocation.discount_poisha)::bigint as discount_poisha,
    sum(allocation.original_product_refund_poisha)::bigint
      as original_product_refund_poisha,
    sum(allocation.original_delivery_refund_poisha)::bigint
      as original_delivery_refund_poisha,
    sum(allocation.original_refund_poisha)::bigint as original_refund_poisha,
    sum(
      allocation.original_refund_poisha
      + coalesce(refund.refund_poisha, 0)
    )::bigint as adjusted_refund_poisha,
    sum(
      allocation.net_revenue_poisha
      - coalesce(refund.refund_poisha, 0)
    )::bigint as adjusted_net_revenue_poisha,
    count(*) filter (
      where allocation.cogs_poisha is null
        or coalesce(returned.missing_cogs_reversal_count, 0) > 0
    )::bigint as missing_cogs_count,
    sum(
      allocation.cogs_poisha - coalesce(returned.cogs_reversal_poisha, 0)
    )::bigint as adjusted_cogs_poisha,
    coalesce(sum(returned.returned_quantity), 0)::bigint as returned_quantity,
    count(*) filter (where allocation.courier_cost_poisha is null)::bigint
      as missing_courier_count,
    sum(allocation.courier_cost_poisha)::bigint as courier_poisha,
    count(*) filter (where allocation.packaging_cost_poisha is null)::bigint
      as missing_packaging_count,
    sum(allocation.packaging_cost_poisha)::bigint as packaging_poisha
  from public.order_item_financial_allocations as allocation
  left join refund_by_allocation as refund
    on refund.recognition_allocation_id = allocation.id
  left join return_by_allocation as returned
    on returned.recognition_allocation_id = allocation.id
  group by allocation.order_id
), expected_item_totals as (
  select order_id, count(*)::bigint as item_count
  from public.order_items
  group by order_id
), adjustment_totals as (
  select
    adjustment.order_id,
    sum(public.dashboard_money_to_poisha(adjustment.amount_delta))::bigint
      as adjustment_poisha,
    count(*) filter (
      where adjustment.refund_review_status = 'needs_review'
    )::bigint as needs_review_count
  from public.order_financial_adjustments as adjustment
  group by adjustment.order_id
), allocated_adjustment_totals as (
  select
    refund.order_id,
    sum(refund.refund_poisha)::bigint as allocated_adjustment_poisha
  from public.order_item_refund_allocations as refund
  group by refund.order_id
), refund_event_rollups as (
  select
    adjustment.id,
    adjustment.order_id,
    adjustment.refund_scope,
    public.dashboard_money_to_poisha(adjustment.amount_delta) as event_poisha,
    coalesce(sum(refund.product_refund_poisha), 0)::bigint
      as product_refund_poisha,
    coalesce(sum(refund.delivery_refund_poisha), 0)::bigint
      as delivery_refund_poisha,
    coalesce(sum(refund.refund_poisha), 0)::bigint as refund_poisha
  from public.order_financial_adjustments as adjustment
  left join public.order_item_refund_allocations as refund
    on refund.adjustment_id = adjustment.id
  group by adjustment.id, adjustment.order_id, adjustment.refund_scope,
    adjustment.amount_delta
), refund_scope_totals as (
  select
    order_id,
    bool_or(refund_scope = 'full_order') as has_full_order_refund,
    bool_and(
      refund_poisha = event_poisha
      and case refund_scope
        when 'product_only' then delivery_refund_poisha = 0
        when 'delivery_only' then product_refund_poisha = 0
        when 'full_order' then
          product_refund_poisha + delivery_refund_poisha = event_poisha
        else false
      end
    ) as refund_scopes_match
  from refund_event_rollups
  group by order_id
), return_totals as (
  select
    returned.order_id,
    sum(returned.returned_quantity)::bigint as returned_quantity,
    count(*) filter (
      where returned.return_disposition = 'returned_resellable'
    )::bigint as resellable_count,
    count(*) filter (
      where returned.return_disposition = 'returned_resellable'
        and inspection.inspection_outcome = 'confirmed_resellable'
        and movement.id is null
    )::bigint as missing_restoration_count,
    count(*) filter (
      where returned.return_disposition = 'returned_damaged'
        and movement.id is not null
    )::bigint as damaged_restoration_count
  from public.order_item_return_allocations as returned
  join public.order_return_events as return_event
    on return_event.id = returned.return_event_id
  left join public.order_return_inspections as inspection
    on inspection.return_event_id = return_event.id
  left join public.inventory_restoration_movements as movement
    on movement.return_allocation_id = returned.id
  group by returned.order_id
), checks as (
  select
    snapshot.order_id,
    coalesce(expected.item_count, 0)::bigint as expected_item_count,
    coalesce(allocation.allocation_count, 0)::bigint as allocation_count,
    coalesce(allocation.allocation_count, 0)
      = coalesce(expected.item_count, 0) as allocation_count_matches,
    coalesce(allocation.product_poisha, 0)
      = public.dashboard_money_to_poisha(snapshot.product_revenue)
      as product_revenue_matches,
    coalesce(allocation.delivery_poisha, 0)
      = public.dashboard_money_to_poisha(snapshot.delivery_revenue)
      as delivery_revenue_matches,
    coalesce(allocation.discount_poisha, 0)
      = public.dashboard_money_to_poisha(snapshot.discount_amount)
      as discount_matches,
    coalesce(allocation.original_refund_poisha, 0)
      = public.dashboard_money_to_poisha(snapshot.refund_amount)
      as original_refund_matches,
    case
      when snapshot.refund_amount = 0 then
        snapshot.original_refund_review_status = 'resolved'
        and snapshot.original_refund_scope is null
        and coalesce(allocation.original_refund_poisha, 0) = 0
      when snapshot.original_refund_review_status <> 'resolved' then false
      when snapshot.original_refund_scope = 'product_only' then
        coalesce(allocation.original_delivery_refund_poisha, 0) = 0
      when snapshot.original_refund_scope = 'delivery_only' then
        coalesce(allocation.original_product_refund_poisha, 0) = 0
      when snapshot.original_refund_scope = 'full_order' then
        coalesce(allocation.original_refund_poisha, 0)
          = public.dashboard_money_to_poisha(
            snapshot.product_revenue + snapshot.delivery_revenue
              - snapshot.discount_amount
          )
      else false
    end as original_refund_scope_matches,
    snapshot.original_refund_review_status = 'resolved'
      and coalesce(adjustment.needs_review_count, 0) = 0
      as refund_evidence_resolved,
    case when financial.recognized_cogs is not null then
      coalesce(allocation.missing_cogs_count, 0) = 0
      and allocation.adjusted_cogs_poisha
        = public.dashboard_money_to_poisha(financial.recognized_cogs)
    else
      coalesce(allocation.missing_cogs_count, 0) > 0
    end as cogs_matches,
    case when snapshot.courier_cost is null then
      allocation.courier_poisha is null
    else
      coalesce(allocation.missing_courier_count, 0) = 0
      and allocation.courier_poisha
        = public.dashboard_money_to_poisha(snapshot.courier_cost)
    end as courier_cost_matches,
    case when snapshot.packaging_cost is null then
      allocation.packaging_poisha is null
    else
      coalesce(allocation.missing_packaging_count, 0) = 0
      and allocation.packaging_poisha
        = public.dashboard_money_to_poisha(snapshot.packaging_cost)
    end as packaging_cost_matches,
    coalesce(adjustment.adjustment_poisha, 0)
      = coalesce(allocated_adjustment.allocated_adjustment_poisha, 0)
      as refund_adjustments_match,
    coalesce(refund_scope.refund_scopes_match, true)
      and (
        not coalesce(refund_scope.has_full_order_refund, false)
        or financial.net_revenue = 0
      )
      as refund_scopes_match,
    coalesce(allocation.adjusted_refund_poisha, 0)
      = public.dashboard_money_to_poisha(financial.recognized_refund_amount)
      as adjusted_refund_matches,
    coalesce(allocation.adjusted_net_revenue_poisha, 0)
      = public.dashboard_money_to_poisha(financial.net_revenue)
      as adjusted_net_revenue_matches,
    coalesce(allocation.returned_quantity, 0)
      = coalesce(returned.returned_quantity, 0)
      as returned_units_match,
    coalesce(returned.missing_restoration_count, 0) = 0
      and coalesce(returned.damaged_restoration_count, 0) = 0
      as inventory_restoration_matches
  from public.order_financial_snapshots as snapshot
  join public.dashboard_order_financials as financial
    on financial.order_id = snapshot.order_id
  left join allocation_totals as allocation
    on allocation.order_id = snapshot.order_id
  left join expected_item_totals as expected
    on expected.order_id = snapshot.order_id
  left join adjustment_totals as adjustment
    on adjustment.order_id = snapshot.order_id
  left join allocated_adjustment_totals as allocated_adjustment
    on allocated_adjustment.order_id = snapshot.order_id
  left join refund_scope_totals as refund_scope
    on refund_scope.order_id = snapshot.order_id
  left join return_totals as returned
    on returned.order_id = snapshot.order_id
  where snapshot.recognition_status = 'Delivered'
)
select
  checks.*,
  checks.allocation_count > 0
    and checks.allocation_count_matches
    and checks.product_revenue_matches
    and checks.delivery_revenue_matches
    and checks.discount_matches
    and checks.original_refund_matches
    and checks.original_refund_scope_matches
    and checks.refund_evidence_resolved
    and checks.cogs_matches
    and checks.courier_cost_matches
    and checks.packaging_cost_matches
    and checks.refund_adjustments_match
    and checks.refund_scopes_match
    and checks.adjusted_refund_matches
    and checks.adjusted_net_revenue_matches
    and checks.returned_units_match
    and checks.inventory_restoration_matches
    as all_reconciled
from checks;

create or replace view public.dashboard_product_allocation_data_quality
with (security_invoker = true)
as
select
  (
    select count(*) from public.order_financial_snapshots as snapshot
    where snapshot.recognition_status = 'Delivered'
      and not exists (
        select 1 from public.order_item_financial_allocations as allocation
        where allocation.order_id = snapshot.order_id
      )
  )::bigint as recognized_orders_missing_item_allocations,
  (
    select count(*) from (
      select order_item_id
      from public.order_item_financial_allocations
      group by order_item_id having count(*) > 1
    ) as duplicates
  )::bigint as duplicate_order_item_allocations,
  (
    select count(*)
    from public.dashboard_product_allocation_reconciliation
    where allocation_count = 0
       or not allocation_count_matches
       or not cogs_matches
       or not courier_cost_matches
       or not packaging_cost_matches
  )::bigint as incomplete_order_allocations,
  (
    select count(*)
    from public.dashboard_product_allocation_reconciliation
    where not all_reconciled
  )::bigint as order_allocation_mismatches,
  (
    select count(*)
    from public.order_financial_adjustments as adjustment
    where not exists (
      select 1 from public.order_item_refund_allocations as refund
      where refund.adjustment_id = adjustment.id
    )
  )::bigint as refund_events_missing_allocations,
  (
    select count(*) from (
      select adjustment.id
      from public.order_financial_adjustments as adjustment
      left join public.order_item_refund_allocations as refund
        on refund.adjustment_id = adjustment.id
      group by adjustment.id, adjustment.amount_delta
      having coalesce(sum(refund.refund_poisha), 0)
        <> public.dashboard_money_to_poisha(adjustment.amount_delta)
    ) as mismatches
  )::bigint as refund_event_amount_mismatches,
  (
    select count(*) from (
      select adjustment.id
      from public.order_financial_adjustments as adjustment
      left join public.order_item_refund_allocations as refund
        on refund.adjustment_id = adjustment.id
      join public.dashboard_order_financials as financial
        on financial.order_id = adjustment.order_id
      group by adjustment.id, adjustment.refund_scope, financial.net_revenue
      having not case adjustment.refund_scope
        when 'product_only' then
          coalesce(sum(refund.delivery_refund_poisha), 0) = 0
        when 'delivery_only' then
          coalesce(sum(refund.product_refund_poisha), 0) = 0
        when 'full_order' then
          coalesce(sum(refund.refund_poisha), 0) > 0
          and financial.net_revenue = 0
        else false
      end
    ) as mismatches
  )::bigint as refund_event_scope_mismatches,
  (
    select count(*) from (
      select allocation.id
      from public.order_item_financial_allocations as allocation
      left join public.order_item_refund_allocations as refund
        on refund.recognition_allocation_id = allocation.id
      group by allocation.id, allocation.product_net_revenue_poisha
      having coalesce(sum(refund.product_refund_poisha), 0)
        > allocation.product_net_revenue_poisha
    ) as overallocated
  )::bigint as overallocated_product_refund_items,
  (
    select count(*) from (
      select allocation.id
      from public.order_item_financial_allocations as allocation
      left join public.order_item_refund_allocations as refund
        on refund.recognition_allocation_id = allocation.id
      group by allocation.id, allocation.delivery_net_revenue_poisha
      having coalesce(sum(refund.delivery_refund_poisha), 0)
        > allocation.delivery_net_revenue_poisha
    ) as overallocated
  )::bigint as overallocated_delivery_refund_items,
  (
    select count(*)
    from public.order_item_financial_allocations as allocation
    join public.order_financial_snapshots as snapshot
      on snapshot.order_id = allocation.order_id
    where snapshot.recognition_status <> 'Delivered'
  )::bigint as non_delivered_product_allocations,
  (
    select count(*)
    from public.order_financial_snapshots as snapshot
    where snapshot.refund_amount > 0
      and snapshot.original_refund_review_status = 'needs_review'
  )::bigint + (
    select count(*)
    from public.order_financial_adjustments as adjustment
    where adjustment.refund_review_status = 'needs_review'
  )::bigint as refund_events_needing_review,
  (
    select count(*)
    from public.order_return_events as return_event
    where not exists (
      select 1 from public.order_item_return_allocations as returned
      where returned.return_event_id = return_event.id
    )
  )::bigint as return_events_missing_allocations,
  (
    select count(*)
    from public.order_return_events as return_event
    where return_event.return_disposition = 'returned_resellable'
      and not exists (
        select 1 from public.order_return_inspections as inspection
        where inspection.return_event_id = return_event.id
      )
  )::bigint as resellable_returns_awaiting_inspection,
  (
    select count(*) from (
      select
        allocation.id,
        allocation.quantity,
        coalesce(sum(returned.returned_quantity), 0) as returned_quantity
      from public.order_item_financial_allocations as allocation
      left join public.order_item_return_allocations as returned
        on returned.recognition_allocation_id = allocation.id
      group by allocation.id, allocation.quantity
      having coalesce(sum(returned.returned_quantity), 0) > allocation.quantity
    ) as overreturned
  )::bigint as overallocated_returned_items,
  (
    select count(*)
    from public.inventory_restoration_movements as movement
    where movement.cogs_reversal_poisha is null
  )::bigint as resellable_returns_missing_cogs_evidence,
  (
    select count(*)
    from public.order_item_return_allocations as returned
    join public.order_return_events as return_event
      on return_event.id = returned.return_event_id
    left join public.order_return_inspections as inspection
      on inspection.return_event_id = return_event.id
    left join public.inventory_restoration_movements as movement
      on movement.return_allocation_id = returned.id
    where (
      returned.return_disposition = 'returned_resellable'
      and inspection.inspection_outcome = 'confirmed_resellable'
      and movement.id is null
    ) or (
      returned.return_disposition = 'returned_damaged'
      and movement.id is not null
    )
  )::bigint as inventory_restoration_mismatches,
  (
    select count(*)
    from public.order_item_financial_allocations as allocation
    join public.order_items as item on item.id = allocation.order_item_id
    where item.product_id is distinct from allocation.product_id_snapshot
       or item.quantity is distinct from allocation.quantity
       or item.product_name is distinct from allocation.product_name_snapshot
       or item.sku_snapshot is distinct from allocation.sku_snapshot
  )::bigint as mutable_item_snapshot_mismatches;

create or replace function public.get_dashboard_product_financials(
  p_start_date date default null,
  p_end_date date default null,
  p_sales_channel text default null,
  p_campaign_id uuid default null,
  p_order_status text default null,
  p_product_id uuid default null,
  p_sku text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  delivered_order_count bigint,
  delivered_units bigint,
  returned_units bigint,
  gross_product_revenue numeric(14,2),
  allocated_delivery_revenue numeric(14,2),
  allocated_discount numeric(14,2),
  allocated_refund numeric(14,2),
  adjusted_product_net_revenue numeric(14,2),
  recognized_cogs numeric(14,2),
  gross_profit numeric(14,2),
  allocated_courier_cost numeric(14,2),
  allocated_packaging_cost numeric(14,2),
  contribution_profit numeric(14,2)
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(
    array[
      'owner'::public.dashboard_role,
      'admin'::public.dashboard_role,
      'viewer'::public.dashboard_role
    ]
  ) then
    raise exception 'Dashboard reporting access is required.'
      using errcode = '42501';
  end if;
  if p_start_date is not null and p_end_date is not null
     and p_start_date > p_end_date then
    raise exception 'Start date must not be after end date.'
      using errcode = '22023';
  end if;
  if p_limit not between 1 and 500 or p_offset < 0 then
    raise exception 'Product-report pagination is invalid.'
      using errcode = '22023';
  end if;
  if p_order_status is not null
     and lower(p_order_status) not in (
       'all', 'pending', 'confirmed', 'dispatched', 'delivered',
       'cancelled', 'returned', 'refunded', 'failed delivery'
     ) then
    raise exception 'Unknown order-status filter.' using errcode = '22023';
  end if;
  if p_order_status is not null
     and lower(p_order_status) not in ('all', 'delivered') then
    return;
  end if;

  -- Product reports fail closed instead of silently omitting ambiguous legacy
  -- refunds. The data-quality view identifies the records requiring review.
  if exists (
    select 1
    from public.order_financial_snapshots as snapshot
    where snapshot.recognition_status = 'Delivered'
      and (p_start_date is null or snapshot.order_date >= p_start_date)
      and (p_end_date is null or snapshot.order_date <= p_end_date)
      and (
        p_sales_channel is null
        or lower(snapshot.sales_channel) = lower(p_sales_channel)
      )
      and (p_campaign_id is null or snapshot.campaign_id = p_campaign_id)
      and (
        snapshot.original_refund_review_status = 'needs_review'
        or exists (
          select 1
          from public.order_financial_adjustments as adjustment
          where adjustment.order_id = snapshot.order_id
            and adjustment.refund_review_status = 'needs_review'
        )
      )
      and exists (
        select 1
        from public.order_items as item
        where item.order_id = snapshot.order_id
          and (p_product_id is null or item.product_id = p_product_id)
          and (p_sku is null or lower(item.sku_snapshot) = lower(p_sku))
      )
  ) then
    raise exception 'Product financials contain refund evidence marked needs_review.'
      using errcode = '23514';
  end if;

  return query
  with refund_totals as (
    select
      recognition_allocation_id,
      sum(refund_poisha)::bigint as refund_poisha
    from public.order_item_refund_allocations
    group by recognition_allocation_id
  ), return_totals as (
    select
      returned.recognition_allocation_id,
      sum(returned.returned_quantity)::bigint as returned_quantity,
      count(*) filter (
        where movement.id is not null and movement.cogs_reversal_poisha is null
      )::bigint as missing_cogs_reversal_count,
      coalesce(sum(movement.cogs_reversal_poisha), 0)::bigint
        as cogs_reversal_poisha
    from public.order_item_return_allocations as returned
    left join public.inventory_restoration_movements as movement
      on movement.return_allocation_id = returned.id
    group by returned.recognition_allocation_id
  ), filtered as (
    select
      allocation.*,
      snapshot.order_date,
      snapshot.sales_channel,
      snapshot.campaign_id,
      coalesce(refund.refund_poisha, 0)::bigint as later_refund_poisha,
      coalesce(returned.returned_quantity, 0)::bigint as returned_quantity,
      coalesce(returned.missing_cogs_reversal_count, 0)::bigint
        as missing_cogs_reversal_count,
      coalesce(returned.cogs_reversal_poisha, 0)::bigint
        as cogs_reversal_poisha
    from public.order_item_financial_allocations as allocation
    join public.order_financial_snapshots as snapshot
      on snapshot.order_id = allocation.order_id
     and snapshot.recognition_status = 'Delivered'
    left join refund_totals as refund
      on refund.recognition_allocation_id = allocation.id
    left join return_totals as returned
      on returned.recognition_allocation_id = allocation.id
    where (p_start_date is null or snapshot.order_date >= p_start_date)
      and (p_end_date is null or snapshot.order_date <= p_end_date)
      and (
        p_sales_channel is null
        or lower(snapshot.sales_channel) = lower(p_sales_channel)
      )
      and (p_campaign_id is null or snapshot.campaign_id = p_campaign_id)
      and (p_product_id is null
        or allocation.product_id_snapshot = p_product_id)
      and (p_sku is null or lower(allocation.sku_snapshot) = lower(p_sku))
  ), aggregated as (
    select
      filtered.product_id_snapshot,
      filtered.sku_snapshot,
      filtered.product_name_snapshot,
      count(distinct filtered.order_id)::bigint as order_count,
      sum(filtered.quantity)::bigint as unit_count,
      sum(filtered.returned_quantity)::bigint as returned_unit_count,
      sum(filtered.gross_product_revenue_poisha)::bigint as product_poisha,
      sum(filtered.delivery_revenue_poisha)::bigint as delivery_poisha,
      sum(filtered.discount_poisha)::bigint as discount_poisha,
      sum(
        filtered.original_refund_poisha + filtered.later_refund_poisha
      )::bigint as refund_poisha,
      sum(
        filtered.net_revenue_poisha - filtered.later_refund_poisha
      )::bigint as net_poisha,
      case when count(*) filter (
        where filtered.cogs_poisha is null
          or filtered.missing_cogs_reversal_count > 0
      ) = 0 then sum(
        filtered.cogs_poisha - filtered.cogs_reversal_poisha
      )::bigint else null end as cogs_poisha,
      case when count(*) filter (
        where filtered.courier_cost_poisha is null
      ) = 0 then sum(filtered.courier_cost_poisha)::bigint
        else null end as courier_poisha,
      case when count(*) filter (
        where filtered.packaging_cost_poisha is null
      ) = 0 then sum(filtered.packaging_cost_poisha)::bigint
        else null end as packaging_poisha
    from filtered
    group by filtered.product_id_snapshot, filtered.sku_snapshot,
      filtered.product_name_snapshot
  )
  select
    aggregated.product_id_snapshot,
    aggregated.sku_snapshot,
    aggregated.product_name_snapshot,
    aggregated.order_count,
    aggregated.unit_count,
    aggregated.returned_unit_count,
    public.dashboard_poisha_to_money(aggregated.product_poisha),
    public.dashboard_poisha_to_money(aggregated.delivery_poisha),
    public.dashboard_poisha_to_money(aggregated.discount_poisha),
    public.dashboard_poisha_to_money(aggregated.refund_poisha),
    public.dashboard_poisha_to_money(aggregated.net_poisha),
    public.dashboard_poisha_to_money(aggregated.cogs_poisha),
    case when aggregated.cogs_poisha is null then null
      else public.dashboard_poisha_to_money(
        aggregated.net_poisha - aggregated.cogs_poisha
      )
    end,
    public.dashboard_poisha_to_money(aggregated.courier_poisha),
    public.dashboard_poisha_to_money(aggregated.packaging_poisha),
    case when aggregated.cogs_poisha is null
        or aggregated.courier_poisha is null
        or aggregated.packaging_poisha is null then null
      else public.dashboard_poisha_to_money(
        aggregated.net_poisha - aggregated.cogs_poisha
          - aggregated.courier_poisha - aggregated.packaging_poisha
      )
    end
  from aggregated
  order by aggregated.net_poisha desc,
    aggregated.product_id_snapshot, aggregated.sku_snapshot
  limit p_limit offset p_offset;
end
$function$;

alter table public.order_item_financial_allocations enable row level security;
alter table public.order_item_refund_allocations enable row level security;
alter table public.order_return_events enable row level security;
alter table public.order_item_return_allocations enable row level security;
alter table public.order_return_inspections enable row level security;
alter table public.inventory_restoration_movements enable row level security;

create policy "Dashboard owners and admins read item recognition allocations"
on public.order_item_financial_allocations for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read item refund allocations"
on public.order_item_refund_allocations for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read item return allocations"
on public.order_item_return_allocations for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read return events"
on public.order_return_events for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read return inspections"
on public.order_return_inspections for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read inventory restoration movements"
on public.inventory_restoration_movements for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

revoke all on table public.order_item_financial_allocations,
  public.order_item_refund_allocations,
  public.order_return_events,
  public.order_item_return_allocations,
  public.order_return_inspections,
  public.inventory_restoration_movements
from public, anon, authenticated, service_role;
grant select on table public.order_item_financial_allocations,
  public.order_item_refund_allocations,
  public.order_return_events,
  public.order_item_return_allocations,
  public.order_return_inspections,
  public.inventory_restoration_movements
to authenticated;

-- Trusted Website service-role order writes still invoke SECURITY DEFINER
-- capture triggers. Trigger execution does not require direct ledger grants.
-- Authenticated owner/admin reads remain subject to the existing RLS policies.
revoke all on table public.order_financial_snapshots,
  public.order_financial_adjustments
from public, anon, authenticated, service_role;
grant select on table public.order_financial_snapshots,
  public.order_financial_adjustments
to authenticated;

revoke all on table public.dashboard_order_financials,
  public.dashboard_reconciliation,
  public.dashboard_daily_financials,
  public.dashboard_data_quality_checks,
  public.dashboard_product_allocation_reconciliation,
  public.dashboard_product_allocation_data_quality
from public, anon, authenticated, service_role;
grant select on table public.dashboard_order_financials,
  public.dashboard_reconciliation,
  public.dashboard_daily_financials,
  public.dashboard_data_quality_checks,
  public.dashboard_product_allocation_reconciliation,
  public.dashboard_product_allocation_data_quality
to authenticated;

revoke all on function public.dashboard_money_to_poisha(numeric),
  public.dashboard_poisha_to_money(bigint),
  public.dashboard_allocate_poisha(bigint, uuid[], bigint[]),
  public.dashboard_build_item_allocations(uuid),
  public.dashboard_capture_delivered_snapshot(),
  public.dashboard_validate_refund_adjustment(),
  public.dashboard_allocate_refund_adjustment(),
  public.dashboard_validate_return_event(),
  public.dashboard_allocate_return_event(),
  public.dashboard_capture_refund_adjustment(),
  public.dashboard_reject_financial_history_mutation(),
  public.dashboard_write_audit_history()
from public, anon, authenticated, service_role;

-- Preserve EXECUTE for the existing service-role Website order/status path;
-- the service role still has no direct immutable-ledger table or RPC grant.
grant execute on function public.dashboard_capture_delivered_snapshot(),
  public.dashboard_capture_refund_adjustment()
to authenticated, service_role;

revoke all on function public.record_dashboard_refund(
  uuid, numeric, text, text, date, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_dashboard_refund(
  uuid, numeric, text, text, date, jsonb
) to authenticated;

revoke all on function public.record_dashboard_return(
  uuid, text, text, date, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_dashboard_return(
  uuid, text, text, date, jsonb
) to authenticated;

revoke all on function public.inspect_dashboard_return(
  uuid, text, text, date
) from public, anon, authenticated, service_role;
grant execute on function public.inspect_dashboard_return(
  uuid, text, text, date
) to authenticated;

revoke all on function public.get_dashboard_product_financials(
  date, date, text, uuid, text, uuid, text, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_dashboard_product_financials(
  date, date, text, uuid, text, uuid, text, integer, integer
) to authenticated;
