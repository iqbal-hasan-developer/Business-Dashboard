-- Read-only verification after the approved Development backfill.
select c.name,c.results_count,c.impressions,c.reach,c.total_messaging_contacts,c.new_messaging_contacts,c.purchases,c.attribution_setting,c.performance_source_reference
from public.campaigns c
where c.performance_source_reference='Meta export 2026-08-12 | SHA256 5CDADD8E4B38'
order by c.name;

select count(*) as approved_campaign_count,
  count(*) filter(where impressions is not null) as campaigns_with_impressions,
  count(*) filter(where lower(name) like '%final stock clearance%') as excluded_campaign_count
from public.campaigns
where performance_source_reference='Meta export 2026-08-12 | SHA256 5CDADD8E4B38'
   or lower(name) like '%final stock clearance%';
