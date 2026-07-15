create extension if not exists pgcrypto;

-- Supabase grants broad defaults in public by design. The dashboard migration
-- role resets its own defaults before creating private objects. Every required
-- table/function privilege is granted explicitly later in the chain.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Preserve the production-verified stock ACL and prevent later chain changes
-- from reopening the SECURITY DEFINER function.
revoke execute on function public.decrement_product_stock(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.decrement_product_stock(uuid, integer)
  to service_role;

-- The shared timestamp function remains SECURITY INVOKER. A pg_catalog-only
-- search path preserves its trigger behavior while removing unnecessary API
-- execution grants.
alter function public.set_updated_at() set search_path = pg_catalog;
revoke execute on function public.set_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

do $dashboard_role_type$
begin
  create type public.dashboard_role as enum (
    'owner', 'admin', 'data_entry', 'viewer'
  );
exception when duplicate_object then null;
end
$dashboard_role_type$;

create table if not exists public.dashboard_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.dashboard_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_user_profiles enable row level security;

create or replace function public.dashboard_current_role()
returns public.dashboard_role
language sql
stable
security definer
set search_path = ''
as $function$
  select profile.role
  from public.dashboard_user_profiles as profile
  where profile.user_id = (select auth.uid())
    and profile.is_active
  limit 1;
$function$;

revoke all on function public.dashboard_current_role()
  from public, anon;
grant execute on function public.dashboard_current_role()
  to authenticated;

create or replace function public.dashboard_has_any_role(
  allowed_roles public.dashboard_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(public.dashboard_current_role() = any(allowed_roles), false);
$function$;

revoke all on function public.dashboard_has_any_role(public.dashboard_role[])
  from public, anon;
grant execute on function public.dashboard_has_any_role(public.dashboard_role[])
  to authenticated;

create or replace function public.dashboard_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

revoke all on function public.dashboard_set_updated_at()
  from public, anon;
grant execute on function public.dashboard_set_updated_at()
  to authenticated, service_role;

drop trigger if exists dashboard_user_profiles_set_updated_at
  on public.dashboard_user_profiles;
create trigger dashboard_user_profiles_set_updated_at
before update on public.dashboard_user_profiles
for each row execute function public.dashboard_set_updated_at();
