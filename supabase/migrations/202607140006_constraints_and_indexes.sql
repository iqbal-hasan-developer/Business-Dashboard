-- The preflight must report zero data-quality failures before this migration.
-- NOT VALID constraints are added first and validated before NOT NULL changes.
-- Schedule validation/index creation during a low-traffic window and review
-- pg_stat_activity; these operations scan shared production tables.

do $dashboard_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_dashboard_status_allowed'
  ) then
    alter table public.orders add constraint orders_dashboard_status_allowed
      check (
        dashboard_order_status is null
        or dashboard_order_status in (
          'Pending', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled',
          'Returned', 'Refunded', 'Failed Delivery'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_dashboard_payment_status_allowed'
  ) then
    alter table public.orders add constraint orders_dashboard_payment_status_allowed
      check (
        dashboard_payment_status is null
        or dashboard_payment_status in (
          'Unpaid', 'Paid', 'Partially Paid', 'Refunded'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_settlement_status_allowed'
  ) then
    alter table public.orders add constraint orders_settlement_status_allowed
      check (
        settlement_status is null
        or settlement_status in (
          'Not Applicable', 'Awaiting', 'Partially Settled', 'Settled',
          'Refund Due', 'Refunded'
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_dashboard_money_nonnegative'
  ) then
    alter table public.orders add constraint orders_dashboard_money_nonnegative
      check (
        discount_amount >= 0
        and refund_amount >= 0
        and (packaging_cost_snapshot is null or packaging_cost_snapshot >= 0)
        and (courier_cost_snapshot is null or courier_cost_snapshot >= 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_dashboard_adjustments_within_value'
  ) then
    alter table public.orders
      add constraint orders_dashboard_adjustments_within_value check (
        discount_amount <= subtotal + delivery_charge
        and refund_amount <= subtotal + delivery_charge - discount_amount
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_dashboard_snapshots_nonnegative'
  ) then
    alter table public.order_items
      add constraint order_items_dashboard_snapshots_nonnegative check (
        (list_price_snapshot is null or list_price_snapshot >= 0)
        and (buying_cost_snapshot is null or buying_cost_snapshot >= 0)
        and (actual_unit_selling_price is null
          or actual_unit_selling_price >= 0)
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_sku_required'
  ) then
    alter table public.products add constraint products_sku_required
      check (sku is not null and btrim(sku) <> '') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_order_id_required'
  ) then
    alter table public.order_items add constraint order_items_order_id_required
      check (order_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_items'::regclass
      and conname = 'order_items_product_id_required'
  ) then
    alter table public.order_items add constraint order_items_product_id_required
      check (product_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_dashboard_compatibility_required'
  ) then
    alter table public.orders
      add constraint orders_dashboard_compatibility_required check (
        order_date is not null
        and customer_location is not null
        and sales_channel is not null
        and dashboard_order_status is not null
        and dashboard_payment_status is not null
        and settlement_status is not null
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_method_dashboard_allowed'
  ) then
    alter table public.orders
      add constraint orders_payment_method_dashboard_allowed check (
        payment_method in (
          'cod', 'bkash', 'nagad', 'cash', 'bank_transfer'
        )
      ) not valid;
  end if;
end
$dashboard_constraints$;

alter table public.orders
  validate constraint orders_dashboard_status_allowed;
alter table public.orders
  validate constraint orders_dashboard_payment_status_allowed;
alter table public.orders
  validate constraint orders_settlement_status_allowed;
alter table public.orders
  validate constraint orders_dashboard_money_nonnegative;
alter table public.orders
  validate constraint orders_dashboard_adjustments_within_value;
alter table public.orders
  validate constraint orders_payment_method_dashboard_allowed;
alter table public.order_items
  validate constraint order_items_dashboard_snapshots_nonnegative;
alter table public.order_items
  validate constraint order_items_order_id_required;
alter table public.order_items
  validate constraint order_items_product_id_required;
alter table public.orders
  validate constraint orders_dashboard_compatibility_required;
alter table public.products
  validate constraint products_sku_required;

alter table public.order_items alter column order_id set not null;
alter table public.order_items alter column product_id set not null;
alter table public.orders alter column order_date set not null;
alter table public.orders alter column customer_location set not null;
alter table public.orders alter column sales_channel set not null;
alter table public.orders alter column dashboard_order_status set not null;
alter table public.orders alter column dashboard_payment_status set not null;
alter table public.orders alter column settlement_status set not null;
alter table public.products alter column sku set not null;

alter table public.orders
  drop constraint if exists orders_payment_method_allowed;
alter table public.orders
  rename constraint orders_payment_method_dashboard_allowed
  to orders_payment_method_allowed;

create unique index if not exists products_sku_ci_uidx
  on public.products (lower(btrim(sku)));

create index if not exists products_category_id_idx
  on public.products (category_id);
create index if not exists dashboard_user_profiles_active_role_idx
  on public.dashboard_user_profiles (is_active, role);
create index if not exists product_business_data_verified_by_idx
  on public.product_business_data (buying_price_verified_by)
  where buying_price_verified_by is not null;
create index if not exists product_business_data_created_by_idx
  on public.product_business_data (created_by)
  where created_by is not null;
create index if not exists product_business_data_updated_by_idx
  on public.product_business_data (updated_by)
  where updated_by is not null;
create index if not exists business_settings_updated_by_idx
  on public.business_settings (updated_by)
  where updated_by is not null;
create index if not exists business_lookup_values_active_sort_idx
  on public.business_lookup_values (lookup_type, is_active, sort_order);
create index if not exists business_lookup_values_updated_by_idx
  on public.business_lookup_values (updated_by)
  where updated_by is not null;
create index if not exists campaigns_active_dates_idx
  on public.campaigns (is_active, starts_on, ends_on);
create index if not exists campaigns_created_by_idx
  on public.campaigns (created_by) where created_by is not null;
create index if not exists campaigns_updated_by_idx
  on public.campaigns (updated_by) where updated_by is not null;
create index if not exists daily_ad_spend_date_campaign_idx
  on public.daily_ad_spend (spend_date desc, campaign_id);
create index if not exists daily_ad_spend_platform_date_idx
  on public.daily_ad_spend (lower(platform), spend_date desc);
create index if not exists daily_ad_spend_campaign_id_idx
  on public.daily_ad_spend (campaign_id) where campaign_id is not null;
create index if not exists daily_ad_spend_created_by_idx
  on public.daily_ad_spend (created_by) where created_by is not null;
create index if not exists daily_ad_spend_updated_by_idx
  on public.daily_ad_spend (updated_by) where updated_by is not null;
create index if not exists orders_dashboard_date_status_idx
  on public.orders (order_date desc, dashboard_order_status);
create index if not exists orders_dashboard_channel_campaign_idx
  on public.orders (sales_channel, campaign_id, order_date desc);
create index if not exists orders_campaign_id_idx
  on public.orders (campaign_id) where campaign_id is not null;
create index if not exists order_financial_snapshots_recognized_by_idx
  on public.order_financial_snapshots (recognized_by)
  where recognized_by is not null;
create index if not exists order_financial_snapshots_order_date_idx
  on public.order_financial_snapshots (order_date desc);
create index if not exists order_financial_snapshots_channel_campaign_idx
  on public.order_financial_snapshots (
    lower(sales_channel), campaign_id, order_date desc
  );
create index if not exists order_financial_snapshots_campaign_id_idx
  on public.order_financial_snapshots (campaign_id, order_date desc)
  where campaign_id is not null;
create index if not exists order_financial_adjustments_order_id_idx
  on public.order_financial_adjustments (order_id, occurred_at);
create index if not exists order_financial_adjustments_created_by_idx
  on public.order_financial_adjustments (created_by)
  where created_by is not null;
create index if not exists settlement_allocations_order_id_idx
  on public.settlement_order_allocations (order_id);
create index if not exists settlement_allocations_created_by_idx
  on public.settlement_order_allocations (created_by)
  where created_by is not null;
create index if not exists settlement_records_date_status_idx
  on public.settlement_records (settlement_date desc, status);
create index if not exists settlement_records_created_by_idx
  on public.settlement_records (created_by) where created_by is not null;
create index if not exists settlement_records_updated_by_idx
  on public.settlement_records (updated_by) where updated_by is not null;
create index if not exists expenses_date_category_idx
  on public.expenses (expense_date desc, category_key);
create index if not exists expenses_channel_date_idx
  on public.expenses (lower(sales_channel), expense_date desc)
  where sales_channel is not null;
create index if not exists expenses_campaign_id_idx
  on public.expenses (campaign_id) where campaign_id is not null;
create index if not exists expenses_created_by_idx
  on public.expenses (created_by) where created_by is not null;
create index if not exists expenses_updated_by_idx
  on public.expenses (updated_by) where updated_by is not null;
create index if not exists cash_movements_date_account_idx
  on public.cash_movements (movement_date desc, account_key);
create index if not exists cash_movements_order_id_idx
  on public.cash_movements (order_id) where order_id is not null;
create index if not exists cash_movements_settlement_id_idx
  on public.cash_movements (settlement_id) where settlement_id is not null;
create index if not exists cash_movements_expense_id_idx
  on public.cash_movements (expense_id) where expense_id is not null;
create index if not exists cash_movements_created_by_idx
  on public.cash_movements (created_by) where created_by is not null;
create index if not exists audit_history_record_idx
  on public.audit_history (table_name, record_id, changed_at desc);
create index if not exists audit_history_actor_idx
  on public.audit_history (changed_by, changed_at desc)
  where changed_by is not null;
