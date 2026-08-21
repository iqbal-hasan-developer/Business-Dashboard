begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  campaign_id uuid;
  spend_id uuid;
  spend_updated_at timestamptz;
  deleted_id uuid;
begin
  select user_id into actor_id
  from public.dashboard_user_profiles
  where role = 'owner' and is_active
  order by created_at
  limit 1;

  select id into campaign_id from public.campaigns order by created_at limit 1;
  if actor_id is null or campaign_id is null then
    raise exception 'Runtime test requires one active owner and campaign.';
  end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.daily_ad_spend(campaign_id, spend_date, platform, amount, source_reference, created_by, updated_by)
  values (campaign_id, current_date, 'Runtime test', 1.00, 'rollback-only-marketing-delete-test', actor_id, actor_id)
  returning id, updated_at into spend_id, spend_updated_at;

  deleted_id := public.delete_dashboard_ad_spend(spend_id, 'Rollback-only deletion contract test', spend_updated_at);
  if deleted_id is distinct from spend_id or exists (select 1 from public.daily_ad_spend where id = spend_id) then
    raise exception 'Owner deletion RPC did not remove the temporary spend.';
  end if;
  if not exists (
    select 1 from public.audit_history
    where table_name = 'daily_ad_spend' and record_id = spend_id::text and action = 'DELETE'
      and reason = 'Rollback-only deletion contract test'
  ) then
    raise exception 'Owner deletion RPC did not preserve the deletion audit reason.';
  end if;
end
$test$;

select 'owner delete and audit runtime contract passed' as result;
rollback;
