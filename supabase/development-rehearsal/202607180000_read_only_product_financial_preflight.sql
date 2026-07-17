-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Replace the sentinel once after visually confirming the breadcrumb says
-- exactly: NexaNotion Business Dashboard Dev.
-- Returns metadata and aggregate counts only; it does not expose business rows.

with operator_gate as (
  select
    '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'::text
      as confirmed_breadcrumb,
    '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
      = 'NexaNotion Business Dashboard Dev' as confirmed
), expected(version, expected_name) as (
  values
    ('202607140000'::text, 'live_schema_preflight'::text),
    ('202607140001', 'dashboard_identity_and_roles'),
    ('202607140002', 'private_catalog_and_settings'),
    ('202607140003', 'campaigns_and_ad_spend'),
    ('202607140004', 'order_compatibility_and_financial_snapshots'),
    ('202607140005', 'settlements_expenses_cash_and_audit'),
    ('202607140006', 'constraints_and_indexes'),
    ('202607140007', 'row_level_security'),
    ('202607140008', 'atomic_order_rpc'),
    ('202607140009', 'financial_and_reconciliation_views')
), recorded as (
  select history.version::text, history.name::text
  from supabase_migrations.schema_migrations as history
  cross join operator_gate as gate
  where gate.confirmed
), history_check as (
  select
    count(*) filter (
      where recorded.version is not null
    )::bigint as recorded_expected_count,
    count(*) filter (
      where recorded.version is not null
        and recorded.name = expected.expected_name
    )::bigint as matching_name_count
  from expected
  left join recorded using (version)
), unexpected as (
  select count(*)::bigint as unexpected_history_count
  from recorded
  where version not in (select version from expected)
), business_history as (
  select
    (select count(*) from public.order_financial_snapshots)::bigint
      as snapshot_count,
    (select count(*) from public.order_financial_adjustments)::bigint
      as adjustment_count,
    (select count(*) from public.orders
      where dashboard_order_status = 'Delivered')::bigint
      as delivered_order_count,
    (select count(*) from public.orders where refund_amount <> 0)::bigint
      as nonzero_refund_order_count
), contract as (
  select
    to_regclass('public.order_financial_snapshots') is not null
      and to_regclass('public.order_financial_adjustments') is not null
      and to_regclass('public.order_items') is not null
      and to_regprocedure(
        'public.dashboard_has_any_role(public.dashboard_role[])'
      ) is not null as canonical_chain_present,
    to_regclass('public.order_item_financial_allocations') is null
      and to_regclass('public.order_item_refund_allocations') is null
      and to_regclass('public.order_return_events') is null
      and to_regclass('public.order_item_return_allocations') is null
      and to_regclass('public.order_return_inspections') is null
      and to_regclass('public.inventory_restoration_movements') is null
      and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'orders', 'order_financial_snapshots',
            'order_financial_adjustments'
          )
          and column_name in (
            'refund_scope', 'return_disposition', 'refund_review_status',
            'order_origin_date', 'original_refund_scope',
            'original_return_disposition', 'original_refund_review_status',
            'allocation_method', 'item_allocation_request', 'idempotency_key'
          )
      ) as proposal_objects_absent,
    has_table_privilege('service_role', 'public.orders', 'INSERT')
      and has_table_privilege('service_role', 'public.orders', 'UPDATE')
      and has_table_privilege('service_role', 'public.order_items', 'INSERT')
      and has_function_privilege(
        'service_role',
        'public.dashboard_capture_delivered_snapshot()', 'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.dashboard_capture_refund_adjustment()', 'EXECUTE'
      ) as website_trigger_path_present
), decision as (
  select
    gate.confirmed,
    history.recorded_expected_count,
    history.matching_name_count,
    unexpected.unexpected_history_count,
    business.snapshot_count,
    business.adjustment_count,
    business.delivered_order_count,
    business.nonzero_refund_order_count,
    contract.*,
    exists (
      select 1 from recorded where version = '202607150000'
    ) as development_baseline_recorded,
    exists (
      select 1 from recorded where version = '202607170000'
    ) as product_allocation_recorded
  from operator_gate as gate
  cross join history_check as history
  cross join unexpected
  cross join business_history as business
  cross join contract
)
select
  current_database() as database_name,
  current_setting('server_version') as postgres_version,
  gate.confirmed_breadcrumb,
  decision.confirmed as metadata_preflight_allowed,
  to_regclass('supabase_migrations.schema_migrations') is not null
    as schema_migrations_exists,
  decision.recorded_expected_count,
  decision.matching_name_count,
  decision.unexpected_history_count,
  decision.development_baseline_recorded,
  decision.product_allocation_recorded,
  decision.canonical_chain_present,
  decision.proposal_objects_absent,
  decision.snapshot_count,
  decision.adjustment_count,
  decision.delivered_order_count,
  decision.nonzero_refund_order_count,
  decision.website_trigger_path_present,
  (
    decision.confirmed
    and decision.recorded_expected_count = 10
    and decision.matching_name_count = 10
    and decision.unexpected_history_count = 0
    and not decision.development_baseline_recorded
    and not decision.product_allocation_recorded
    and decision.canonical_chain_present
    and decision.proposal_objects_absent
    and decision.snapshot_count = 0
    and decision.adjustment_count = 0
    and decision.delivered_order_count = 0
    and decision.nonzero_refund_order_count = 0
    and decision.website_trigger_path_present
  ) as application_allowed,
  not (
    decision.confirmed
    and decision.recorded_expected_count = 10
    and decision.matching_name_count = 10
    and decision.unexpected_history_count = 0
    and not decision.development_baseline_recorded
    and not decision.product_allocation_recorded
    and decision.canonical_chain_present
    and decision.proposal_objects_absent
    and decision.snapshot_count = 0
    and decision.adjustment_count = 0
    and decision.delivered_order_count = 0
    and decision.nonzero_refund_order_count = 0
    and decision.website_trigger_path_present
  ) as stop_required
from decision
cross join operator_gate as gate;
