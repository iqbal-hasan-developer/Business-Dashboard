-- Read-only verification for the one-time 2026-08-03 to 2026-08-16 Meta import.
-- Run only against NexaNotion Business Dashboard Dev after the import succeeds.

with source_targets (
  normalized_key,
  campaign_name,
  expected_spend,
  expected_results,
  expected_impressions,
  expected_reach,
  expected_total_contacts,
  expected_new_contacts,
  expected_purchases,
  expected_active
) as (
  values
    ('nn final stock clearance panjabi jubba aug 2026'::text, 'NN – Final Stock Clearance – Panjabi/Jubba – Aug 2026'::text, 488.28::numeric, 45::bigint, 6349::bigint, 4547::bigint, 45::bigint, 45::bigint, 1::bigint, false),
    ('nn gym bag clearance best seller messenger aug 2026', 'NN – Gym Bag Clearance + Best Seller – Messenger – Aug 2026', 67.32, 9, 974, 819, 9, 9, 1, false),
    ('nn premium gym bag messenger carousel aug 2026', 'NN – Premium Gym Bag – Messenger Carousel – Aug 2026', 312.57, 35, 4752, 3318, 36, 32, 4, false),
    ('nn hero gym bag messenger carousel aug 2026 relaunch', 'NN – Hero Gym Bag – Messenger Carousel – Aug 2026 – Relaunch', 621.97, 92, 11607, 8698, 92, 91, 1, false),
    ('nn waterproof gym bags messages aug 2026', 'NN | Waterproof Gym Bags | Messages | Aug 2026', 0.00, null, 0, 0, null, null, null, true)
), actual as (
  select
    trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) as normalized_key,
    campaign.name as campaign_name,
    campaign.results_count,
    campaign.impressions,
    campaign.reach,
    campaign.total_messaging_contacts,
    campaign.new_messaging_contacts,
    campaign.purchases,
    campaign.is_active,
    coalesce(sum(spend.amount) filter (
      where spend.source_reference =
            'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E'
    ), 0)::numeric(12,2) as imported_spend
  from public.campaigns as campaign
  left join public.daily_ad_spend as spend on spend.campaign_id = campaign.id
  group by campaign.id
), comparison as (
  select
    source.campaign_name,
    source.expected_spend,
    actual.imported_spend,
    source.expected_results,
    actual.results_count,
    source.expected_impressions,
    actual.impressions,
    source.expected_reach,
    actual.reach,
    source.expected_total_contacts,
    actual.total_messaging_contacts,
    source.expected_new_contacts,
    actual.new_messaging_contacts,
    source.expected_purchases,
    actual.purchases,
    source.expected_active,
    actual.is_active,
    actual.normalized_key is not null
      and actual.campaign_name = source.campaign_name
      and actual.imported_spend = source.expected_spend
      and actual.results_count is not distinct from source.expected_results
      and actual.impressions = source.expected_impressions
      and actual.reach = source.expected_reach
      and actual.total_messaging_contacts is not distinct from source.expected_total_contacts
      and actual.new_messaging_contacts is not distinct from source.expected_new_contacts
      and actual.purchases is not distinct from source.expected_purchases
      and actual.is_active = source.expected_active as reconciled
  from source_targets as source
  left join actual using (normalized_key)
)
select *
from comparison
order by campaign_name;

with legacy_zero_activity_campaigns (normalized_key) as (
  values
    ('nn women bags messenger orders july 2026'::text),
    ('nn men 18 35 gym bags messenger july 2026'),
    ('nn hero gym bag whatsapp orders video july 2026'),
    ('nn hero gym bag messenger carousel july 2026'),
    ('nn remaining gym bags messenger clearance july 2026')
)
select
  (select count(*)::bigint from public.campaigns) as campaign_count,
  (select count(*)::bigint from public.daily_ad_spend) as spend_row_count,
  (select coalesce(sum(amount), 0)::numeric(12,2) from public.daily_ad_spend) as spend_total_bdt,
  (select count(*)::bigint
   from public.campaigns as campaign
   join legacy_zero_activity_campaigns as source
     on source.normalized_key =
        trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))) as preserved_legacy_campaigns,
  (select count(*)::bigint
   from public.daily_ad_spend
   where source_reference =
         'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E') as imported_spend_rows,
  (select coalesce(sum(amount), 0)::numeric(12,2)
   from public.daily_ad_spend
   where source_reference =
         'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E') as imported_spend_bdt,
  (select count(*)::bigint
   from public.campaigns
   where performance_source_reference =
         'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E') as imported_campaigns;
