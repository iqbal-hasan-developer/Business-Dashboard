begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_column('public','audit_history','reason','audit reasons are stored');
select has_column('public','campaigns','results_count','campaign results are stored');
select has_column('public','campaigns','impressions','campaign impressions are stored');
select has_column('public','campaigns','purchases','campaign purchases are stored');
select has_function('public','edit_dashboard_ad_spend',array['uuid','uuid','date','text','numeric','text','text','timestamp with time zone'],'audited spend edit RPC exists');
select has_function('public','delete_dashboard_ad_spend',array['uuid','text','timestamp with time zone'],'audited spend delete RPC exists');
select has_function('public','update_dashboard_campaign_performance',array['uuid','bigint','text','bigint','bigint','bigint','bigint','bigint','text','text','text','timestamp with time zone'],'audited campaign performance RPC exists');
select ok(has_function_privilege('authenticated','public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)','EXECUTE') and not has_function_privilege('anon','public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)','EXECUTE') and not has_function_privilege('service_role','public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)','EXECUTE'),'spend edit is authenticated-dashboard-only');
select ok(pg_get_functiondef('public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)'::regprocedure) ~* 'for update' and pg_get_functiondef('public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)'::regprocedure) ~* 'expected_updated_at','spend edit locks and checks freshness');
select ok(pg_get_functiondef('public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)'::regprocedure) ~* 'trunc\(p_amount, 2\)' and pg_get_functiondef('public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]','spend edit preserves exact decimal money');
select ok(pg_get_functiondef('public.delete_dashboard_ad_spend(uuid,text,timestamptz)'::regprocedure) ~* 'array\[''owner''\]' and pg_get_functiondef('public.delete_dashboard_ad_spend(uuid,text,timestamptz)'::regprocedure) ~* 'audit_reason','spend deletion is owner-only and requires audit context');
select ok(pg_get_functiondef('public.update_dashboard_campaign_performance(uuid,bigint,text,bigint,bigint,bigint,bigint,bigint,text,text,text,timestamptz)'::regprocedure) ~* 'reach cannot exceed impressions','performance relationships are defended in the RPC');
select ok(pg_get_functiondef('public.dashboard_write_audit_history()'::regprocedure) ~* 'nexanotion.audit_reason' and pg_get_functiondef('public.dashboard_write_audit_history()'::regprocedure) ~* 'reason','audit trigger captures the supplied reason');
select ok(pg_get_functiondef('public.edit_dashboard_ad_spend(uuid,uuid,date,text,numeric,text,text,timestamptz)'::regprocedure) !~* 'update[[:space:]]+public[.](orders|products|order_financial_snapshots)','marketing edits cannot mutate orders, inventory, or recognition');

select * from finish();
rollback;
