alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.contact_messages enable row level security;
alter table public.dashboard_user_profiles enable row level security;
alter table public.product_business_data enable row level security;
alter table public.business_settings enable row level security;
alter table public.business_lookup_values enable row level security;
alter table public.campaigns enable row level security;
alter table public.daily_ad_spend enable row level security;
alter table public.order_financial_snapshots enable row level security;
alter table public.order_financial_adjustments enable row level security;
alter table public.settlement_records enable row level security;
alter table public.settlement_order_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_movements enable row level security;
alter table public.audit_history enable row level security;

-- Remove every generic Phase 2 draft policy before adding table-specific rules.
do $drop_draft_policies$
declare
  protected_table text;
  draft_policy text;
begin
  foreach protected_table in array array[
    'dashboard_user_profiles', 'product_business_data', 'business_settings',
    'business_lookup_values', 'campaigns', 'daily_ad_spend', 'orders',
    'order_items', 'order_financial_snapshots',
    'order_financial_adjustments', 'settlement_records',
    'settlement_order_allocations', 'expenses', 'cash_movements',
    'audit_history'
  ] loop
    foreach draft_policy in array array[
      'Dashboard role read', 'Dashboard role insert',
      'Dashboard role update', 'Dashboard role delete'
    ] loop
      execute format(
        'drop policy if exists %I on public.%I',
        draft_policy,
        protected_table
      );
    end loop;
  end loop;
end
$drop_draft_policies$;

drop policy if exists "Dashboard profiles read self"
  on public.dashboard_user_profiles;
drop policy if exists "Owners manage dashboard profiles"
  on public.dashboard_user_profiles;
drop policy if exists "Dashboard users read all products"
  on public.products;
drop policy if exists "Dashboard administrators read audit history"
  on public.audit_history;

-- Public storefront catalog: active rows only and no private buying-cost join.
drop policy if exists "Public can read active categories" on public.categories;
create policy "Public can read active categories"
on public.categories for select to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select to anon, authenticated
using (is_active = true);

create policy "Dashboard catalog administrators read categories"
on public.categories for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard catalog administrators read products"
on public.products for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

-- Profile/user management is owner-only; every active user may read self.
create policy "Dashboard users read own profile"
on public.dashboard_user_profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy "Dashboard owners read all profiles"
on public.dashboard_user_profiles for select to authenticated
using (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

create policy "Dashboard owners insert profiles"
on public.dashboard_user_profiles for insert to authenticated
with check (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

create policy "Dashboard owners update profiles"
on public.dashboard_user_profiles for update to authenticated
using (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
)
with check (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

create policy "Dashboard owners delete profiles"
on public.dashboard_user_profiles for delete to authenticated
using (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

-- Lookup rows are non-financial operational metadata. Active dashboard users
-- may read active values; only owners may manage them directly.
create policy "Dashboard users read active lookup values"
on public.business_lookup_values for select to authenticated
using (
  is_active
  and public.dashboard_has_any_role(
    array['owner', 'admin', 'data_entry', 'viewer']::public.dashboard_role[]
  )
);

create policy "Dashboard owners insert lookup values"
on public.business_lookup_values for insert to authenticated
with check (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

create policy "Dashboard owners update lookup values"
on public.business_lookup_values for update to authenticated
using (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
)
with check (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

create policy "Dashboard owners delete lookup values"
on public.business_lookup_values for delete to authenticated
using (
  public.dashboard_has_any_role(array['owner']::public.dashboard_role[])
);

-- Private cost, operational, and financial base tables are readable only by
-- owner/admin. All writes use audited SECURITY DEFINER RPCs or trusted triggers.
create policy "Dashboard owners and admins read product costs"
on public.product_business_data for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read business settings"
on public.business_settings for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read campaigns"
on public.campaigns for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read ad spend"
on public.daily_ad_spend for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read orders"
on public.orders for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read order items"
on public.order_items for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read recognition snapshots"
on public.order_financial_snapshots for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read financial adjustments"
on public.order_financial_adjustments for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read settlements"
on public.settlement_records for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read settlement allocations"
on public.settlement_order_allocations for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read expenses"
on public.expenses for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

create policy "Dashboard owners and admins read cash movements"
on public.cash_movements for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

-- Audit history has no insert/update/delete policy. The audit trigger is its
-- only writer; owner/admin may read the minimized payload.
create policy "Dashboard owners and admins read audit history"
on public.audit_history for select to authenticated
using (
  public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  )
);

-- Reset current-object grants before granting the smallest API surface.
revoke all on table public.categories, public.products, public.orders,
  public.order_items, public.contact_messages, public.dashboard_user_profiles,
  public.product_business_data, public.business_settings,
  public.business_lookup_values, public.campaigns, public.daily_ad_spend,
  public.order_financial_snapshots, public.order_financial_adjustments,
  public.settlement_records, public.settlement_order_allocations,
  public.expenses, public.cash_movements, public.audit_history
from public, anon, authenticated;

grant select on table public.categories, public.products
  to anon, authenticated;
grant select, insert, update, delete
  on table public.dashboard_user_profiles, public.business_lookup_values
  to authenticated;
grant select on table public.product_business_data, public.business_settings,
  public.campaigns, public.daily_ad_spend, public.orders, public.order_items,
  public.order_financial_snapshots, public.order_financial_adjustments,
  public.settlement_records, public.settlement_order_allocations,
  public.expenses, public.cash_movements, public.audit_history
  to authenticated;

grant all on table public.categories, public.products, public.orders,
  public.order_items, public.contact_messages, public.dashboard_user_profiles,
  public.product_business_data, public.business_settings,
  public.business_lookup_values, public.campaigns, public.daily_ad_spend,
  public.order_financial_snapshots, public.order_financial_adjustments,
  public.settlement_records, public.settlement_order_allocations,
  public.expenses, public.cash_movements
  to service_role;

grant select on table public.audit_history to service_role;

revoke all on sequence public.audit_history_id_seq
  from public, anon, authenticated, service_role;
