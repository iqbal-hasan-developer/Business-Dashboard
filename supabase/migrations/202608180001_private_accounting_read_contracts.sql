begin;

create or replace function public.get_dashboard_procurement_summary()
returns table (
  inventory_purchase_total numeric(14,2),
  freight_in_total numeric(14,2),
  allocated_procurement_total numeric(14,2),
  unallocated_procurement_total numeric(14,2),
  known_inventory_value numeric(14,2),
  unallocated_record_count bigint,
  missing_cash_movement_count bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(array[
    'owner', 'admin', 'viewer'
  ]::public.dashboard_role[]) then
    raise exception 'Dashboard reporting access is required.' using errcode = '42501';
  end if;
  return query select summary.inventory_purchase_total,
    summary.freight_in_total, summary.allocated_procurement_total,
    summary.unallocated_procurement_total, summary.known_inventory_value,
    summary.unallocated_record_count, summary.missing_cash_movement_count
  from public.dashboard_procurement_summary as summary;
end
$function$;

create or replace function public.get_dashboard_data_quality_checks()
returns setof public.dashboard_data_quality_checks
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.dashboard_has_any_role(array[
    'owner', 'admin', 'viewer'
  ]::public.dashboard_role[]) then
    raise exception 'Dashboard reporting access is required.' using errcode = '42501';
  end if;
  return query select checks.* from public.dashboard_data_quality_checks as checks;
end
$function$;

revoke all on function public.get_dashboard_procurement_summary(),
  public.get_dashboard_data_quality_checks()
from public, anon, authenticated, service_role;
grant execute on function public.get_dashboard_procurement_summary(),
  public.get_dashboard_data_quality_checks()
to authenticated, service_role;

create or replace function public.dashboard_protect_allocated_procurement_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.procurement_expense_allocations as allocation
    where allocation.expense_id = old.id
  ) then
    raise exception 'Allocated procurement records are immutable; post an auditable correction instead.'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

drop trigger if exists expenses_protect_allocated_procurement on public.expenses;
create trigger expenses_protect_allocated_procurement
before update or delete on public.expenses
for each row execute function public.dashboard_protect_allocated_procurement_expense();

commit;
