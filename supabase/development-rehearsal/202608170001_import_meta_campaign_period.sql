-- ALREADY EXECUTED SUCCESSFULLY IN NEXANOTION BUSINESS DASHBOARD DEV.
-- HISTORICAL EVIDENCE ONLY - DO NOT RUN OR RERUN THIS FILE.
-- Never apply to Production.
-- Import Meta campaign activity from:
-- D:/download/Iq-al-Hasan-Campaigns-Aug-3-2026-Aug-16-2026.csv
-- Source SHA-256:
-- 49F8D877EA9E60CB108F6DAFB1794B97C367682E205B1FA08EE37D3710A2C718
--
-- Apply only after independently confirming the linked project is:
-- NexaNotion Business Dashboard Dev
--
-- The export covers 2026-08-03 through 2026-08-16. Its campaign rows are
-- period aggregates, not daily results, so each positive amount is posted on
-- the reporting end date (2026-08-16). Five existing July campaigns have zero
-- activity in this period; their earlier lifetime performance remains intact.
-- The active Waterproof campaign is created without a zero-value spend row.
-- The audited deletion of the BDT 285.60 Eid campaign spend is preserved.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('nexanotion-meta-campaign-import-2026-08-03-2026-08-16'));
lock table public.campaigns in share row exclusive mode;
lock table public.daily_ad_spend in share row exclusive mode;

create temporary table meta_campaign_period_source (
  normalized_key text primary key,
  campaign_name text not null,
  campaign_delivery text not null,
  channel text not null,
  ends_on date,
  budget numeric(12,2),
  spend_amount numeric(12,2) not null,
  results_count bigint,
  result_type text,
  impressions bigint not null,
  reach bigint not null,
  total_messaging_contacts bigint,
  new_messaging_contacts bigint,
  purchases bigint,
  attribution_setting text,
  import_new_campaign boolean not null
) on commit drop;

insert into pg_temp.meta_campaign_period_source (
  normalized_key,
  campaign_name,
  campaign_delivery,
  channel,
  ends_on,
  budget,
  spend_amount,
  results_count,
  result_type,
  impressions,
  reach,
  total_messaging_contacts,
  new_messaging_contacts,
  purchases,
  attribution_setting,
  import_new_campaign
) values
  (
    'nn women bags messenger orders july 2026',
    'NN – Women Bags – Messenger Orders – July 2026',
    'inactive',
    'facebook messenger',
    date '2026-07-21',
    null,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    false
  ),
  (
    'nn men 18 35 gym bags messenger july 2026',
    'NN – Men 18-35 – Gym Bags – Messenger – July 2026',
    'inactive',
    'facebook messenger',
    date '2026-07-17',
    null,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    false
  ),
  (
    'nn hero gym bag whatsapp orders video july 2026',
    'NN – Hero Gym Bag – WhatsApp Orders – Video – July 2026',
    'inactive',
    'whatsapp',
    date '2026-07-21',
    null,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    false
  ),
  (
    'nn hero gym bag messenger carousel july 2026',
    'NN – Hero Gym Bag – Messenger Carousel – July 2026',
    'inactive',
    'facebook messenger',
    date '2026-07-21',
    null,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    false
  ),
  (
    'nn remaining gym bags messenger clearance july 2026',
    'NN – Remaining Gym Bags – Messenger Clearance – July 2026',
    'inactive',
    'facebook messenger',
    date '2026-07-25',
    null,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    false
  ),
  (
    'nn final stock clearance panjabi jubba aug 2026',
    'NN – Final Stock Clearance – Panjabi/Jubba – Aug 2026',
    'inactive',
    'facebook messenger',
    date '2026-08-14',
    1200.00,
    488.28,
    45,
    'Messaging conversations started',
    6349,
    4547,
    45,
    45,
    1,
    '7-day click or 1-day view',
    true
  ),
  (
    'nn gym bag clearance best seller messenger aug 2026',
    'NN – Gym Bag Clearance + Best Seller – Messenger – Aug 2026',
    'inactive',
    'facebook messenger',
    date '2026-08-16',
    1000.00,
    67.32,
    9,
    'Messaging conversations started',
    974,
    819,
    9,
    9,
    1,
    '7-day click or 1-day view',
    true
  ),
  (
    'nn premium gym bag messenger carousel aug 2026',
    'NN – Premium Gym Bag – Messenger Carousel – Aug 2026',
    'inactive',
    'facebook messenger',
    date '2026-08-17',
    1000.00,
    312.57,
    35,
    'Messaging conversations started',
    4752,
    3318,
    36,
    32,
    4,
    '7-day click or 1-day view',
    true
  ),
  (
    'nn hero gym bag messenger carousel aug 2026 relaunch',
    'NN – Hero Gym Bag – Messenger Carousel – Aug 2026 – Relaunch',
    'inactive',
    'facebook messenger',
    date '2026-08-18',
    null,
    621.97,
    92,
    'Messaging conversations started',
    11607,
    8698,
    92,
    91,
    1,
    '7-day click or 1-day view',
    true
  ),
  (
    'nn waterproof gym bags messages aug 2026',
    'NN | Waterproof Gym Bags | Messages | Aug 2026',
    'active',
    'facebook messenger',
    date '2026-08-21',
    2000.00,
    0.00,
    null,
    null,
    0,
    0,
    null,
    null,
    null,
    '7-day click or 1-day view',
    true
  );

create temporary table meta_import_actor (
  user_id uuid primary key
) on commit drop;

insert into pg_temp.meta_import_actor (user_id)
select distinct campaign.created_by
from public.campaigns as campaign
where trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) =
      'nn hero gym bag messenger carousel july 2026'
  and campaign.created_by is not null;

create temporary table legacy_campaign_before on commit drop as
select
  campaign.id,
  campaign.name,
  campaign.results_count,
  campaign.result_type,
  campaign.impressions,
  campaign.reach,
  campaign.total_messaging_contacts,
  campaign.new_messaging_contacts,
  campaign.purchases,
  campaign.attribution_setting,
  campaign.performance_source_reference,
  campaign.performance_updated_at
from public.campaigns as campaign
join pg_temp.meta_campaign_period_source as source
  on source.normalized_key =
     trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
where not source.import_new_campaign;

do $preflight$
declare
  existing_new_campaign_count integer;
begin
  if (select count(*) from pg_temp.meta_campaign_period_source) <> 10
     or (select count(*) from pg_temp.meta_campaign_period_source where import_new_campaign) <> 5
     or (select count(*) from pg_temp.meta_campaign_period_source where spend_amount > 0) <> 4
     or (select sum(spend_amount) from pg_temp.meta_campaign_period_source) <> 1490.14
     or (select sum(impressions) from pg_temp.meta_campaign_period_source) <> 23682
     or (select sum(reach) from pg_temp.meta_campaign_period_source) <> 17382
     or (select sum(results_count) from pg_temp.meta_campaign_period_source) <> 181
     or (select sum(total_messaging_contacts) from pg_temp.meta_campaign_period_source) <> 182
     or (select sum(new_messaging_contacts) from pg_temp.meta_campaign_period_source) <> 177
     or (select sum(purchases) from pg_temp.meta_campaign_period_source) <> 7 then
    raise exception 'Import stopped: source row or metric totals do not match the approved CSV.';
  end if;

  if (select count(*) from pg_temp.meta_import_actor) <> 1 then
    raise exception 'Import stopped: the existing campaign owner could not be identified uniquely.';
  end if;

  if (select count(*) from legacy_campaign_before) <> 5 then
    raise exception 'Import stopped: the five zero-activity July campaigns were not found uniquely.';
  end if;

  select count(*)::integer
  into existing_new_campaign_count
  from public.campaigns as campaign
  join pg_temp.meta_campaign_period_source as source
    on source.normalized_key =
       trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
  where source.import_new_campaign;

  if existing_new_campaign_count <> 0 then
    raise exception 'Import stopped: at least one August target campaign already exists.';
  end if;

  if (select count(*) from public.campaigns) <> 6
     or (select count(*) from public.daily_ad_spend) <> 6
     or (select coalesce(sum(amount), 0) from public.daily_ad_spend) <> 3112.65 then
    raise exception 'Import stopped: the approved Development marketing baseline changed.';
  end if;

  if (select count(*)
      from public.audit_history
      where table_name = 'daily_ad_spend'
        and action = 'DELETE'
        and old_values->>'amount' = '285.60'
        and old_values->>'source_reference' =
            'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38') <> 1 then
    raise exception 'Import stopped: the audited BDT 285.60 Eid spend deletion was not found uniquely.';
  end if;

  if exists (
    select 1
    from public.daily_ad_spend
    where source_reference =
          'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E'
  ) then
    raise exception 'Import stopped: the source reference has already been used.';
  end if;
end
$preflight$;

insert into public.campaigns (
  name,
  channel,
  starts_on,
  ends_on,
  budget,
  is_active,
  results_count,
  result_type,
  impressions,
  reach,
  total_messaging_contacts,
  new_messaging_contacts,
  purchases,
  attribution_setting,
  performance_source_reference,
  performance_updated_at,
  created_by,
  updated_by
)
select
  source.campaign_name,
  source.channel,
  null,
  source.ends_on,
  source.budget,
  source.campaign_delivery = 'active',
  source.results_count,
  source.result_type,
  source.impressions,
  source.reach,
  source.total_messaging_contacts,
  source.new_messaging_contacts,
  source.purchases,
  source.attribution_setting,
  'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E',
  now(),
  actor.user_id,
  actor.user_id
from pg_temp.meta_campaign_period_source as source
cross join pg_temp.meta_import_actor as actor
where source.import_new_campaign;

insert into public.daily_ad_spend (
  campaign_id,
  spend_date,
  platform,
  amount,
  source_reference,
  created_by,
  updated_by
)
select
  campaign.id,
  date '2026-08-16',
  'Meta',
  source.spend_amount,
  'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E',
  actor.user_id,
  actor.user_id
from pg_temp.meta_campaign_period_source as source
join public.campaigns as campaign
  on source.normalized_key =
     trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
cross join pg_temp.meta_import_actor as actor
where source.import_new_campaign
  and source.spend_amount > 0;

do $post_import$
begin
  if (select count(*)
      from public.campaigns as campaign
      join pg_temp.meta_campaign_period_source as source
        on source.normalized_key =
           trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
      where source.import_new_campaign) <> 5 then
    raise exception 'Import stopped: five August campaigns were not produced.';
  end if;

  if (select count(*) from public.campaigns) <> 11
     or (select count(*) from public.daily_ad_spend) <> 10
     or (select coalesce(sum(amount), 0) from public.daily_ad_spend) <> 4602.79 then
    raise exception 'Import stopped: final Development marketing totals do not reconcile.';
  end if;

  if (select count(*)
      from public.daily_ad_spend
      where source_reference =
            'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E') <> 4
     or (select coalesce(sum(amount), 0)
         from public.daily_ad_spend
         where source_reference =
               'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E') <> 1490.14 then
    raise exception 'Import stopped: imported spend rows do not reconcile to BDT 1,490.14.';
  end if;

  if exists (
    select 1
    from legacy_campaign_before as before_row
    join public.campaigns as campaign using (id)
    where (campaign.results_count,
           campaign.result_type,
           campaign.impressions,
           campaign.reach,
           campaign.total_messaging_contacts,
           campaign.new_messaging_contacts,
           campaign.purchases,
           campaign.attribution_setting,
           campaign.performance_source_reference,
           campaign.performance_updated_at)
          is distinct from
          (before_row.results_count,
           before_row.result_type,
           before_row.impressions,
           before_row.reach,
           before_row.total_messaging_contacts,
           before_row.new_messaging_contacts,
           before_row.purchases,
           before_row.attribution_setting,
           before_row.performance_source_reference,
           before_row.performance_updated_at)
  ) then
    raise exception 'Import stopped: a July campaign lifetime metric changed.';
  end if;

  if exists (
    select 1
    from pg_temp.meta_campaign_period_source as source
    join public.campaigns as campaign
      on source.normalized_key =
         trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
    where source.import_new_campaign
      and (campaign.channel,
           campaign.ends_on,
           campaign.budget,
           campaign.is_active,
           campaign.results_count,
           campaign.result_type,
           campaign.impressions,
           campaign.reach,
           campaign.total_messaging_contacts,
           campaign.new_messaging_contacts,
           campaign.purchases,
           campaign.attribution_setting)
          is distinct from
          (source.channel,
           source.ends_on,
           source.budget,
           source.campaign_delivery = 'active',
           source.results_count,
           source.result_type,
           source.impressions,
           source.reach,
           source.total_messaging_contacts,
           source.new_messaging_contacts,
           source.purchases,
           source.attribution_setting)
  ) then
    raise exception 'Import stopped: an August campaign metric does not match the source.';
  end if;

  if (select count(*)
      from public.campaigns
      where name = 'NN | Waterproof Gym Bags | Messages | Aug 2026'
        and is_active
        and budget = 2000.00
        and results_count is null
        and total_messaging_contacts is null
        and purchases is null) <> 1
     or exists (
       select 1
       from public.daily_ad_spend as spend
       join public.campaigns as campaign on campaign.id = spend.campaign_id
       where campaign.name = 'NN | Waterproof Gym Bags | Messages | Aug 2026'
         and spend.source_reference =
             'Meta period export 2026-08-17 | 2026-08-03 to 2026-08-16 | SHA256 49F8D877EA9E'
     ) then
    raise exception 'Import stopped: the zero-spend active campaign was not preserved correctly.';
  end if;
end
$post_import$;

commit;
