alter table public.product_business_data enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_lookup_values enable row level security;
alter table public.campaigns enable row level security;
alter table public.daily_ad_spend enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_financial_snapshots enable row level security;
alter table public.settlement_records enable row level security;
alter table public.settlement_order_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_movements enable row level security;
alter table public.audit_history enable row level security;

drop policy if exists "Dashboard profiles read self" on public.dashboard_user_profiles;
create policy "Dashboard profiles read self" on public.dashboard_user_profiles for select to authenticated
using (user_id = (select auth.uid()) or public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]));
drop policy if exists "Owners manage dashboard profiles" on public.dashboard_user_profiles;
create policy "Owners manage dashboard profiles" on public.dashboard_user_profiles for all to authenticated
using (public.dashboard_has_any_role(array['owner']::public.dashboard_role[]))
with check (public.dashboard_has_any_role(array['owner']::public.dashboard_role[]));

drop policy if exists "Dashboard users read all products" on public.products;
create policy "Dashboard users read all products" on public.products for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin','data_entry','viewer']::public.dashboard_role[]));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'product_business_data', 'business_settings', 'business_lookup_values', 'campaigns', 'daily_ad_spend',
    'orders', 'order_items', 'order_financial_snapshots', 'settlement_records',
    'settlement_order_allocations', 'expenses', 'cash_movements'
  ] loop
    execute format('drop policy if exists "Dashboard role read" on public.%I', table_name);
    execute format('create policy "Dashboard role read" on public.%I for select to authenticated using (public.dashboard_has_any_role(array[''owner'',''admin'',''data_entry'',''viewer'']::public.dashboard_role[]))', table_name);
    execute format('drop policy if exists "Dashboard role insert" on public.%I', table_name);
    execute format('create policy "Dashboard role insert" on public.%I for insert to authenticated with check (public.dashboard_has_any_role(array[''owner'',''admin'',''data_entry'']::public.dashboard_role[]))', table_name);
    execute format('drop policy if exists "Dashboard role update" on public.%I', table_name);
    execute format('create policy "Dashboard role update" on public.%I for update to authenticated using (public.dashboard_has_any_role(array[''owner'',''admin'',''data_entry'']::public.dashboard_role[])) with check (public.dashboard_has_any_role(array[''owner'',''admin'',''data_entry'']::public.dashboard_role[]))', table_name);
    execute format('drop policy if exists "Dashboard role delete" on public.%I', table_name);
    execute format('create policy "Dashboard role delete" on public.%I for delete to authenticated using (public.dashboard_has_any_role(array[''owner'',''admin'']::public.dashboard_role[]))', table_name);
  end loop;
end $$;

drop policy if exists "Dashboard administrators read audit history" on public.audit_history;
create policy "Dashboard administrators read audit history" on public.audit_history for select to authenticated
using (public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]));

revoke all on public.product_business_data, public.business_settings, public.business_lookup_values,
  public.campaigns, public.daily_ad_spend, public.order_financial_snapshots, public.settlement_records,
  public.settlement_order_allocations, public.expenses, public.cash_movements, public.audit_history from anon;
grant select, insert, update, delete on public.product_business_data, public.business_settings, public.business_lookup_values,
  public.campaigns, public.daily_ad_spend, public.orders, public.order_items, public.order_financial_snapshots,
  public.settlement_records, public.settlement_order_allocations, public.expenses, public.cash_movements to authenticated;
grant select on public.audit_history to authenticated;

