-- Development-only migration-history audit.
--
-- Run only after the SQL Editor breadcrumb has been visually confirmed as:
-- NexaNotion Business Dashboard Dev
--
-- Before execution, replace the confirmation sentinel below with that exact
-- breadcrumb text. With the sentinel unchanged, history rows are not read.
-- This query reads PostgreSQL/Supabase metadata only. It does not inspect
-- public-table rows, Auth-user rows, function bodies, or configuration values.

with
operator_confirmation as (
  select
    'NexaNotion Business Dashboard Dev'::text as required_breadcrumb,
    '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'::text
      as confirmed_breadcrumb
),
expected_migrations as (
  select
    '202607140000'::text as migration_timestamp,
    'live_schema_preflight'::text as migration_name
  union all select '202607140001', 'dashboard_identity_and_roles'
  union all select '202607140002', 'private_catalog_and_settings'
  union all select '202607140003', 'campaigns_and_ad_spend'
  union all select
    '202607140004', 'order_compatibility_and_financial_snapshots'
  union all select '202607140005', 'settlements_expenses_cash_and_audit'
  union all select '202607140006', 'constraints_and_indexes'
  union all select '202607140007', 'row_level_security'
  union all select '202607140008', 'atomic_order_rpc'
  union all select '202607140009', 'financial_and_reconciliation_views'
),
history_metadata as (
  select
    to_regclass('supabase_migrations.schema_migrations') is not null
      as history_table_exists,
    count(*) filter (where column_name = 'version') = 1
      as version_column_exists,
    count(*) filter (where column_name = 'name') = 1
      as name_column_exists
  from information_schema.columns
  where table_schema = 'supabase_migrations'
    and table_name = 'schema_migrations'
),
database_identity as (
  select
    current_database()::text as database_name,
    current_user::text as database_role,
    current_setting('server_version')::text as server_version,
    current_setting('server_version_num')::integer >= 150000
      as supported_postgresql,
    to_regrole('anon') is not null
      and to_regrole('authenticated') is not null
      and to_regrole('service_role') is not null
      as supabase_api_roles_present,
    to_regclass('public.categories') is not null
      and to_regclass('public.contact_messages') is not null
      and to_regclass('public.products') is not null
      and to_regclass('public.orders') is not null
      and to_regclass('public.order_items') is not null
      and to_regprocedure(
        'public.decrement_product_stock(uuid,integer)'
      ) is not null
      and to_regprocedure('public.set_updated_at()') is not null
      as storefront_baseline_fingerprint_present,
    to_regclass('public.dashboard_user_profiles') is not null
      or to_regclass('public.order_financial_snapshots') is not null
      or to_regprocedure('public.create_dashboard_order(jsonb,jsonb)')
        is not null
      as dashboard_migration_fingerprint_present,
    to_regclass('public.order_item_financial_allocations') is not null
      or to_regclass('public.order_return_events') is not null
      or to_regprocedure(
        'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)'
      ) is not null
      as product_allocation_proposal_present
),
audit_gate as (
  select
    confirmation.required_breadcrumb,
    confirmation.confirmed_breadcrumb,
    identity.*,
    metadata.history_table_exists,
    metadata.version_column_exists,
    metadata.name_column_exists,
    confirmation.confirmed_breadcrumb = confirmation.required_breadcrumb
      and identity.supported_postgresql
      and identity.supabase_api_roles_present
      and identity.storefront_baseline_fingerprint_present
      and identity.dashboard_migration_fingerprint_present
      and not identity.product_allocation_proposal_present
      and metadata.history_table_exists
      and metadata.version_column_exists
      and metadata.name_column_exists
      as metadata_audit_allowed
  from operator_confirmation as confirmation
  cross join database_identity as identity
  cross join history_metadata as metadata
),
history_document as (
  select
    case
      when gate.metadata_audit_allowed then pg_catalog.query_to_xml(
        'select version::text as version, coalesce(name::text, '''') as name from supabase_migrations.schema_migrations order by version',
        false,
        false,
        ''
      )
      else null::xml
    end as history_xml
  from audit_gate as gate
),
remote_history as (
  select
    ((xpath('/row/version/text()', history_row))[1])::text
      as migration_timestamp,
    nullif(((xpath('/row/name/text()', history_row))[1])::text, '')
      as migration_name
  from history_document as document
  cross join lateral unnest(
    coalesce(xpath('/table/row', document.history_xml), array[]::xml[])
  ) as rows(history_row)
),
history_comparison as (
  select
    expected.migration_timestamp,
    expected.migration_name as expected_migration_name,
    remote.migration_name as recorded_migration_name,
    case
      when remote.migration_timestamp is null then null
      else coalesce(remote.migration_name = expected.migration_name, false)
    end as name_matches_expected,
    case
      when remote.migration_timestamp is not null then 'recorded'
      else 'missing_from_history'
    end::text as history_status
  from expected_migrations as expected
  left join remote_history as remote
    on remote.migration_timestamp = expected.migration_timestamp

  union all

  select
    remote.migration_timestamp,
    null::text as expected_migration_name,
    remote.migration_name as recorded_migration_name,
    null::boolean as name_matches_expected,
    'unexpected_history_entry'::text as history_status
  from remote_history as remote
  where not exists (
    select 1
    from expected_migrations as expected
    where expected.migration_timestamp = remote.migration_timestamp
  )
),
schema_contract_checks as (
  select *
  from (
    values
      (
        '202607140000'::text,
        'storefront compatibility metadata'::text,
        current_setting('server_version_num')::integer >= 150000
          and to_regclass('public.categories') is not null
          and to_regclass('public.contact_messages') is not null
          and to_regclass('public.products') is not null
          and to_regclass('public.orders') is not null
          and to_regclass('public.order_items') is not null
          and to_regprocedure(
            'public.decrement_product_stock(uuid,integer)'
          ) is not null
          and to_regprocedure('public.set_updated_at()') is not null
      ),
      (
        '202607140001',
        'dashboard identity and role metadata',
        to_regtype('public.dashboard_role') is not null
          and to_regclass('public.dashboard_user_profiles') is not null
          and to_regprocedure('public.dashboard_current_role()') is not null
      ),
      (
        '202607140002',
        'private catalog and settings relations',
        to_regclass('public.product_business_data') is not null
          and to_regclass('public.business_settings') is not null
          and to_regclass('public.business_lookup_values') is not null
      ),
      (
        '202607140003',
        'campaign and advertising relations',
        to_regclass('public.campaigns') is not null
          and to_regclass('public.daily_ad_spend') is not null
      ),
      (
        '202607140004',
        'order recognition relations and capture functions',
        to_regclass('public.order_financial_snapshots') is not null
          and to_regclass('public.order_financial_adjustments') is not null
          and to_regprocedure(
            'public.dashboard_capture_delivered_snapshot()'
          ) is not null
          and to_regprocedure(
            'public.dashboard_capture_refund_adjustment()'
          ) is not null
      ),
      (
        '202607140005',
        'settlement expense cash and audit relations',
        to_regclass('public.settlement_records') is not null
          and to_regclass('public.settlement_order_allocations') is not null
          and to_regclass('public.expenses') is not null
          and to_regclass('public.cash_movements') is not null
          and to_regclass('public.audit_history') is not null
      ),
      (
        '202607140006',
        'constraint and index metadata',
        to_regclass('public.products_sku_ci_uidx') is not null
          and exists (
            select 1
            from pg_catalog.pg_constraint
            where conrelid = to_regclass('public.orders')
              and conname = 'orders_dashboard_status_allowed'
          )
          and exists (
            select 1
            from pg_catalog.pg_constraint
            where conrelid = to_regclass('public.order_items')
              and conname = 'order_items_dashboard_snapshots_nonnegative'
          )
      ),
      (
        '202607140007',
        'row-level security policy metadata',
        exists (
          select 1
          from pg_catalog.pg_class as relation
          where relation.oid = to_regclass('public.order_financial_snapshots')
            and relation.relrowsecurity
        )
          and exists (
            select 1
            from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename = 'order_financial_snapshots'
              and policyname =
                'Dashboard owners and admins read recognition snapshots'
          )
      ),
      (
        '202607140008',
        'atomic dashboard RPC metadata',
        to_regprocedure('public.create_dashboard_order(jsonb,jsonb)')
          is not null
          and to_regprocedure(
            'public.transition_dashboard_order(uuid,text,text,text,numeric)'
          ) is not null
          and to_regprocedure(
            'public.record_settlement(text,text,date,numeric,numeric,text)'
          ) is not null
      ),
      (
        '202607140009',
        'financial and reconciliation reporting metadata',
        to_regclass('public.dashboard_order_financials') is not null
          and to_regclass('public.dashboard_reconciliation') is not null
          and to_regclass('public.dashboard_daily_financials') is not null
          and to_regclass('public.dashboard_data_quality_checks') is not null
          and to_regprocedure(
            'public.get_dashboard_financial_summary(date,date,text,uuid)'
          ) is not null
      )
  ) as checks(migration_timestamp, check_name, passed)
),
audit_summary as (
  select
    (select count(*) from expected_migrations)
      as expected_migration_count,
    count(*) filter (where history_status = 'recorded')
      as recorded_expected_count,
    count(*) filter (where history_status = 'missing_from_history')
      as missing_expected_count,
    count(*) filter (where history_status = 'unexpected_history_entry')
      as unexpected_history_count,
    (select count(*) from schema_contract_checks)
      as schema_contract_check_count,
    (select count(*) from schema_contract_checks where passed)
      as passed_schema_contract_count,
    (select metadata_audit_allowed from audit_gate)
      and count(*) filter (where history_status = 'recorded') =
        (select count(*) from expected_migrations)
      and count(*) filter (where history_status = 'missing_from_history') = 0
      and count(*) filter (where history_status = 'unexpected_history_entry') = 0
      and bool_and(name_matches_expected)
        filter (where history_status = 'recorded')
      and (select bool_and(passed) from schema_contract_checks)
      as history_aligned
  from history_comparison
),
audit_output as (
  select
    1 as section_order,
    1::bigint as row_order,
    'database_identity'::text as result_section,
    jsonb_build_object(
      'required_breadcrumb', gate.required_breadcrumb,
      'confirmed_breadcrumb', gate.confirmed_breadcrumb,
      'database_name', gate.database_name,
      'database_role', gate.database_role,
      'server_version', gate.server_version,
      'supported_postgresql', gate.supported_postgresql,
      'supabase_api_roles_present', gate.supabase_api_roles_present,
      'storefront_baseline_fingerprint_present',
        gate.storefront_baseline_fingerprint_present,
      'dashboard_migration_fingerprint_present',
        gate.dashboard_migration_fingerprint_present,
      'product_allocation_proposal_present',
        gate.product_allocation_proposal_present,
      'schema_migrations_exists', gate.history_table_exists,
      'version_column_exists', gate.version_column_exists,
      'name_column_exists', gate.name_column_exists,
      'metadata_audit_allowed', gate.metadata_audit_allowed,
      'stop_required', not gate.metadata_audit_allowed
    ) as result
  from audit_gate as gate

  union all

  select
    2,
    row_number() over (
      order by comparison.migration_timestamp, comparison.history_status
    ),
    'migration_history',
    jsonb_build_object(
      'migration_timestamp', comparison.migration_timestamp,
      'expected_migration_name', comparison.expected_migration_name,
      'recorded_migration_name', comparison.recorded_migration_name,
      'name_matches_expected', comparison.name_matches_expected,
      'history_status', comparison.history_status
    )
  from history_comparison as comparison

  union all

  select
    3,
    row_number() over (order by checks.migration_timestamp),
    'schema_contract',
    jsonb_build_object(
      'migration_timestamp', checks.migration_timestamp,
      'check_name', checks.check_name,
      'passed', checks.passed
    )
  from schema_contract_checks as checks

  union all

  select
    4,
    1,
    'summary',
    to_jsonb(summary)
  from audit_summary as summary
)
select result_section, result
from audit_output
order by section_order, row_order;
