-- Align the authoritative product-report fail-closed guard with the immutable
-- allocation snapshots used by the report query itself.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  reporting_rpc regprocedure := to_regprocedure(
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'
  );
  function_definition text;
begin
  if reporting_rpc is null
     or to_regclass('public.order_item_financial_allocations') is null then
    raise exception 'Product-reporting RPC prerequisites are missing.';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.order_item_financial_allocations'::regclass
      and attname in ('order_id', 'product_id_snapshot', 'sku_snapshot')
      and attnum > 0
      and not attisdropped
    group by attrelid
    having count(*) = 3
  ) then
    raise exception 'Immutable product-allocation scope columns are missing.';
  end if;

  select pg_get_functiondef(reporting_rpc) into function_definition;
  if function_definition !~* 'from\s+public\.order_items\s+as\s+item'
     or function_definition !~* 'item\.product_id\s*=\s*p_product_id'
     or function_definition !~* 'lower\s*\(\s*item\.sku_snapshot\s*\)\s*=\s*lower\s*\(\s*p_sku\s*\)'
     or function_definition !~* 'snapshot\.order_date\s*>=\s*p_start_date'
     or function_definition !~* 'snapshot\.order_date\s*<=\s*p_end_date' then
    raise exception 'Installed product-report guard does not match the reviewed defect shape.';
  end if;

  if not exists (
    select 1
    from pg_proc as procedure
    where procedure.oid = reporting_rpc
      and procedure.prosecdef
      and (
        select count(*) = 1
        from unnest(coalesce(procedure.proconfig, array[]::text[]))
          as configuration
        where split_part(configuration, '=', 1) = 'search_path'
          and btrim(
            substring(configuration from length('search_path=') + 1),
            '"'
          ) = ''
      )
      and procedure.prosrc ~* 'public\.dashboard_has_any_role\s*\('
      and procedure.prosrc ~* 'errcode\s*=\s*''42501'''
  ) then
    raise exception 'Product-reporting RPC security contract drifted before the scope repair.';
  end if;

  if not has_function_privilege('authenticated', reporting_rpc, 'EXECUTE')
     or has_function_privilege('anon', reporting_rpc, 'EXECUTE')
     or has_function_privilege('service_role', reporting_rpc, 'EXECUTE')
     or exists (
       select 1
       from pg_proc as procedure
       cross join lateral aclexplode(
         coalesce(
           procedure.proacl,
           acldefault('f'::"char", procedure.proowner)
         )
       ) as privilege
       where procedure.oid = reporting_rpc
         and privilege.privilege_type = 'EXECUTE'
         and privilege.grantee not in (
           procedure.proowner,
           'authenticated'::regrole
         )
     ) then
    raise exception 'Product-reporting RPC ACL drifted before the scope repair.';
  end if;
end
$preflight$;

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

  -- Use the same immutable allocation snapshots as the report query so
  -- mutable order-item edits cannot bypass or over-broaden fail-closed scope.
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
        from public.order_item_financial_allocations as scoped_allocation
        where scoped_allocation.order_id = snapshot.order_id
          and (
            p_product_id is null
            or scoped_allocation.product_id_snapshot = p_product_id
          )
          and (
            p_sku is null
            or lower(scoped_allocation.sku_snapshot) = lower(p_sku)
          )
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

do $postcondition$
declare
  reporting_rpc regprocedure := to_regprocedure(
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'
  );
  function_definition text;
begin
  select pg_get_functiondef(reporting_rpc) into function_definition;
  if function_definition !~* 'from\s+public\.order_item_financial_allocations\s+as\s+scoped_allocation'
     or function_definition !~* 'scoped_allocation\.product_id_snapshot\s*=\s*p_product_id'
     or function_definition !~* 'lower\s*\(\s*scoped_allocation\.sku_snapshot\s*\)\s*=\s*lower\s*\(\s*p_sku\s*\)'
     or function_definition ~* 'from\s+public\.order_items\s+as\s+item' then
    raise exception 'Product-report immutable fail-closed scope was not installed.';
  end if;

  if not exists (
    select 1
    from pg_proc as procedure
    where procedure.oid = reporting_rpc
      and procedure.prosecdef
      and (
        select count(*) = 1
        from unnest(coalesce(procedure.proconfig, array[]::text[]))
          as configuration
        where split_part(configuration, '=', 1) = 'search_path'
          and btrim(
            substring(configuration from length('search_path=') + 1),
            '"'
          ) = ''
      )
      and procedure.prosrc ~* 'public\.dashboard_has_any_role\s*\('
      and procedure.prosrc ~* 'errcode\s*=\s*''42501'''
  ) then
    raise exception 'Product-reporting RPC security contract changed unexpectedly.';
  end if;

  if not has_function_privilege('authenticated', reporting_rpc, 'EXECUTE')
     or has_function_privilege('anon', reporting_rpc, 'EXECUTE')
     or has_function_privilege('service_role', reporting_rpc, 'EXECUTE')
     or exists (
       select 1
       from pg_proc as procedure
       cross join lateral aclexplode(
         coalesce(
           procedure.proacl,
           acldefault('f'::"char", procedure.proowner)
         )
       ) as privilege
       where procedure.oid = reporting_rpc
         and privilege.privilege_type = 'EXECUTE'
         and privilege.grantee not in (
           procedure.proowner,
           'authenticated'::regrole
         )
     ) then
    raise exception 'Product-reporting RPC ACL changed unexpectedly.';
  end if;
end
$postcondition$;

commit;
