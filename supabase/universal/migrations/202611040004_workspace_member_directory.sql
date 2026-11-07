drop function public.accept_workspace_invitation(text);

create function public.accept_workspace_invitation(p_token text)
returns uuid
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
      if existing_role is not null then return invitation.workspace_id; end if;
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

  return invitation.workspace_id;
end;
$function$;

revoke all on function public.accept_workspace_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_workspace_invitation(text)
  to authenticated;

create or replace function public.list_workspace_members(p_workspace_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select membership.user_id, account.email, membership.role,
    membership.is_active, membership.created_at
  from public.workspace_memberships as membership
  join auth.users as account on account.id = membership.user_id
  where membership.workspace_id = p_workspace_id
    and public.current_workspace_role(p_workspace_id) is not null
  order by membership.created_at, membership.user_id;
$function$;

revoke all on function public.list_workspace_members(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_workspace_members(uuid)
  to authenticated;
