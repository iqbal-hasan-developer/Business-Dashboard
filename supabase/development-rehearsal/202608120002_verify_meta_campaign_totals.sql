-- Read-only verification for the one-time Meta campaign-total import.
-- Run only against NexaNotion Business Dashboard Dev.

with source_targets (normalized_key, target_spend) as (
  values
    ('eid panjabi sales broad bd may 2026'::text, 285.60::numeric),
    ('nn women bags messenger orders july 2026', 380.97),
    ('nn men 18 35 gym bags messenger july 2026', 1297.91),
    ('nn hero gym bag whatsapp orders video july 2026', 60.61),
    ('nn hero gym bag messenger carousel july 2026', 1193.66),
    ('nn remaining gym bags messenger clearance july 2026', 179.50)
), campaign_totals as (
  select
    trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) as normalized_key,
    count(spend.id)::bigint as spend_rows,
    coalesce(sum(spend.amount), 0)::numeric(12,2) as spend_total
  from public.campaigns campaign
  left join public.daily_ad_spend spend on spend.campaign_id = campaign.id
  group by campaign.id, campaign.name
), comparison as (
  select
    source.normalized_key,
    source.target_spend,
    totals.spend_rows,
    totals.spend_total,
    totals.spend_total = source.target_spend as reconciled
  from source_targets source
  left join campaign_totals totals using (normalized_key)
)
select
  (select count(*)::bigint from public.campaigns) as campaign_count,
  (select count(*)::bigint from public.daily_ad_spend) as spend_row_count,
  (select coalesce(sum(amount), 0)::numeric(12,2) from public.daily_ad_spend) as spend_total_bdt,
  (select count(*)::bigint from comparison where reconciled) as reconciled_campaigns,
  (select count(*)::bigint from comparison where not coalesce(reconciled, false)) as unreconciled_campaigns,
  (select count(*)::bigint
   from public.campaigns
   where trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) =
         'nn final stock clearance panjabi jubba aug 2026') as excluded_campaign_count,
  (select count(*)::bigint
   from public.daily_ad_spend
   where source_reference =
         'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38') as imported_spend_rows,
  (select coalesce(sum(amount), 0)::numeric(12,2)
   from public.daily_ad_spend
   where source_reference =
         'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38') as imported_delta_bdt;
