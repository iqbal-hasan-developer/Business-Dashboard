do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_dashboard_status_allowed') then
    alter table public.orders add constraint orders_dashboard_status_allowed check (
      dashboard_order_status is null or dashboard_order_status in ('Pending','Confirmed','Dispatched','Delivered','Cancelled','Returned','Refunded','Failed Delivery')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_dashboard_payment_status_allowed') then
    alter table public.orders add constraint orders_dashboard_payment_status_allowed check (
      dashboard_payment_status is null or dashboard_payment_status in ('Unpaid','Paid','Partially Paid','Refunded')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_settlement_status_allowed') then
    alter table public.orders add constraint orders_settlement_status_allowed check (
      settlement_status is null or settlement_status in ('Not Applicable','Awaiting','Partially Settled','Settled','Refund Due','Refunded')
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_dashboard_money_nonnegative') then
    alter table public.orders add constraint orders_dashboard_money_nonnegative check (
      discount_amount >= 0 and refund_amount >= 0 and packaging_cost_snapshot >= 0
      and (courier_cost_snapshot is null or courier_cost_snapshot >= 0)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.order_items'::regclass and conname = 'order_items_dashboard_snapshots_nonnegative') then
    alter table public.order_items add constraint order_items_dashboard_snapshots_nonnegative check (
      (list_price_snapshot is null or list_price_snapshot >= 0)
      and (buying_cost_snapshot is null or buying_cost_snapshot >= 0)
      and (actual_unit_selling_price is null or actual_unit_selling_price >= 0)
    ) not valid;
  end if;
end $$;

create index if not exists dashboard_user_profiles_active_role_idx on public.dashboard_user_profiles (is_active, role);
create index if not exists business_lookup_values_active_sort_idx on public.business_lookup_values (lookup_type, is_active, sort_order);
create index if not exists campaigns_active_dates_idx on public.campaigns (is_active, starts_on, ends_on);
create index if not exists daily_ad_spend_date_campaign_idx on public.daily_ad_spend (spend_date desc, campaign_id);
create index if not exists orders_dashboard_date_status_idx on public.orders (order_date desc, dashboard_order_status);
create index if not exists orders_dashboard_channel_campaign_idx on public.orders (sales_channel, campaign_id, order_date desc);
create index if not exists orders_campaign_id_idx on public.orders (campaign_id) where campaign_id is not null;
create index if not exists settlement_allocations_order_id_idx on public.settlement_order_allocations (order_id);
create index if not exists settlement_records_date_status_idx on public.settlement_records (settlement_date desc, status);
create index if not exists expenses_date_category_idx on public.expenses (expense_date desc, category_key);
create index if not exists cash_movements_date_account_idx on public.cash_movements (movement_date desc, account_key);
create index if not exists cash_movements_order_id_idx on public.cash_movements (order_id) where order_id is not null;
create index if not exists cash_movements_settlement_id_idx on public.cash_movements (settlement_id) where settlement_id is not null;
create index if not exists cash_movements_expense_id_idx on public.cash_movements (expense_id) where expense_id is not null;
create index if not exists audit_history_record_idx on public.audit_history (table_name, record_id, changed_at desc);
create index if not exists audit_history_actor_idx on public.audit_history (changed_by, changed_at desc) where changed_by is not null;

