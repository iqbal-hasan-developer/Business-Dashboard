-- Bounded server-side filter inputs over workspace-owned relationships.
create index inventory_levels_workspace_variant_filter_idx
  on public.inventory_levels (workspace_id, product_variant_id, quantity);

alter table public.legacy_import_runs
  add column current_stage text check (current_stage in (
    'products', 'orders', 'expenses', 'holds', 'completion'
  )),
  add column last_completed_stage text check (last_completed_stage in (
    'products', 'orders', 'expenses', 'holds', 'complete'
  ));

create view public.workspace_product_stock with (security_invoker = true) as
with variant_stock as (
  select v.workspace_id, v.product_id, v.id as variant_id,
    count(level.product_variant_id)::integer as tracked_store_count,
    coalesce(sum(level.quantity), 0)::numeric(20, 6) as stock_quantity,
    coalesce(bool_or(level.quantity <= greatest(level.reorder_level, v.reorder_level)), false) as has_low_store
  from public.product_variants v
  left join public.inventory_levels level
    on level.workspace_id = v.workspace_id and level.product_variant_id = v.id
  group by v.workspace_id, v.product_id, v.id
), product_stock as (
  select p.id as product_id, p.workspace_id,
    coalesce(sum(v.stock_quantity) filter (where v.tracked_store_count > 0), 0)::numeric(20, 6) as stock_quantity,
    count(v.variant_id) filter (where v.tracked_store_count > 0)::integer as tracked_variant_count,
    coalesce(bool_or(v.has_low_store) filter (where v.tracked_store_count > 0), false) as has_low_stock
  from public.products p
  left join variant_stock v on v.workspace_id = p.workspace_id and v.product_id = p.id
  group by p.id, p.workspace_id
)
select p.id, p.workspace_id, p.name, p.sku, p.category, p.brand, p.image_urls,
  p.status, p.currency, p.price, p.created_at, p.updated_at,
  case when s.tracked_variant_count = 0 then null::numeric(20, 6) else s.stock_quantity end as stock_quantity,
  s.tracked_variant_count,
  case
    when s.tracked_variant_count = 0 then 'untracked'
    when s.stock_quantity = 0 then 'out_of_stock'
    when s.has_low_stock then 'low_stock'
    else 'in_stock'
  end::text as stock_status
from public.products p
join product_stock s on s.workspace_id = p.workspace_id and s.product_id = p.id;

create view public.workspace_inventory_stock with (security_invoker = true) as
select v.id, v.workspace_id, v.product_id, v.sku, v.barcode, v.name,
  v.attributes, v.currency, v.price, v.reorder_level,
  p.name as product_name, p.category,
  count(level.product_variant_id)::integer as tracked_store_count,
  case when count(level.product_variant_id) = 0 then null::numeric(20, 6)
    else coalesce(sum(level.quantity), 0)::numeric(20, 6) end as stock_quantity,
  count(level.product_variant_id) filter (
    where level.quantity <= greatest(level.reorder_level, v.reorder_level)
  )::integer as low_stock_store_count,
  case
    when count(level.product_variant_id) = 0 then 'untracked'
    when coalesce(sum(level.quantity), 0) = 0 then 'out_of_stock'
    when bool_or(level.quantity <= greatest(level.reorder_level, v.reorder_level)) then 'low_stock'
    else 'in_stock'
  end::text as stock_status
from public.product_variants v
join public.products p on p.workspace_id = v.workspace_id and p.id = v.product_id
left join public.inventory_levels level
  on level.workspace_id = v.workspace_id and level.product_variant_id = v.id
group by v.id, v.workspace_id, v.product_id, v.sku, v.barcode, v.name,
  v.attributes, v.currency, v.price, v.reorder_level, p.name, p.category;

create view public.workspace_customer_order_counts with (security_invoker = true) as
with order_counts as (
  select o.workspace_id, o.customer_id, count(*)::bigint as order_count
  from public.orders o
  where o.customer_id is not null
  group by o.workspace_id, o.customer_id
)
select c.id, c.workspace_id, c.full_name, c.email, c.phone, c.notes,
  c.first_seen_at, c.last_seen_at, c.created_at,
  coalesce(o.order_count, 0)::bigint as order_count
from public.customers c
left join order_counts o on o.workspace_id = c.workspace_id and o.customer_id = c.id;

create view public.workspace_order_list with (security_invoker = true) as
select o.id, o.workspace_id, o.store_id, o.customer_id, o.order_number, o.status,
  o.payment_status, o.fulfillment_status, o.payment_method, o.currency, o.total,
  o.refund_total, o.customer_name_snapshot, o.customer_phone_snapshot, o.placed_at,
  c.full_name as customer_name
from public.orders o
left join public.customers c on c.workspace_id = o.workspace_id and c.id = o.customer_id;

grant select on public.workspace_product_stock,
  public.workspace_inventory_stock,
  public.workspace_customer_order_counts,
  public.workspace_order_list to authenticated, service_role;
