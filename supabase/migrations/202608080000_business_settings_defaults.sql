-- Owner-approved MVP business defaults. Money is stored as integer poisha in
-- JSONB settings so application snapshots never depend on floating-point math.

insert into public.business_settings (setting_key, setting_value, description)
values
  ('currency', to_jsonb('BDT'::text), 'Business currency; fixed for the MVP'),
  ('business_timezone', to_jsonb('Asia/Dhaka'::text), 'Business reporting timezone; fixed for the MVP'),
  ('default_courier', to_jsonb('Steadfast'::text), 'Default courier copied into new manual orders'),
  ('inside_dhaka_courier_cost_poisha', to_jsonb(6500::bigint), 'Default Inside Dhaka courier cost in integer poisha'),
  ('outside_dhaka_courier_cost_poisha', to_jsonb(11500::bigint), 'Default Outside Dhaka courier cost in integer poisha'),
  ('packaging_cost_per_order_poisha', to_jsonb(200::bigint), 'Default packaging cost per order in integer poisha'),
  ('tax_vat_basis_points', to_jsonb(0::integer), 'Default tax or VAT percentage in basis points')
on conflict (setting_key) do nothing;

insert into public.business_lookup_values (
  lookup_type, lookup_key, label, sort_order, metadata
)
values
  ('cash_account', 'cash', 'Cash', 10, '{"account_type":"cash"}'::jsonb),
  ('cash_account', 'bkash', 'bKash', 20, '{"account_type":"mobile_wallet"}'::jsonb),
  ('cash_account', 'nagad', 'Nagad', 30, '{"account_type":"mobile_wallet"}'::jsonb),
  ('cash_account', 'bank', 'Bank', 40, '{"account_type":"bank"}'::jsonb),
  ('cash_account', 'steadfast', 'Steadfast', 50, '{"account_type":"courier"}'::jsonb)
on conflict (lookup_type, lookup_key) do nothing;

create or replace function public.get_business_order_defaults()
returns table (
  currency text,
  business_timezone text,
  default_courier text,
  inside_dhaka_courier_cost_poisha bigint,
  outside_dhaka_courier_cost_poisha bigint,
  packaging_cost_per_order_poisha bigint,
  tax_vat_basis_points integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(
    array['owner', 'admin', 'data_entry']::public.dashboard_role[]
  ) then
    raise exception 'Not authorized to read operational order defaults' using errcode = '42501';
  end if;
  return query
  select
    (select setting_value #>> '{}' from public.business_settings where setting_key = 'currency'),
    (select setting_value #>> '{}' from public.business_settings where setting_key = 'business_timezone'),
    (select setting_value #>> '{}' from public.business_settings where setting_key = 'default_courier'),
    (select (setting_value #>> '{}')::bigint from public.business_settings where setting_key = 'inside_dhaka_courier_cost_poisha'),
    (select (setting_value #>> '{}')::bigint from public.business_settings where setting_key = 'outside_dhaka_courier_cost_poisha'),
    (select (setting_value #>> '{}')::bigint from public.business_settings where setting_key = 'packaging_cost_per_order_poisha'),
    (select (setting_value #>> '{}')::integer from public.business_settings where setting_key = 'tax_vat_basis_points');
end
$function$;

revoke all on function public.get_business_order_defaults() from public, anon, service_role;
grant execute on function public.get_business_order_defaults() to authenticated;

create or replace function public.update_business_financial_defaults(
  p_default_courier text,
  p_inside_dhaka_courier_cost_poisha bigint,
  p_outside_dhaka_courier_cost_poisha bigint,
  p_packaging_cost_per_order_poisha bigint,
  p_tax_vat_basis_points integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may change business settings' using errcode = '42501';
  end if;
  if nullif(btrim(p_default_courier), '') is null or char_length(btrim(p_default_courier)) > 120 then
    raise exception 'Default courier is required' using errcode = '22023';
  end if;
  if p_inside_dhaka_courier_cost_poisha is null
     or p_outside_dhaka_courier_cost_poisha is null
     or p_packaging_cost_per_order_poisha is null
     or p_inside_dhaka_courier_cost_poisha < 0
     or p_outside_dhaka_courier_cost_poisha < 0
     or p_packaging_cost_per_order_poisha < 0
     or p_inside_dhaka_courier_cost_poisha > 100000000
     or p_outside_dhaka_courier_cost_poisha > 100000000
     or p_packaging_cost_per_order_poisha > 100000000 then
    raise exception 'Financial defaults must be non-negative and within the supported range'
      using errcode = '22023';
  end if;
  if p_tax_vat_basis_points is null
     or p_tax_vat_basis_points < 0
     or p_tax_vat_basis_points > 10000 then
    raise exception 'Tax or VAT must be between 0 and 100 percent' using errcode = '22023';
  end if;

  insert into public.business_settings (
    setting_key, setting_value, description, updated_by
  )
  values
    ('default_courier', to_jsonb(btrim(p_default_courier)), 'Default courier copied into new manual orders', actor),
    ('inside_dhaka_courier_cost_poisha', to_jsonb(p_inside_dhaka_courier_cost_poisha), 'Default Inside Dhaka courier cost in integer poisha', actor),
    ('outside_dhaka_courier_cost_poisha', to_jsonb(p_outside_dhaka_courier_cost_poisha), 'Default Outside Dhaka courier cost in integer poisha', actor),
    ('packaging_cost_per_order_poisha', to_jsonb(p_packaging_cost_per_order_poisha), 'Default packaging cost per order in integer poisha', actor),
    ('tax_vat_basis_points', to_jsonb(p_tax_vat_basis_points), 'Default tax or VAT percentage in basis points', actor)
  on conflict (setting_key) do update set
    setting_value = excluded.setting_value,
    description = excluded.description,
    updated_by = excluded.updated_by;
end
$function$;

revoke all on function public.update_business_financial_defaults(
  text, bigint, bigint, bigint, integer
) from public, anon, service_role;
grant execute on function public.update_business_financial_defaults(
  text, bigint, bigint, bigint, integer
) to authenticated;
