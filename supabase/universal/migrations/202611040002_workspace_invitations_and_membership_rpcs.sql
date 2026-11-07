-- Membership changes are callable only through these authenticated, scoped RPCs.
-- Invitation tokens are returned once and persisted only as a SHA-256 digest.

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null check (
    invited_email = lower(btrim(invited_email))
    and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  role text not null check (role in ('admin', 'manager', 'staff', 'viewer')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (accepted_at is null or revoked_at is null)
);

create unique index workspace_invitations_one_pending_email_idx
  on public.workspace_invitations (workspace_id, invited_email)
  where accepted_at is null and revoked_at is null;

create index workspace_invitations_expiry_idx
  on public.workspace_invitations (expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.workspace_invitations enable row level security;
revoke all on table public.workspace_invitations from public, anon, authenticated, service_role;
grant select (id, workspace_id, invited_email, role, expires_at, created_by,
  accepted_at, accepted_by, revoked_at, created_at)
  on public.workspace_invitations to authenticated;

create policy workspace_admins_read_invitations
on public.workspace_invitations for select to authenticated
using (public.current_workspace_role(workspace_id) in ('owner', 'admin'));

-- Ciphertext is available only to the isolated server worker role. Do not put
-- plaintext secrets in stores.platform_metadata or return ciphertext to users.
create table public.store_credentials (
  workspace_id uuid not null,
  store_id uuid not null,
  ciphertext bytea not null check (octet_length(ciphertext) >= 16),
  nonce bytea not null check (octet_length(nonce) between 12 and 24),
  key_id text not null check (length(btrim(key_id)) between 1 and 120),
  encryption_version smallint not null default 1 check (encryption_version > 0),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (store_id),
  foreign key (workspace_id, store_id)
    references public.stores (workspace_id, id) on delete restrict
);

create or replace function public.prevent_store_credential_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.workspace_id <> old.workspace_id or new.store_id <> old.store_id then
    raise exception 'Store credential ownership cannot be changed.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger store_credentials_keep_owner
before update on public.store_credentials
for each row execute function public.prevent_store_credential_reassignment();

alter table public.store_credentials enable row level security;
alter table public.store_credentials force row level security;
revoke all on table public.store_credentials from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.store_credentials to service_role;

create or replace function public.invite_workspace_member(
  p_workspace_id uuid,
  p_email text,
  p_role text
)
returns table (invitation_id uuid, invitation_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_role text := public.current_workspace_role(p_workspace_id);
  clean_email text := lower(btrim(coalesce(p_email, '')));
  clean_role text := lower(btrim(coalesce(p_role, '')));
  raw_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  new_invitation_id uuid;
  invitation_expiry timestamptz := now() + interval '7 days';
begin
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized to invite workspace members.' using errcode = '42501';
  end if;
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid invitation email address.' using errcode = '22023';
  end if;
  if clean_role not in ('admin', 'manager', 'staff', 'viewer') then
    raise exception 'Invalid invitation role.' using errcode = '22023';
  end if;
  if actor_role = 'admin' and clean_role = 'admin' then
    raise exception 'Only workspace owners can invite administrators.' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.workspace_memberships as membership
    join auth.users as account on account.id = membership.user_id
    where membership.workspace_id = p_workspace_id
      and lower(account.email) = clean_email
  ) then
    raise exception 'This user already has a workspace membership.' using errcode = '23505';
  end if;

  update public.workspace_invitations as invitation
  set revoked_at = now()
  where invitation.workspace_id = p_workspace_id
    and invitation.invited_email = clean_email
    and invitation.accepted_at is null
    and invitation.revoked_at is null
    and invitation.expires_at <= now();

  insert into public.workspace_invitations (
    workspace_id, invited_email, role, token_hash, expires_at, created_by
  ) values (
    p_workspace_id,
    clean_email,
    clean_role,
    extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'),
    invitation_expiry,
    auth.uid()
  ) returning id into new_invitation_id;

  return query select new_invitation_id, raw_token, invitation_expiry;
end;
$function$;

create or replace function public.accept_workspace_invitation(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.workspace_invitations%rowtype;
  existing_role text;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 60 or length(p_token) > 100 then
    raise exception 'Invitation is invalid, expired, or already used.' using errcode = '22023';
  end if;

  select lower(account.email) into actor_email
  from auth.users as account
  where account.id = actor_id
    and account.email_confirmed_at is not null;

  select * into invitation
  from public.workspace_invitations as candidate
  where candidate.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256')
  for update;

  if not found
     or invitation.revoked_at is not null
     or invitation.expires_at <= now()
     or invitation.invited_email <> coalesce(actor_email, '') then
    raise exception 'Invitation is invalid, expired, revoked, or belongs to another email.'
      using errcode = '42501';
  end if;

  if invitation.accepted_at is not null then
    if invitation.accepted_by = actor_id then
      select membership.role into existing_role
      from public.workspace_memberships as membership
      where membership.workspace_id = invitation.workspace_id
        and membership.user_id = actor_id
        and membership.is_active;
      if existing_role is not null then return existing_role; end if;
    end if;
    raise exception 'Invitation is invalid, expired, revoked, or already used.'
      using errcode = '42501';
  end if;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (invitation.workspace_id, actor_id, invitation.role)
  on conflict (workspace_id, user_id) do nothing;

  select membership.role into existing_role
  from public.workspace_memberships as membership
  where membership.workspace_id = invitation.workspace_id
    and membership.user_id = actor_id
    and membership.is_active;
  if existing_role is null then
    raise exception 'An inactive membership must be restored by a workspace owner.'
      using errcode = '23514';
  end if;

  update public.workspace_invitations
  set accepted_at = now(), accepted_by = actor_id
  where id = invitation.id;

  return existing_role;
end;
$function$;

create or replace function public.revoke_workspace_invitation(
  p_workspace_id uuid,
  p_invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_role text := public.current_workspace_role(p_workspace_id);
begin
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized to revoke workspace invitations.' using errcode = '42501';
  end if;

  update public.workspace_invitations as invitation
  set revoked_at = now()
  where invitation.id = p_invitation_id
    and invitation.workspace_id = p_workspace_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;
  if not found then
    raise exception 'Pending workspace invitation not found.' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.set_workspace_member_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_role text := public.current_workspace_role(p_workspace_id);
  current_target_role text;
  clean_role text := lower(btrim(coalesce(p_role, '')));
begin
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized to change workspace roles.' using errcode = '42501';
  end if;
  if clean_role not in ('admin', 'manager', 'staff', 'viewer') then
    raise exception 'Invalid workspace role.' using errcode = '22023';
  end if;

  select membership.role into current_target_role
  from public.workspace_memberships as membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
    and membership.is_active
  for update;
  if current_target_role is null then
    raise exception 'Active workspace member not found.' using errcode = 'P0002';
  end if;
  if current_target_role = 'owner' then
    raise exception 'Use ownership transfer to change an owner.' using errcode = '42501';
  end if;
  if actor_role = 'admin' and (current_target_role = 'admin' or clean_role = 'admin') then
    raise exception 'Only workspace owners can change administrator roles.' using errcode = '42501';
  end if;

  update public.workspace_memberships
  set role = clean_role, updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$function$;

create or replace function public.remove_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_workspace_role(p_workspace_id);
  target_role text;
begin
  select membership.role into target_role
  from public.workspace_memberships as membership
  where membership.workspace_id = p_workspace_id
    and membership.user_id = p_user_id
    and membership.is_active
  for update;
  if target_role is null then
    raise exception 'Active workspace member not found.' using errcode = 'P0002';
  end if;
  if actor_role = 'owner' then
    null;
  elsif actor_role = 'admin' and target_role in ('manager', 'staff', 'viewer') then
    null;
  elsif actor_id = p_user_id and target_role <> 'owner' then
    null;
  else
    raise exception 'Not authorized to remove this workspace member.' using errcode = '42501';
  end if;

  update public.workspace_memberships
  set is_active = false, updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_user_id;
end;
$function$;

create or replace function public.transfer_workspace_ownership(
  p_workspace_id uuid,
  p_new_owner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := auth.uid();
begin
  if public.current_workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'Only the active workspace owner can transfer ownership.'
      using errcode = '42501';
  end if;
  if p_new_owner_id = actor_id then return; end if;
  if not exists (
    select 1 from public.workspace_memberships as target
    where target.workspace_id = p_workspace_id
      and target.user_id = p_new_owner_id
      and target.role = 'admin'
      and target.is_active
  ) then
    raise exception 'The new owner must be an active workspace administrator.'
      using errcode = '22023';
  end if;

  update public.workspace_memberships
  set role = 'owner', updated_at = now()
  where workspace_id = p_workspace_id and user_id = p_new_owner_id;
  update public.workspace_memberships
  set role = 'admin', updated_at = now()
  where workspace_id = p_workspace_id and user_id = actor_id;
end;
$function$;

revoke all on function public.invite_workspace_member(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_workspace_invitation(text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_workspace_invitation(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.set_workspace_member_role(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.remove_workspace_member(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.transfer_workspace_ownership(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.invite_workspace_member(uuid, text, text) to authenticated;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid, uuid) to authenticated;
grant execute on function public.set_workspace_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_workspace_ownership(uuid, uuid) to authenticated;
