-- ALREADY EXECUTED SUCCESSFULLY IN NEXANOTION BUSINESS DASHBOARD DEV.
-- HISTORICAL EVIDENCE ONLY - DO NOT RUN OR RERUN THIS FILE.
-- Never apply to Production.
-- Explicitly excludes: NN – Final Stock Clearance – Panjabi/Jubba – Aug 2026
begin;
set transaction isolation level serializable;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.campaigns in share row exclusive mode;
select set_config('nexanotion.audit_reason','Backfill Meta performance from approved export and Ads Manager screenshots',true);

create temporary table source_performance(name text primary key,results_count bigint,result_type text,impressions bigint,reach bigint,total_contacts bigint,new_contacts bigint,purchases bigint,attribution text) on commit drop;
insert into source_performance values
('Eid Panjabi Sales - Broad BD - May 2026',null,null,530,333,null,null,null,'7-day click, 1-day view, or 1-day engaged-view'),
('NN – Women Bags – Messenger Orders – July 2026',123,'Messaging conversations started',13248,10492,141,123,5,'7-day click or 1-day view'),
('NN – Men 18-35 – Gym Bags – Messenger – July 2026',345,'Messaging conversations started',35938,21698,384,345,21,'7-day click or 1-day view'),
('NN – Hero Gym Bag – WhatsApp Orders – Video – July 2026',null,null,1241,1134,null,null,null,'7-day click or 1-day view'),
('NN – Hero Gym Bag – Messenger Carousel – July 2026',229,'Messaging conversations started',28593,19719,248,227,11,'7-day click or 1-day view'),
('NN – Remaining Gym Bags – Messenger Clearance – July 2026',42,'Messaging conversations started',3886,2999,48,42,2,'7-day click or 1-day view');

do $guard$ begin
 if (select count(*) from source_performance)<>6 then raise exception 'Expected six approved campaigns'; end if;
 if exists(select 1 from source_performance where lower(name) like '%final stock clearance%') then raise exception 'Excluded campaign entered allowlist'; end if;
 if (select count(*) from public.campaigns c join source_performance s on trim(regexp_replace(lower(c.name), '[^a-z0-9]+', ' ', 'g'))=trim(regexp_replace(lower(s.name), '[^a-z0-9]+', ' ', 'g')))<>6 then raise exception 'Development campaign baseline does not match'; end if;
end $guard$;

update public.campaigns c set results_count=s.results_count,result_type=s.result_type,impressions=s.impressions,reach=s.reach,total_messaging_contacts=s.total_contacts,new_messaging_contacts=s.new_contacts,purchases=s.purchases,attribution_setting=s.attribution,performance_source_reference='Meta export 2026-08-12 | SHA256 5CDADD8E4B38',performance_updated_at=now(),updated_at=now()
from source_performance s where trim(regexp_replace(lower(c.name), '[^a-z0-9]+', ' ', 'g'))=trim(regexp_replace(lower(s.name), '[^a-z0-9]+', ' ', 'g'));

do $verify$ begin
 if (select count(*) from public.campaigns c join source_performance s on trim(regexp_replace(lower(c.name), '[^a-z0-9]+', ' ', 'g'))=trim(regexp_replace(lower(s.name), '[^a-z0-9]+', ' ', 'g')) where c.impressions=s.impressions and c.reach=s.reach)<>6 then raise exception 'Performance backfill did not reconcile'; end if;
 if exists(select 1 from public.campaigns where lower(name) like '%final stock clearance%') then raise exception 'Excluded campaign exists'; end if;
end $verify$;
commit;
