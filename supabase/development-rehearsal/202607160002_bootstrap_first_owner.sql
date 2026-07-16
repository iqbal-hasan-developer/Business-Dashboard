-- DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

set local nexanotion.bootstrap_owner_user_id =
  '00000000-0000-0000-0000-000000000000';

do $bootstrap_owner$
declare
  target_user_id uuid := pg_catalog.current_setting(
    'nexanotion.bootstrap_owner_user_id'
  )::uuid;
begin
  if target_user_id =
    '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace the all-zero owner UUID before execution.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = target_user_id
  ) then
    raise exception 'The selected development Auth user does not exist.';
  end if;

  if exists (
    select 1
    from public.dashboard_user_profiles
    where role = 'owner'
      and is_active
      and user_id <> target_user_id
  ) then
    raise exception
      'An active owner already exists; use reviewed owner controls.';
  end if;

  insert into public.dashboard_user_profiles (
    user_id,
    email,
    display_name,
    role,
    is_active
  )
  select
    id,
    email,
    'Development Owner',
    'owner',
    true
  from auth.users
  where id = target_user_id
  on conflict (user_id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    role = excluded.role,
    is_active = true;
end
$bootstrap_owner$;

select
  user_id,
  role,
  is_active
from public.dashboard_user_profiles
where user_id = pg_catalog.current_setting(
  'nexanotion.bootstrap_owner_user_id'
)::uuid;

commit;
