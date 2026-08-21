-- ALREADY EXECUTED SUCCESSFULLY IN NEXANOTION BUSINESS DASHBOARD DEV.
-- HISTORICAL EVIDENCE ONLY - DO NOT RUN OR RERUN THIS FILE.
-- One-time, development-only import of Meta campaign totals from:
-- D:/download/Iq-al-Hasan-Campaigns-Jul-12-2023-Aug-11-2026.csv
-- Source SHA-256:
-- 5CDADD8E4B3805D1356679015FC9E5CF8D2EC2293C2A7DCBB1CDB6B27FA3046D
--
-- Apply only to the linked project verified externally as:
-- NexaNotion Business Dashboard Dev
--
-- The source is campaign-level, not daily. Each aggregate spend is posted on
-- the campaign-specific Ends date. Existing spend is reconciled by inserting
-- only the positive difference needed to reach the source total.
--
-- Explicitly excluded at the owner's direction:
-- NN – Final Stock Clearance – Panjabi/Jubba – Aug 2026

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.campaigns in share row exclusive mode;
lock table public.daily_ad_spend in share row exclusive mode;

create temporary table meta_campaign_import (
  normalized_key text primary key,
  campaign_name text not null,
  channel text not null,
  ends_on date not null,
  target_spend numeric(12,2) not null,
  source_reference text not null
) on commit drop;

insert into pg_temp.meta_campaign_import (
  normalized_key,
  campaign_name,
  channel,
  ends_on,
  target_spend,
  source_reference
) values
  (
    'eid panjabi sales broad bd may 2026',
    'Eid Panjabi Sales - Broad BD - May 2026',
    'facebook',
    date '2026-07-11',
    285.60,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  ),
  (
    'nn women bags messenger orders july 2026',
    'NN – Women Bags – Messenger Orders – July 2026',
    'facebook messenger',
    date '2026-07-21',
    380.97,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  ),
  (
    'nn men 18 35 gym bags messenger july 2026',
    'NN – Men 18-35 – Gym Bags – Messenger – July 2026',
    'facebook messenger',
    date '2026-07-17',
    1297.91,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  ),
  (
    'nn hero gym bag whatsapp orders video july 2026',
    'NN – Hero Gym Bag – WhatsApp Orders – Video – July 2026',
    'whatsapp',
    date '2026-07-21',
    60.61,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  ),
  (
    'nn hero gym bag messenger carousel july 2026',
    'NN – Hero Gym Bag – Messenger Carousel – July 2026',
    'facebook messenger',
    date '2026-07-21',
    1193.66,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  ),
  (
    'nn remaining gym bags messenger clearance july 2026',
    'NN – Remaining Gym Bags – Messenger Clearance – July 2026',
    'facebook messenger',
    date '2026-07-25',
    179.50,
    'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38'
  );

create temporary table meta_import_actor (
  user_id uuid primary key
) on commit drop;

insert into pg_temp.meta_import_actor (user_id)
select distinct created_by
from public.campaigns
where trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) =
      'nn hero gym bag messenger carousel july 2026'
  and created_by is not null;

do $preflight$
declare
  existing_target_count integer;
  existing_spend numeric(12,2);
begin
  if (select count(*) from pg_temp.meta_campaign_import) <> 6
     or (select count(distinct normalized_key) from pg_temp.meta_campaign_import) <> 6
     or (select sum(target_spend) from pg_temp.meta_campaign_import) <> 3398.25 then
    raise exception 'Import stopped: six-row/BDT 3,398.25 source guard failed.';
  end if;

  if exists (
    select 1
    from pg_temp.meta_campaign_import
    where normalized_key = 'nn final stock clearance panjabi jubba aug 2026'
  ) then
    raise exception 'Import stopped: excluded Panjabi/Jubba campaign entered the source allowlist.';
  end if;

  if (select count(*) from pg_temp.meta_import_actor) <> 1 then
    raise exception 'Import stopped: the existing campaign owner could not be identified uniquely.';
  end if;

  if (select count(*) from public.campaigns) <> 1
     or (select count(*) from public.daily_ad_spend) <> 1
     or (select sum(amount) from public.daily_ad_spend) <> 354.20 then
    raise exception 'Import stopped: Development campaign/spend baseline changed.';
  end if;

  if exists (
    select 1
    from public.campaigns
    where trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) =
          'nn final stock clearance panjabi jubba aug 2026'
  ) then
    raise exception 'Import stopped: excluded Panjabi/Jubba campaign already exists.';
  end if;

  select count(*)::integer
  into existing_target_count
  from public.campaigns campaign
  join pg_temp.meta_campaign_import source
    on source.normalized_key =
       trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'));

  if existing_target_count <> 1 then
    raise exception 'Import stopped: expected exactly one existing target campaign.';
  end if;

  select coalesce(sum(spend.amount), 0)::numeric(12,2)
  into existing_spend
  from public.campaigns campaign
  left join public.daily_ad_spend spend on spend.campaign_id = campaign.id
  where trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) =
        'nn hero gym bag messenger carousel july 2026';

  if existing_spend <> 354.20 then
    raise exception 'Import stopped: existing Hero Messenger spend is not BDT 354.20.';
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
  created_by,
  updated_by
)
select
  source.campaign_name,
  source.channel,
  null,
  source.ends_on,
  null,
  false,
  actor.user_id,
  actor.user_id
from pg_temp.meta_campaign_import source
cross join pg_temp.meta_import_actor actor
where not exists (
  select 1
  from public.campaigns campaign
  where trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) =
        source.normalized_key
);

update public.campaigns campaign
set
  channel = coalesce(campaign.channel, source.channel),
  ends_on = source.ends_on,
  is_active = false,
  updated_by = actor.user_id,
  updated_at = now()
from pg_temp.meta_campaign_import source
cross join pg_temp.meta_import_actor actor
where trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) =
      source.normalized_key;

with current_totals as (
  select
    campaign.id as campaign_id,
    source.ends_on,
    source.target_spend,
    source.source_reference,
    coalesce(sum(spend.amount), 0)::numeric(12,2) as current_spend
  from pg_temp.meta_campaign_import source
  join public.campaigns campaign
    on trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g')) =
       source.normalized_key
  left join public.daily_ad_spend spend on spend.campaign_id = campaign.id
  group by campaign.id, source.ends_on, source.target_spend, source.source_reference
)
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
  total.campaign_id,
  total.ends_on,
  'Meta',
  total.target_spend - total.current_spend,
  total.source_reference,
  actor.user_id,
  actor.user_id
from current_totals total
cross join pg_temp.meta_import_actor actor
where total.current_spend < total.target_spend;

do $post_import$
begin
  if (select count(*)
      from public.campaigns campaign
      join pg_temp.meta_campaign_import source
        on source.normalized_key =
           trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))) <> 6 then
    raise exception 'Import stopped: six target campaigns were not produced.';
  end if;

  if exists (
    select 1
    from pg_temp.meta_campaign_import source
    join public.campaigns campaign
      on source.normalized_key =
         trim(regexp_replace(lower(campaign.name), '[^a-z0-9]+', ' ', 'g'))
    left join public.daily_ad_spend spend on spend.campaign_id = campaign.id
    group by source.normalized_key, source.target_spend
    having coalesce(sum(spend.amount), 0) <> source.target_spend
  ) then
    raise exception 'Import stopped: a campaign spend total did not reconcile.';
  end if;

  if (select count(*) from public.campaigns) <> 6
     or (select count(*) from public.daily_ad_spend) <> 7
     or (select sum(amount) from public.daily_ad_spend) <> 3398.25 then
    raise exception 'Import stopped: final Development totals did not reconcile.';
  end if;

  if (select count(*) from public.daily_ad_spend
      where source_reference = 'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38') <> 6
     or (select sum(amount) from public.daily_ad_spend
         where source_reference = 'Meta campaign total export 2026-08-12 | SHA256 5CDADD8E4B38') <> 3044.05 then
    raise exception 'Import stopped: inserted-row count or delta total did not reconcile.';
  end if;

  if exists (
    select 1
    from public.campaigns
    where trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) =
          'nn final stock clearance panjabi jubba aug 2026'
  ) then
    raise exception 'Import stopped: excluded Panjabi/Jubba campaign was inserted.';
  end if;
end
$post_import$;

commit;
