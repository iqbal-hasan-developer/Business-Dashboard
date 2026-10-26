begin;

create or replace function public.record_steadfast_cod_settlement_v4(
  p_settlement_date date,
  p_receipt_treatment text,
  p_receiving_method text,
  p_owner_allocations jsonb,
  p_gross_cod_amount numeric,
  p_deductions numeric,
  p_net_received numeric,
  p_orders jsonb,
  p_rejected_adjustments jsonb,
  p_idempotency_key uuid,
  p_courier_reference text default null,
  p_receiving_account_label text default null,
  p_receiving_account_last4 text default null,
  p_receiving_transaction_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  normalized_treatment text := lower(btrim(p_receipt_treatment));
  normalized_method text := nullif(lower(btrim(p_receiving_method)), '');
  normalized_courier_reference text := nullif(btrim(p_courier_reference), '');
  normalized_label text := nullif(btrim(p_receiving_account_label), '');
  normalized_last4 text := nullif(btrim(p_receiving_account_last4), '');
  normalized_tx_reference text := nullif(btrim(p_receiving_transaction_reference), '');
  normalized_note text := nullif(btrim(p_note), '');
  normalized_allocations jsonb := '[]'::jsonb;
  fingerprint text;
  existing_id uuid;
  existing_fingerprint text;
  selected_order_count integer;
  eligible_order_count integer;
  selected_adjustment_count integer;
  eligible_adjustment_count integer;
  allocation_count integer;
  selected_order_total numeric(14,2);
  selected_recovery_total numeric(14,2);
  selected_adjustment_charge_total numeric(14,2);
  allocation_total numeric(14,2);
  compatibility_owner text;
  new_id uuid;
  allocation record;
  event_id uuid;
  child_key uuid;
begin
  if actor_id is null or not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_settlement_date is null or p_settlement_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Settlement date must be a valid current or historical Dhaka business date.' using errcode = '22023';
  end if;
  if normalized_treatment not in ('business_account','owner_held_business_funds') then
    raise exception 'Choose business-account receipt or owner-held business funds.' using errcode = '22023';
  end if;
  if p_gross_cod_amount <= 0 or p_deductions < 0 or p_net_received <= 0
    or p_net_received <> p_gross_cod_amount - p_deductions
    or p_gross_cod_amount <> trunc(p_gross_cod_amount,2)
    or p_deductions <> trunc(p_deductions,2)
    or p_net_received <> trunc(p_net_received,2) then
    raise exception 'Net received must equal gross COD less deductions using exact 2-decimal amounts.' using errcode = '22023';
  end if;
  if normalized_last4 is not null and normalized_last4 !~ '^[0-9]{2,4}$' then
    raise exception 'Only a masked final 2 to 4 digits may be stored.' using errcode = '22023';
  end if;
  if normalized_label is not null and length(normalized_label) > 80
    or normalized_courier_reference is not null and length(normalized_courier_reference) > 160
    or normalized_tx_reference is not null and length(normalized_tx_reference) > 160
    or normalized_note is not null and length(normalized_note) > 500 then
    raise exception 'Settlement text exceeds the supported length.' using errcode = '22023';
  end if;
  if concat_ws(' ',normalized_label,normalized_note) ~* '(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number|routing[ -]?number)' then
    raise exception 'Do not store credentials or full private account details.' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or jsonb_typeof(p_orders) <> 'array'
    or jsonb_typeof(p_rejected_adjustments) <> 'array'
    or jsonb_array_length(p_orders) + jsonb_array_length(p_rejected_adjustments) < 1
    or jsonb_array_length(p_orders) + jsonb_array_length(p_rejected_adjustments) > 100 then
    raise exception 'A request key and at least one unique settlement item are required.' using errcode = '22023';
  end if;

  if normalized_treatment = 'business_account' then
    if normalized_method not in ('bkash','bank_transfer')
      or (p_owner_allocations is not null and p_owner_allocations <> '[]'::jsonb) then
      raise exception 'A business receipt requires one valid business account and no owner allocations.' using errcode = '22023';
    end if;
  else
    if normalized_method is not null or normalized_label is not null or normalized_last4 is not null
      or jsonb_typeof(p_owner_allocations) <> 'array'
      or jsonb_array_length(p_owner_allocations) < 1 or jsonb_array_length(p_owner_allocations) > 3 then
      raise exception 'Owner-held receipt requires one to three owner allocations and no business cash destination.' using errcode = '22023';
    end if;
    select jsonb_agg(jsonb_build_object('owner_label',canonical_owner,'amount',amount) order by canonical_owner),
      count(*),sum(amount)::numeric(14,2),min(canonical_owner) filter (where true)
    into normalized_allocations,allocation_count,allocation_total,compatibility_owner
    from (
      select case lower(btrim(item->>'owner_label'))
        when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal' end as canonical_owner,
        case when jsonb_typeof(item->'amount')='number' then (item->>'amount')::numeric end as amount
      from jsonb_array_elements(p_owner_allocations) item
    ) parsed;
    if exists (
      select 1 from jsonb_array_elements(p_owner_allocations) item
      where jsonb_typeof(item)<>'object'
        or case when jsonb_typeof(item)='object' then
          (select count(*) from jsonb_object_keys(item))<>2
          or not (item ? 'owner_label' and item ? 'amount') else false end
    ) or exists (
      select 1 from jsonb_array_elements(normalized_allocations) item
      where item->>'owner_label' is null or item->>'amount' is null
        or (item->>'amount')::numeric <= 0
        or (item->>'amount')::numeric <> trunc((item->>'amount')::numeric,2)
    ) then
      raise exception 'Every owner allocation requires one canonical owner and a positive exact 2-decimal amount.' using errcode = '22023';
    end if;
    if (select count(distinct item->>'owner_label') from jsonb_array_elements(normalized_allocations) item) <> allocation_count then
      raise exception 'An owner may appear only once in a settlement.' using errcode = '22023';
    end if;
    if allocation_total <> p_net_received then
      raise exception 'Owner allocations must equal net received exactly.' using errcode = '22023';
    end if;
    if allocation_count <> 1 then compatibility_owner := null; end if;
  end if;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'date',p_settlement_date,'receipt_treatment',normalized_treatment,
    'method',normalized_method,'owner_allocations',normalized_allocations,
    'gross',p_gross_cod_amount,'deductions',p_deductions,'net',p_net_received,
    'orders',p_orders,'rejected_adjustments',p_rejected_adjustments,
    'courier_reference',normalized_courier_reference,'label',normalized_label,
    'last4',normalized_last4,'transaction_reference',normalized_tx_reference,'note',normalized_note
  )::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('settlement-request:' || p_idempotency_key::text,0));
  select id,request_fingerprint into existing_id,existing_fingerprint
  from public.settlement_records where idempotency_key=p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint=fingerprint then return existing_id; end if;
    raise exception 'The request key was already used with different settlement details.' using errcode = '23505';
  end if;

  select count(*),count(distinct value->>'order_id') into selected_order_count,eligible_order_count
  from jsonb_array_elements(p_orders);
  if selected_order_count<>eligible_order_count or exists (
    select 1 from jsonb_array_elements(p_orders) item
    where item->>'order_id' is null or item->>'expected_updated_at' is null
  ) then
    raise exception 'Selected orders must be unique and include freshness evidence.' using errcode = '22023';
  end if;
  select count(*),count(distinct value->>'adjustment_id') into selected_adjustment_count,eligible_adjustment_count
  from jsonb_array_elements(p_rejected_adjustments);
  if selected_adjustment_count<>eligible_adjustment_count or exists (
    select 1 from jsonb_array_elements(p_rejected_adjustments) item
    where item->>'adjustment_id' is null or item->>'expected_created_at' is null
  ) then
    raise exception 'Selected rejected COD adjustments must be unique and include freshness evidence.' using errcode = '22023';
  end if;

  perform orders.id from public.orders as orders
  where orders.id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item)
  order by orders.id for update;
  perform adjustment.id from public.rejected_cod_courier_adjustments as adjustment
  where adjustment.id in (select (item->>'adjustment_id')::uuid from jsonb_array_elements(p_rejected_adjustments) item)
  order by adjustment.id for update;

  select count(*),coalesce(sum(eligible.gross_cod_receivable),0)::numeric(14,2)
  into eligible_order_count,selected_order_total
  from public.dashboard_steadfast_settlement_eligible_orders eligible
  join jsonb_array_elements(p_orders) item
    on eligible.order_id=(item->>'order_id')::uuid
   and eligible.updated_at=(item->>'expected_updated_at')::timestamptz;
  if eligible_order_count<>selected_order_count then
    raise exception 'One or more orders are stale, ineligible, non-COD, not Delivered, or already settled.' using errcode = 'P0001';
  end if;

  select count(*),coalesce(sum(eligible.gross_cod_recovery),0)::numeric(14,2),
    coalesce(sum(eligible.courier_charge),0)::numeric(14,2)
  into eligible_adjustment_count,selected_recovery_total,selected_adjustment_charge_total
  from public.dashboard_steadfast_settlement_eligible_rejected_adjustments eligible
  join jsonb_array_elements(p_rejected_adjustments) item
    on eligible.adjustment_id=(item->>'adjustment_id')::uuid
   and eligible.expected_created_at=(item->>'expected_created_at')::timestamptz;
  if eligible_adjustment_count<>selected_adjustment_count then
    raise exception 'One or more rejected COD adjustments are stale, ineligible, or already confirmed.' using errcode = 'P0001';
  end if;
  if selected_order_total + selected_recovery_total <> p_gross_cod_amount then
    raise exception 'Selected order receivables and delivery-charge recoveries do not reconcile to gross COD.' using errcode = 'P0001';
  end if;
  if p_deductions < selected_adjustment_charge_total then
    raise exception 'Batch deductions must include every selected rejected-order courier charge.' using errcode = 'P0001';
  end if;

  if normalized_treatment='owner_held_business_funds' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('owner-held:' || (item->>'owner_label'),0))
    from jsonb_array_elements(normalized_allocations) item order by item->>'owner_label';
  end if;

  insert into public.settlement_records (
    courier,settlement_reference,settlement_date,amount_received,fees_withheld,
    status,notes,created_by,updated_by,receiving_method,
    receiving_account_label,receiving_account_last4,receiving_transaction_reference,
    gross_cod_amount,idempotency_key,request_fingerprint,confirmed_at,
    receipt_treatment,owner_label
  ) values (
    'Steadfast',normalized_courier_reference,p_settlement_date,p_net_received,p_deductions,
    'reconciled',normalized_note,actor_id,actor_id,normalized_method,
    normalized_label,normalized_last4,normalized_tx_reference,
    p_gross_cod_amount,p_idempotency_key,fingerprint,now(),normalized_treatment,compatibility_owner
  ) returning id into new_id;

  insert into public.settlement_order_allocations(settlement_id,order_id,allocated_amount,created_by)
  select new_id,eligible.order_id,eligible.gross_cod_receivable,actor_id
  from public.dashboard_steadfast_settlement_eligible_orders eligible
  join jsonb_array_elements(p_orders) item on eligible.order_id=(item->>'order_id')::uuid;

  insert into public.rejected_cod_adjustment_settlement_allocations(
    adjustment_id,settlement_id,customer_delivery_charge_recovery,courier_charge,net_adjustment,created_by
  )
  select eligible.adjustment_id,new_id,eligible.gross_cod_recovery,eligible.courier_charge,
    eligible.expected_net_adjustment,actor_id
  from public.dashboard_steadfast_settlement_eligible_rejected_adjustments eligible
  join jsonb_array_elements(p_rejected_adjustments) item
    on eligible.adjustment_id=(item->>'adjustment_id')::uuid;

  if normalized_treatment='business_account' then
    insert into public.cash_movements(
      movement_date,movement_type,account_key,amount,settlement_id,description,created_by
    ) values (
      p_settlement_date,'inflow',normalized_method,p_net_received,new_id,
      'Steadfast COD settlement receipt',actor_id
    );
  else
    for allocation in
      select item->>'owner_label' as owner_label,(item->>'amount')::numeric(12,2) as amount
      from jsonb_array_elements(normalized_allocations) item order by item->>'owner_label'
    loop
      child_key := (
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),1,8) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),9,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),13,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),17,4) || '-' ||
        substr(md5(p_idempotency_key::text || ':' || allocation.owner_label),21,12)
      )::uuid;
      insert into public.owner_held_fund_events(
        event_type,event_date,owner_label,amount,settlement_id,reason,
        idempotency_key,request_fingerprint,created_by
      ) values (
        'receipt',p_settlement_date,allocation.owner_label,allocation.amount,new_id,
        coalesce(normalized_note,'Steadfast settlement received by owner for the business'),
        child_key,fingerprint,actor_id
      ) returning id into event_id;
      insert into public.settlement_receipt_allocations(
        settlement_id,receipt_treatment,owner_label,amount,owner_held_event_id,
        allocation_type,source_reference,created_by
      ) values (
        new_id,normalized_treatment,allocation.owner_label,allocation.amount,event_id,
        'receipt','settlement:' || new_id::text || ':owner:' || lower(allocation.owner_label),actor_id
      );
    end loop;
  end if;

  update public.orders set settlement_status='Settled',updated_at=now()
  where id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item);
  return new_id;
end
$function$;

revoke all on function public.record_steadfast_cod_settlement_v4(
  date,text,text,jsonb,numeric,numeric,numeric,jsonb,jsonb,uuid,text,text,text,text,text
)
from public,anon,authenticated,service_role;
grant execute on function public.record_steadfast_cod_settlement_v4(
  date,text,text,jsonb,numeric,numeric,numeric,jsonb,jsonb,uuid,text,text,text,text,text
)
to authenticated;

create or replace view public.dashboard_reconciliation
with (security_invoker = true)
as
with order_totals as (
  select count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue),0)::numeric(14,2) as product_revenue,
    coalesce(sum(net_revenue),0)::numeric(14,2) as order_net_revenue,
    case when count(*) filter (where not cogs_complete)=0 then coalesce(sum(recognized_cogs),0)::numeric(14,2) end as cogs,
    case when count(*) filter (where not cogs_complete)=0 then coalesce(sum(gross_profit),0)::numeric(14,2) end as order_gross_profit,
    case when count(*) filter (where not cogs_complete or not fulfillment_costs_complete)=0
      then coalesce(sum(contribution_profit),0)::numeric(14,2) end as order_contribution_profit
  from public.dashboard_order_financials
), rejected as (
  select coalesce(sum(delivery_charge_recovery),0)::numeric(14,2) as recovery,
    coalesce(sum(net_adjustment),0)::numeric(14,2) as contribution
  from public.dashboard_rejected_cod_adjustment_financials
), ads as (
  select coalesce(sum(amount),0)::numeric(14,2) as ad_spend from public.daily_ad_spend
), operating as (
  select coalesce(sum(amount),0)::numeric(14,2) as expenses
  from public.expenses where accounting_class='operating_expense'
), combined as (
  select orders.*, (orders.order_net_revenue+rejected.recovery)::numeric(14,2) as net_revenue,
    case when orders.order_gross_profit is null then null else (orders.order_gross_profit+rejected.recovery)::numeric(14,2) end as gross_profit,
    case when orders.order_contribution_profit is null then null else (orders.order_contribution_profit+rejected.contribution)::numeric(14,2) end as contribution_profit
  from order_totals orders cross join rejected
)
select combined.delivered_order_count,combined.delivered_orders_missing_cogs,
  combined.delivered_orders_missing_fulfillment_costs,combined.product_revenue,
  combined.net_revenue,combined.cogs,combined.gross_profit,combined.contribution_profit,
  case when combined.delivered_order_count=0 then 0 else round(combined.order_net_revenue/combined.delivered_order_count,2) end::numeric(14,2) as average_order_value,
  ads.ad_spend,operating.expenses,
  case when combined.contribution_profit is null then null else
    (combined.contribution_profit-ads.ad_spend-operating.expenses)::numeric(14,2) end as net_profit,
  case when combined.contribution_profit is null or combined.net_revenue=0 then null else round(
    (combined.contribution_profit-ads.ad_spend-operating.expenses)/combined.net_revenue*100,2
  ) end::numeric(8,2) as profit_margin
from combined cross join ads cross join operating;

create or replace view public.dashboard_daily_financials
with (security_invoker = true)
as
with orders_by_day as (
  select order_date as business_date,count(*)::bigint as delivered_order_count,
    count(*) filter (where not cogs_complete)::bigint as delivered_orders_missing_cogs,
    count(*) filter (where not fulfillment_costs_complete)::bigint as delivered_orders_missing_fulfillment_costs,
    coalesce(sum(recognized_product_revenue),0)::numeric(14,2) as product_revenue,
    coalesce(sum(net_revenue),0)::numeric(14,2) as order_net_revenue,
    case when count(*) filter (where not cogs_complete)=0 then coalesce(sum(recognized_cogs),0)::numeric(14,2) end as cogs,
    case when count(*) filter (where not cogs_complete)=0 then coalesce(sum(gross_profit),0)::numeric(14,2) end as order_gross_profit,
    case when count(*) filter (where not cogs_complete or not fulfillment_costs_complete)=0 then coalesce(sum(contribution_profit),0)::numeric(14,2) end as order_contribution_profit
  from public.dashboard_order_financials group by order_date
), rejected_by_day as (
  select event_date as business_date,sum(delivery_charge_recovery)::numeric(14,2) as recovery,
    sum(net_adjustment)::numeric(14,2) as contribution
  from public.dashboard_rejected_cod_adjustment_financials group by event_date
), expenses_by_day as (
  select expense_date as business_date,sum(amount)::numeric(14,2) as expenses
  from public.expenses where accounting_class='operating_expense' group by expense_date
), ads_by_day as (
  select spend_date as business_date,sum(amount)::numeric(14,2) as ad_spend
  from public.daily_ad_spend group by spend_date
), business_dates as (
  select business_date from orders_by_day union select business_date from rejected_by_day
  union select business_date from expenses_by_day union select business_date from ads_by_day
), combined as (
  select dates.business_date,coalesce(orders.delivered_order_count,0)::bigint as delivered_order_count,
    coalesce(orders.delivered_orders_missing_cogs,0)::bigint as delivered_orders_missing_cogs,
    coalesce(orders.delivered_orders_missing_fulfillment_costs,0)::bigint as delivered_orders_missing_fulfillment_costs,
    coalesce(orders.product_revenue,0)::numeric(14,2) as product_revenue,
    coalesce(orders.order_net_revenue,0)::numeric(14,2) as order_net_revenue,
    (coalesce(orders.order_net_revenue,0)+coalesce(rejected.recovery,0))::numeric(14,2) as net_revenue,
    case when coalesce(orders.delivered_orders_missing_cogs,0)=0 then coalesce(orders.cogs,0)::numeric(14,2) end as cogs,
    case when coalesce(orders.delivered_orders_missing_cogs,0)=0 then (coalesce(orders.order_gross_profit,0)+coalesce(rejected.recovery,0))::numeric(14,2) end as gross_profit,
    case when coalesce(orders.delivered_orders_missing_cogs,0)=0 and coalesce(orders.delivered_orders_missing_fulfillment_costs,0)=0
      then (coalesce(orders.order_contribution_profit,0)+coalesce(rejected.contribution,0))::numeric(14,2) end as contribution_profit,
    coalesce(expenses.expenses,0)::numeric(14,2) as expenses,coalesce(ads.ad_spend,0)::numeric(14,2) as ad_spend
  from business_dates dates left join orders_by_day orders using(business_date)
  left join rejected_by_day rejected using(business_date)
  left join expenses_by_day expenses using(business_date)
  left join ads_by_day ads using(business_date)
)
select combined.business_date,combined.delivered_order_count,combined.delivered_orders_missing_cogs,
  combined.delivered_orders_missing_fulfillment_costs,combined.product_revenue,combined.net_revenue,
  combined.cogs,combined.gross_profit,combined.contribution_profit,
  case when combined.delivered_order_count=0 then 0 else round(combined.order_net_revenue/combined.delivered_order_count,2) end::numeric(14,2) as average_order_value,
  combined.expenses,combined.ad_spend,
  case when combined.contribution_profit is null then null else
    (combined.contribution_profit-combined.expenses-combined.ad_spend)::numeric(14,2) end as net_profit,
  case when combined.contribution_profit is null or combined.net_revenue=0 then null else round(
    (combined.contribution_profit-combined.expenses-combined.ad_spend)/combined.net_revenue*100,2
  ) end::numeric(8,2) as profit_margin
from combined;

create or replace function public.get_dashboard_financial_summary(
  p_start_date date default null,p_end_date date default null,
  p_sales_channel text default null,p_campaign_id uuid default null
)
returns table (
  delivered_order_count bigint,delivered_orders_missing_cogs bigint,
  delivered_orders_missing_fulfillment_costs bigint,product_revenue numeric(14,2),
  net_revenue numeric(14,2),cogs numeric(14,2),gross_profit numeric(14,2),
  contribution_profit numeric(14,2),average_order_value numeric(14,2),
  ad_spend numeric(14,2),expenses numeric(14,2),net_profit numeric(14,2),profit_margin numeric(8,2)
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(array['owner','admin','viewer']::public.dashboard_role[]) then
    raise exception 'Dashboard reporting access is required.' using errcode='42501';
  end if;
  if p_start_date is not null and p_end_date is not null and p_start_date>p_end_date then
    raise exception 'Start date must not be after end date.' using errcode='22023';
  end if;
  return query
  with filtered_orders as (
    select financial.* from public.dashboard_order_financials financial
    where (p_start_date is null or financial.order_date>=p_start_date)
      and (p_end_date is null or financial.order_date<=p_end_date)
      and (p_sales_channel is null or lower(financial.sales_channel)=lower(p_sales_channel))
      and (p_campaign_id is null or financial.campaign_id=p_campaign_id)
  ), orders as (
    select count(*)::bigint as delivered_order_count,
      count(*) filter(where not filtered.cogs_complete)::bigint as missing_cogs,
      count(*) filter(where not filtered.fulfillment_costs_complete)::bigint as missing_fulfillment,
      coalesce(sum(filtered.recognized_product_revenue),0)::numeric(14,2) as product_revenue,
      coalesce(sum(filtered.net_revenue),0)::numeric(14,2) as order_net_revenue,
      case when count(*) filter(where not filtered.cogs_complete)=0 then coalesce(sum(filtered.recognized_cogs),0)::numeric(14,2) end as cogs,
      case when count(*) filter(where not filtered.cogs_complete)=0 then coalesce(sum(filtered.gross_profit),0)::numeric(14,2) end as order_gross_profit,
      case when count(*) filter(where not filtered.cogs_complete or not filtered.fulfillment_costs_complete)=0 then coalesce(sum(filtered.contribution_profit),0)::numeric(14,2) end as order_contribution_profit
    from filtered_orders filtered
  ), rejected as (
    select coalesce(sum(financial.delivery_charge_recovery),0)::numeric(14,2) as recovery,
      coalesce(sum(financial.net_adjustment),0)::numeric(14,2) as contribution
    from public.dashboard_rejected_cod_adjustment_financials financial
    where (p_start_date is null or financial.event_date>=p_start_date)
      and (p_end_date is null or financial.event_date<=p_end_date)
      and (p_sales_channel is null or lower(financial.sales_channel)=lower(p_sales_channel))
      and (p_campaign_id is null or financial.campaign_id=p_campaign_id)
  ), ads as (
    select coalesce(sum(spend.amount),0)::numeric(14,2) as ad_spend from public.daily_ad_spend spend
    where (p_start_date is null or spend.spend_date>=p_start_date)
      and (p_end_date is null or spend.spend_date<=p_end_date)
      and (p_sales_channel is null or lower(spend.platform)=lower(p_sales_channel))
      and (p_campaign_id is null or spend.campaign_id=p_campaign_id)
  ), operating as (
    select coalesce(sum(expense.amount),0)::numeric(14,2) as expenses from public.expenses expense
    where expense.accounting_class='operating_expense'
      and (p_start_date is null or expense.expense_date>=p_start_date)
      and (p_end_date is null or expense.expense_date<=p_end_date)
      and (p_sales_channel is null or lower(expense.sales_channel)=lower(p_sales_channel))
      and (p_campaign_id is null or expense.campaign_id=p_campaign_id)
  ), combined as (
    select orders.*,(orders.order_net_revenue+rejected.recovery)::numeric(14,2) as net_revenue,
      case when orders.order_gross_profit is null then null else (orders.order_gross_profit+rejected.recovery)::numeric(14,2) end as gross_profit,
      case when orders.order_contribution_profit is null then null else (orders.order_contribution_profit+rejected.contribution)::numeric(14,2) end as contribution_profit
    from orders cross join rejected
  )
  select combined.delivered_order_count,combined.missing_cogs,combined.missing_fulfillment,
    combined.product_revenue,combined.net_revenue,combined.cogs,combined.gross_profit,combined.contribution_profit,
    case when combined.delivered_order_count=0 then 0 else round(combined.order_net_revenue/combined.delivered_order_count,2) end::numeric(14,2),
    ads.ad_spend,operating.expenses,
    case when combined.contribution_profit is null then null else (combined.contribution_profit-ads.ad_spend-operating.expenses)::numeric(14,2) end,
    case when combined.contribution_profit is null or combined.net_revenue=0 then null else round(
      (combined.contribution_profit-ads.ad_spend-operating.expenses)/combined.net_revenue*100,2
    ) end::numeric(8,2)
  from combined cross join ads cross join operating;
end
$function$;

revoke all on function public.get_dashboard_financial_summary(date,date,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_dashboard_financial_summary(date,date,text,uuid)
to authenticated,service_role;

commit;
