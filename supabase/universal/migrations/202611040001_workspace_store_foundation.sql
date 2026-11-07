-- Fresh-install track for the universal product. Kept out of the legacy chain.
-- This migration creates ownership primitives; application routes do not use
-- these tables until workspace-aware authorization is implemented.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_memberships_user_active_idx
  on public.workspace_memberships (user_id, workspace_id)
  where is_active;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  platform text not null check (platform in ('woocommerce', 'shopify', 'custom')),
  base_url text not null check (
    length(btrim(base_url)) between 9 and 2048
    and base_url ~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$'
  ),
  external_store_id text,
  connection_status text not null default 'disconnected'
    check (connection_status in ('disconnected', 'connected', 'error')),
  is_active boolean not null default true,
  platform_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(platform_metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, platform, external_store_id)
);

create or replace function public.prevent_store_workspace_transfer()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.workspace_id <> old.workspace_id or new.created_by <> old.created_by then
    raise exception 'Store workspace ownership cannot be changed.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger stores_keep_workspace_ownership
before update on public.stores
for each row execute function public.prevent_store_workspace_transfer();

create index stores_workspace_status_idx
  on public.stores (workspace_id, connection_status, created_at desc);

create or replace function public.prevent_removing_last_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  removes_owner boolean := false;
  remaining_owners integer;
begin
  if old.role = 'owner' and old.is_active then
    if tg_op = 'DELETE' then
      removes_owner := true;
    else
      removes_owner := new.role <> 'owner' or not new.is_active;
    end if;
  end if;

  if removes_owner then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(old.workspace_id::text, 0)
    );

    select count(*)::integer
    into remaining_owners
    from public.workspace_memberships as membership
    where membership.workspace_id = old.workspace_id
      and membership.user_id <> old.user_id
      and membership.role = 'owner'
      and membership.is_active;

    if remaining_owners = 0 then
      raise exception 'A workspace must retain at least one active owner.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.prevent_removing_last_workspace_owner()
  from public, anon, authenticated, service_role;

create trigger workspace_memberships_keep_owner
before update or delete on public.workspace_memberships
for each row execute function public.prevent_removing_last_workspace_owner();

create or replace function public.current_workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select membership.role
  from public.workspace_memberships as membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = (select auth.uid())
    and membership.is_active
  limit 1;
$function$;

revoke all on function public.current_workspace_role(uuid)
  from public, anon;
grant execute on function public.current_workspace_role(uuid)
  to authenticated;

create or replace function public.create_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  workspace_id uuid;
  clean_name text := btrim(coalesce(p_name, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if length(clean_name) not between 1 and 120 then
    raise exception 'Workspace name must contain 1 to 120 characters.' using errcode = '22023';
  end if;

  insert into public.workspaces (name, created_by)
  values (clean_name, actor_id)
  returning id into workspace_id;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (workspace_id, actor_id, 'owner');

  return workspace_id;
end;
$function$;

revoke all on function public.create_workspace(text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_workspace(text)
  to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_memberships force row level security;
alter table public.stores enable row level security;
alter table public.stores force row level security;

revoke all on table public.workspaces, public.workspace_memberships, public.stores
  from public, anon, authenticated;
grant select on table public.workspaces to authenticated;
grant update (name) on table public.workspaces to authenticated;
grant select on table public.workspace_memberships to authenticated;
grant select, insert on table public.stores to authenticated;
grant update (name, is_active) on table public.stores to authenticated;

create policy workspace_members_read_workspace
on public.workspaces for select to authenticated
using (public.current_workspace_role(id) is not null);

create policy workspace_admins_update_workspace
on public.workspaces for update to authenticated
using (public.current_workspace_role(id) in ('owner', 'admin'))
with check (public.current_workspace_role(id) in ('owner', 'admin'));

create policy members_read_workspace_memberships
on public.workspace_memberships for select to authenticated
using (public.current_workspace_role(workspace_id) is not null);

create policy workspace_members_read_stores
on public.stores for select to authenticated
using (public.current_workspace_role(workspace_id) is not null);

create policy workspace_admins_create_stores
on public.stores for insert to authenticated
with check (
  public.current_workspace_role(workspace_id) in ('owner', 'admin')
  and created_by = (select auth.uid())
  and connection_status = 'disconnected'
  and external_store_id is null
  and platform_metadata = '{}'::jsonb
);

create policy workspace_admins_update_stores
on public.stores for update to authenticated
using (public.current_workspace_role(workspace_id) in ('owner', 'admin'))
with check (public.current_workspace_role(workspace_id) in ('owner', 'admin'));

