-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.
-- Verifies that rollback removed every REHEARSAL fixture marker and every
-- directly related operational, financial, audit, and support record.

with rehearsal_categories as (
  select category.id
  from public.categories as category
  where category.name ilike 'REHEARSAL%'
    or category.slug ilike 'rehearsal-%'
    or coalesce(category.description, '') ilike '%REHEARSAL%'
), rehearsal_products as (
  select product.id
  from public.products as product
  where product.category_id in (select id from rehearsal_categories)
    or product.name ilike 'REHEARSAL%'
    or product.slug ilike 'rehearsal-%'
    or coalesce(product.sku, '') ilike 'REHEARSAL-%'
    or coalesce(product.short_description, '') ilike '%REHEARSAL%'
    or coalesce(product.description, '') ilike '%REHEARSAL%'
), rehearsal_product_business_data as (
  select business_data.product_id
  from public.product_business_data as business_data
  where business_data.product_id in (select id from rehearsal_products)
    or coalesce(business_data.sku_override, '') ilike 'REHEARSAL-%'
    or coalesce(business_data.internal_notes, '') ilike '%REHEARSAL%'
), rehearsal_campaigns as (
  select campaign.id
  from public.campaigns as campaign
  where campaign.name ilike 'REHEARSAL%'
    or coalesce(campaign.channel, '') ilike 'REHEARSAL%'
), rehearsal_orders as (
  select orders.id
  from public.orders as orders
  where orders.order_number ilike 'REHEARSAL-%'
    or orders.customer_name ilike 'REHEARSAL%'
    or orders.customer_phone ilike 'REHEARSAL%'
    or orders.customer_address ilike 'REHEARSAL%'
    or coalesce(orders.customer_note, '') ilike '%REHEARSAL%'
    or coalesce(orders.external_reference, '') ilike 'REHEARSAL-%'
    or coalesce(orders.campaign_name_snapshot, '') ilike 'REHEARSAL%'
    or orders.campaign_id in (select id from rehearsal_campaigns)
), rehearsal_order_items as (
  select item.id
  from public.order_items as item
  where item.order_id in (select id from rehearsal_orders)
    or item.product_id in (select id from rehearsal_products)
    or item.product_name ilike 'REHEARSAL%'
    or item.product_slug ilike 'rehearsal-%'
    or coalesce(item.sku_snapshot, '') ilike 'REHEARSAL-%'
), rehearsal_snapshots as (
  select snapshot.order_id
  from public.order_financial_snapshots as snapshot
  where snapshot.order_id in (select id from rehearsal_orders)
    or snapshot.order_number_snapshot ilike 'REHEARSAL-%'
    or coalesce(snapshot.campaign_name_snapshot, '') ilike 'REHEARSAL%'
), rehearsal_adjustments as (
  select adjustment.id
  from public.order_financial_adjustments as adjustment
  where adjustment.order_id in (select id from rehearsal_orders)
), rehearsal_ad_spend as (
  select spend.id
  from public.daily_ad_spend as spend
  where spend.campaign_id in (select id from rehearsal_campaigns)
    or coalesce(spend.source_reference, '') ilike 'REHEARSAL-%'
), rehearsal_expenses as (
  select expense.id
  from public.expenses as expense
  where expense.campaign_id in (select id from rehearsal_campaigns)
    or expense.category_key ilike 'REHEARSAL%'
    or expense.description ilike '%REHEARSAL%'
    or coalesce(expense.reference, '') ilike 'REHEARSAL-%'
), rehearsal_settlements as (
  select settlement.id
  from public.settlement_records as settlement
  where settlement.courier ilike 'REHEARSAL%'
    or coalesce(settlement.settlement_reference, '') ilike 'REHEARSAL-%'
    or coalesce(settlement.notes, '') ilike '%REHEARSAL%'
), rehearsal_settlement_allocations as (
  select allocation.settlement_id, allocation.order_id
  from public.settlement_order_allocations as allocation
  where allocation.settlement_id in (select id from rehearsal_settlements)
    or allocation.order_id in (select id from rehearsal_orders)
), rehearsal_cash_movements as (
  select movement.id
  from public.cash_movements as movement
  where movement.order_id in (select id from rehearsal_orders)
    or movement.settlement_id in (select id from rehearsal_settlements)
    or movement.expense_id in (select id from rehearsal_expenses)
    or movement.description ilike '%REHEARSAL%'
    or movement.account_key ilike 'REHEARSAL%'
), rehearsal_contacts as (
  select message.id
  from public.contact_messages as message
  where message.name ilike 'REHEARSAL%'
    or coalesce(message.phone, '') ilike 'REHEARSAL%'
    or coalesce(message.email, '') ilike 'REHEARSAL%'
    or coalesce(message.subject, '') ilike '%REHEARSAL%'
    or message.message ilike '%REHEARSAL%'
), rehearsal_profiles as (
  select profile.user_id
  from public.dashboard_user_profiles as profile
  where coalesce(profile.display_name, '') ilike 'REHEARSAL%'
    or coalesce(profile.email, '') ilike 'REHEARSAL%'
), rehearsal_settings as (
  select setting.setting_key
  from public.business_settings as setting
  where setting.setting_key ilike 'REHEARSAL%'
    or setting.setting_value::text ilike '%REHEARSAL%'
    or coalesce(setting.description, '') ilike '%REHEARSAL%'
), rehearsal_lookup_values as (
  select lookup.lookup_type, lookup.lookup_key
  from public.business_lookup_values as lookup
  where lookup.lookup_type ilike 'REHEARSAL%'
    or lookup.lookup_key ilike 'REHEARSAL%'
    or lookup.label ilike '%REHEARSAL%'
    or lookup.metadata::text ilike '%REHEARSAL%'
), rehearsal_record_ids as (
  select id::text as record_id from rehearsal_categories
  union select id::text from rehearsal_products
  union select product_id::text from rehearsal_product_business_data
  union select id::text from rehearsal_campaigns
  union select id::text from rehearsal_orders
  union select id::text from rehearsal_order_items
  union select order_id::text from rehearsal_snapshots
  union select id::text from rehearsal_adjustments
  union select id::text from rehearsal_ad_spend
  union select id::text from rehearsal_expenses
  union select id::text from rehearsal_settlements
  union select id::text from rehearsal_cash_movements
  union select id::text from rehearsal_contacts
  union select user_id::text from rehearsal_profiles
), rehearsal_audit_history as (
  select audit.id
  from public.audit_history as audit
  where audit.record_id in (select record_id from rehearsal_record_ids)
    or coalesce(audit.old_values::text, '') ilike '%REHEARSAL%'
    or coalesce(audit.new_values::text, '') ilike '%REHEARSAL%'
), counts as (
  select 'audit_history'::text as record_type,
    (select count(*) from rehearsal_audit_history)::bigint
      as persisted_count
  union all
  select 'business_lookup_values',
    (select count(*) from rehearsal_lookup_values)::bigint
  union all
  select 'business_settings',
    (select count(*) from rehearsal_settings)::bigint
  union all
  select 'campaigns', (select count(*) from rehearsal_campaigns)::bigint
  union all
  select 'cash_movements',
    (select count(*) from rehearsal_cash_movements)::bigint
  union all
  select 'categories', (select count(*) from rehearsal_categories)::bigint
  union all
  select 'contact_messages', (select count(*) from rehearsal_contacts)::bigint
  union all
  select 'daily_ad_spend', (select count(*) from rehearsal_ad_spend)::bigint
  union all
  select 'dashboard_user_profiles',
    (select count(*) from rehearsal_profiles)::bigint
  union all
  select 'expenses', (select count(*) from rehearsal_expenses)::bigint
  union all
  select 'order_financial_adjustments',
    (select count(*) from rehearsal_adjustments)::bigint
  union all
  select 'order_financial_snapshots',
    (select count(*) from rehearsal_snapshots)::bigint
  union all
  select 'order_items', (select count(*) from rehearsal_order_items)::bigint
  union all
  select 'orders', (select count(*) from rehearsal_orders)::bigint
  union all
  select 'product_business_data',
    (select count(*) from rehearsal_product_business_data)::bigint
  union all
  select 'products', (select count(*) from rehearsal_products)::bigint
  union all
  select 'settlement_order_allocations',
    (select count(*) from rehearsal_settlement_allocations)::bigint
  union all
  select 'settlement_records',
    (select count(*) from rehearsal_settlements)::bigint
)
select record_type, persisted_count, persisted_count = 0 as passed
from counts
order by record_type;
