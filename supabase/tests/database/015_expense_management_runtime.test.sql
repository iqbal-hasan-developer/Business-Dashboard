begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  expense_id uuid;
  expense_updated_at timestamptz;
  edited_id uuid;
  deleted_id uuid;
begin
  select user_id into actor_id
  from public.dashboard_user_profiles
  where role = 'owner' and is_active
  order by created_at
  limit 1;
  if actor_id is null then
    raise exception 'Runtime test requires one active owner.';
  end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.expenses(
    expense_date, category_key, description, amount, created_by, updated_by
  ) values (
    current_date, 'operations', 'Rollback-only expense test', 1.00, actor_id, actor_id
  ) returning id, updated_at into expense_id, expense_updated_at;

  edited_id := public.edit_dashboard_expense(
    expense_id, current_date, 'business_transportation', 'Rollback-only corrected expense',
    2.50, 'Cash', null, null, 'TEST-EXPENSE', 'Correct the runtime fixture',
    expense_updated_at
  );
  if edited_id is distinct from expense_id then
    raise exception 'Expense edit returned the wrong identifier.';
  end if;
  if not exists (
    select 1 from public.audit_history
    where table_name = 'expenses' and record_id = expense_id::text and action = 'UPDATE'
      and reason = 'Correct the runtime fixture'
  ) then
    raise exception 'Expense edit did not preserve its audit reason.';
  end if;

  select updated_at into expense_updated_at from public.expenses where id = expense_id;
  deleted_id := public.delete_dashboard_expense(
    expense_id, 'Remove rollback-only fixture', expense_updated_at
  );
  if deleted_id is distinct from expense_id
     or exists (select 1 from public.expenses where id = expense_id) then
    raise exception 'Owner deletion RPC did not remove the temporary expense.';
  end if;
  if not exists (
    select 1 from public.audit_history
    where table_name = 'expenses' and record_id = expense_id::text and action = 'DELETE'
      and reason = 'Remove rollback-only fixture'
  ) then
    raise exception 'Expense deletion did not preserve its audit reason.';
  end if;
end
$test$;

select 'expense edit, delete, and audit runtime contract passed' as result;
rollback;
