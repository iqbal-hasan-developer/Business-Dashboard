begin;

alter table public.audit_history add column if not exists reason text;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'audit_history_reason_length') then
    alter table public.audit_history add constraint audit_history_reason_length
      check (reason is null or char_length(btrim(reason)) between 3 and 500);
  end if;
end
$constraints$;

alter table public.campaigns
  add column if not exists results_count bigint,
  add column if not exists result_type text,
  add column if not exists impressions bigint,
  add column if not exists reach bigint,
  add column if not exists total_messaging_contacts bigint,
  add column if not exists new_messaging_contacts bigint,
  add column if not exists purchases bigint,
  add column if not exists attribution_setting text,
  add column if not exists performance_source_reference text,
  add column if not exists performance_updated_at timestamptz;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_performance_nonnegative') then
    alter table public.campaigns add constraint campaigns_performance_nonnegative check (
      (results_count is null or results_count >= 0) and
      (impressions is null or impressions >= 0) and
      (reach is null or reach >= 0) and
      (total_messaging_contacts is null or total_messaging_contacts >= 0) and
      (new_messaging_contacts is null or new_messaging_contacts >= 0) and
      (purchases is null or purchases >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_performance_relationships') then
    alter table public.campaigns add constraint campaigns_performance_relationships check (
      (reach is null or impressions is null or reach <= impressions) and
      (new_messaging_contacts is null or total_messaging_contacts is null or new_messaging_contacts <= total_messaging_contacts)
    );
  end if;
end
$constraints$;

create or replace function public.dashboard_write_audit_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  raw_old jsonb; raw_new jsonb; safe_old jsonb; safe_new jsonb;
  changed_old jsonb; changed_new jsonb; record_key text; audit_reason text;
begin
  raw_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  raw_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  safe_old := public.dashboard_audit_safe_payload(tg_table_name, raw_old);
  safe_new := public.dashboard_audit_safe_payload(tg_table_name, raw_new);
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(changed.key, safe_old -> changed.key), '{}'::jsonb),
      coalesce(jsonb_object_agg(changed.key, safe_new -> changed.key), '{}'::jsonb)
    into changed_old, changed_new
    from (select key from jsonb_object_keys(coalesce(safe_old, '{}'::jsonb) || coalesce(safe_new, '{}'::jsonb)) keys(key)
      where safe_old -> key is distinct from safe_new -> key) changed;
    if changed_old = '{}'::jsonb and changed_new = '{}'::jsonb then return new; end if;
  else changed_old := safe_old; changed_new := safe_new; end if;
  record_key := coalesce(raw_new ->> 'id', raw_new ->> 'product_id', raw_new ->> 'order_id', raw_new ->> 'setting_key', raw_new ->> 'lookup_key', raw_old ->> 'id', raw_old ->> 'product_id', raw_old ->> 'order_id', raw_old ->> 'setting_key', raw_old ->> 'lookup_key', 'unknown');
  audit_reason := nullif(btrim(current_setting('nexanotion.audit_reason', true)), '');
  insert into public.audit_history(table_name, record_id, action, changed_by, old_values, new_values, reason)
    values (tg_table_name, record_key, tg_op, (select auth.uid()), changed_old, changed_new, audit_reason);
  if tg_op = 'DELETE' then return old; end if; return new;
end
$function$;

revoke all on function public.dashboard_write_audit_history() from public, anon, authenticated, service_role;

create or replace function public.edit_dashboard_ad_spend(
  p_spend_id uuid, p_campaign_id uuid, p_spend_date date, p_platform text,
  p_amount numeric, p_source_reference text, p_reason text, p_expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare current_row public.daily_ad_spend%rowtype;
begin
  if not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_spend_date is null or p_campaign_id is null or char_length(btrim(coalesce(p_platform,''))) not between 2 and 100 then raise exception 'Campaign, date, and platform are required'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> trunc(p_amount, 2) then raise exception 'Amount must be positive with at most two decimals'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Reason must be 3 to 500 characters'; end if;
  if char_length(coalesce(p_source_reference,'')) > 160 then raise exception 'Source reference is too long'; end if;
  if not exists (select 1 from public.campaigns where id=p_campaign_id) then raise exception 'Campaign does not exist'; end if;
  select * into current_row from public.daily_ad_spend where id=p_spend_id for update;
  if not found then raise exception 'Spend entry not found' using errcode='P0002'; end if;
  if current_row.updated_at is distinct from p_expected_updated_at then raise exception 'Spend entry changed; refresh and try again' using errcode='40001'; end if;
  perform set_config('nexanotion.audit_reason', btrim(p_reason), true);
  update public.daily_ad_spend set campaign_id=p_campaign_id, spend_date=p_spend_date,
    platform=btrim(p_platform), amount=p_amount, source_reference=nullif(btrim(p_source_reference),''), updated_by=(select auth.uid()) where id=p_spend_id;
  return p_spend_id;
end $function$;

create or replace function public.delete_dashboard_ad_spend(p_spend_id uuid, p_reason text, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare current_row public.daily_ad_spend%rowtype;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then raise exception 'Only the owner may delete spend' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Reason must be 3 to 500 characters'; end if;
  select * into current_row from public.daily_ad_spend where id=p_spend_id for update;
  if not found then raise exception 'Spend entry not found' using errcode='P0002'; end if;
  if current_row.updated_at is distinct from p_expected_updated_at then raise exception 'Spend entry changed; refresh and try again' using errcode='40001'; end if;
  perform set_config('nexanotion.audit_reason', btrim(p_reason), true);
  delete from public.daily_ad_spend where id=p_spend_id;
  return p_spend_id;
end $function$;

create or replace function public.update_dashboard_campaign_performance(
  p_campaign_id uuid, p_results_count bigint, p_result_type text, p_impressions bigint, p_reach bigint,
  p_total_messaging_contacts bigint, p_new_messaging_contacts bigint, p_purchases bigint,
  p_attribution_setting text, p_source_reference text, p_reason text, p_expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $function$
declare current_row public.campaigns%rowtype;
begin
  if not public.dashboard_has_any_role(array['owner','admin']::public.dashboard_role[]) then raise exception 'Not authorized' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Reason must be 3 to 500 characters'; end if;
  if coalesce(p_results_count,0)<0 or coalesce(p_impressions,0)<0 or coalesce(p_reach,0)<0 or coalesce(p_total_messaging_contacts,0)<0 or coalesce(p_new_messaging_contacts,0)<0 or coalesce(p_purchases,0)<0 then raise exception 'Performance counts cannot be negative'; end if;
  if p_reach is not null and p_impressions is not null and p_reach>p_impressions then raise exception 'Reach cannot exceed impressions'; end if;
  if p_new_messaging_contacts is not null and p_total_messaging_contacts is not null and p_new_messaging_contacts>p_total_messaging_contacts then raise exception 'New contacts cannot exceed total contacts'; end if;
  if char_length(coalesce(p_result_type,''))>160 or char_length(coalesce(p_attribution_setting,''))>160 or char_length(coalesce(p_source_reference,''))>200 then raise exception 'Performance reference is too long'; end if;
  select * into current_row from public.campaigns where id=p_campaign_id for update;
  if not found then raise exception 'Campaign not found' using errcode='P0002'; end if;
  if current_row.updated_at is distinct from p_expected_updated_at then raise exception 'Campaign changed; refresh and try again' using errcode='40001'; end if;
  perform set_config('nexanotion.audit_reason', btrim(p_reason), true);
  update public.campaigns set results_count=p_results_count, result_type=nullif(btrim(p_result_type),''), impressions=p_impressions,
    reach=p_reach, total_messaging_contacts=p_total_messaging_contacts, new_messaging_contacts=p_new_messaging_contacts,
    purchases=p_purchases, attribution_setting=nullif(btrim(p_attribution_setting),''), performance_source_reference=nullif(btrim(p_source_reference),''),
    performance_updated_at=now(), updated_by=(select auth.uid()) where id=p_campaign_id;
  return p_campaign_id;
end $function$;

revoke all on function public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz), public.delete_dashboard_ad_spend(uuid,text,timestamptz), public.update_dashboard_campaign_performance(uuid,bigint,text,bigint,bigint,bigint,bigint,bigint,text,text,text,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz), public.delete_dashboard_ad_spend(uuid,text,timestamptz), public.update_dashboard_campaign_performance(uuid,bigint,text,bigint,bigint,bigint,bigint,bigint,text,text,text,timestamptz) to authenticated;

commit;
