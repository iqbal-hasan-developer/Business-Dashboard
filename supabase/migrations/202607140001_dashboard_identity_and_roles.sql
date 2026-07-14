create extension if not exists pgcrypto;

do $$ begin
  create type public.dashboard_role as enum ('owner', 'admin', 'data_entry', 'viewer');
exception when duplicate_object then null;
end $$;

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
revoke all on public.dashboard_user_profiles from anon;
grant select, insert, update, delete on public.dashboard_user_profiles to authenticated;

create or replace function public.dashboard_has_any_role(allowed_roles public.dashboard_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dashboard_user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.is_active
      and profile.role = any(allowed_roles)
  );
$$;

revoke all on function public.dashboard_has_any_role(public.dashboard_role[]) from public;
grant execute on function public.dashboard_has_any_role(public.dashboard_role[]) to authenticated;

create or replace function public.dashboard_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$ begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists dashboard_user_profiles_set_updated_at on public.dashboard_user_profiles;
create trigger dashboard_user_profiles_set_updated_at
before update on public.dashboard_user_profiles
for each row execute function public.dashboard_set_updated_at();

