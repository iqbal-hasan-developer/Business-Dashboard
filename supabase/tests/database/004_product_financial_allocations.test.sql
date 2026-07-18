-- Requires the reviewed development product-allocation proposal and one owner.
begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'public', 'order_item_financial_allocations',
  'immutable item recognition allocations table exists'
);
select has_table(
  'public', 'order_item_refund_allocations',
  'immutable scoped item refund allocations table exists'
);
select has_table(
  'public', 'order_return_events',
  'return events are separate from monetary refund adjustments'
);
select has_table(
  'public', 'order_item_return_allocations',
  'immutable item return allocations table exists'
);
select has_table(
  'public', 'order_return_inspections',
  'owner/admin return inspections are immutable and exactly once'
);
select has_table(
  'public', 'inventory_restoration_movements',
  'immutable inventory-restoration movement table exists'
);
select has_view(
  'public', 'dashboard_product_allocation_reconciliation',
  'product allocation reconciliation view exists'
);
select has_view(
  'public', 'dashboard_product_allocation_data_quality',
  'product allocation data-quality view exists'
);
select has_function(
  'public', 'get_dashboard_product_financials',
  array['date', 'date', 'text', 'uuid', 'text', 'uuid', 'text',
    'integer', 'integer'],
  'authenticated product reporting RPC exists'
);
select has_function(
  'public', 'record_dashboard_refund',
  array['uuid', 'numeric', 'text', 'text', 'date', 'jsonb'],
  'authenticated monetary refund RPC has no return parameters'
);
select has_function(
  'public', 'record_dashboard_return',
  array['uuid', 'text', 'text', 'date', 'jsonb'],
  'authenticated return event RPC is separate from refunds'
);
select has_function(
  'public', 'inspect_dashboard_return',
  array['uuid', 'text', 'text', 'date'],
  'authenticated inspection action is separate and exactly once'
);

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.order_item_financial_allocations'::regclass),
  'item recognition allocations have RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.order_item_refund_allocations'::regclass),
  'item refund allocations have RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.order_item_return_allocations'::regclass)
  and (select relrowsecurity from pg_class
   where oid = 'public.order_return_events'::regclass)
  and (select relrowsecurity from pg_class
   where oid = 'public.order_return_inspections'::regclass)
  and (select relrowsecurity from pg_class
   where oid = 'public.inventory_restoration_movements'::regclass),
  'return and restoration ledgers have RLS'
);
select ok(
  not has_table_privilege(
    'anon', 'public.order_item_financial_allocations', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.order_item_refund_allocations', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.order_item_return_allocations', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.order_return_events', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.order_return_inspections', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.inventory_restoration_movements', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.dashboard_order_financials', 'SELECT'
  ) and not has_table_privilege(
    'anon', 'public.product_business_data', 'SELECT'
  ),
  'anon cannot read allocations or buying costs'
);
select ok(
  has_table_privilege(
    'authenticated', 'public.order_item_financial_allocations', 'SELECT'
  ) and not has_table_privilege(
    'authenticated', 'public.order_item_financial_allocations', 'INSERT'
  ) and not has_table_privilege(
    'authenticated', 'public.order_item_refund_allocations', 'INSERT'
  ),
  'authenticated clients have read-only grants subject to role RLS'
);
select ok(
  not has_table_privilege(
    'service_role', 'public.order_financial_snapshots', 'SELECT'
  ) and not has_table_privilege(
    'service_role', 'public.order_financial_adjustments', 'INSERT'
  ) and not has_table_privilege(
    'service_role', 'public.order_item_financial_allocations', 'SELECT'
  ) and not has_table_privilege(
    'service_role', 'public.order_item_refund_allocations', 'INSERT'
  ) and not has_table_privilege(
    'service_role', 'public.order_item_return_allocations', 'SELECT'
  ) and not has_table_privilege(
    'service_role', 'public.order_return_events', 'SELECT'
  ) and not has_table_privilege(
    'service_role', 'public.order_return_inspections', 'SELECT'
  ) and not has_table_privilege(
    'service_role', 'public.inventory_restoration_movements', 'INSERT'
  ) and not has_table_privilege(
    'service_role', 'public.dashboard_order_financials', 'SELECT'
  ),
  'service role has no direct immutable-ledger privilege'
);
select ok(
  has_table_privilege('service_role', 'public.orders', 'INSERT')
    and has_table_privilege('service_role', 'public.orders', 'UPDATE')
    and has_table_privilege('service_role', 'public.order_items', 'INSERT'),
  'service-role Website checkout retains operational order and item grants'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.dashboard_capture_delivered_snapshot()',
    'EXECUTE'
  ) and has_function_privilege(
    'service_role',
    'public.dashboard_capture_refund_adjustment()',
    'EXECUTE'
  ),
  'service-role Website status writes retain SECURITY DEFINER trigger execution'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.dashboard_capture_delivered_snapshot()',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.dashboard_capture_refund_adjustment()',
    'EXECUTE'
  ),
  'authenticated order workflows retain trigger execution without ledger writes'
);
select ok(
  (select prosecdef from pg_proc where oid =
    'public.dashboard_capture_delivered_snapshot()'::regprocedure),
  'Website status updates reach a SECURITY DEFINER recognition trigger'
);
select ok(
  not exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )
    ) as privilege
    where procedure.oid in (
      'public.dashboard_money_to_poisha(numeric)'::regprocedure,
      'public.dashboard_poisha_to_money(bigint)'::regprocedure,
      'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'::regprocedure
    )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon', 'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
  ) and not has_function_privilege(
    'anon',
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
    'EXECUTE'
  ),
  'authenticated reporting has only the required helper and RPC execute grants'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role',
    'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated',
    'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)',
    'EXECUTE'
  ),
  'refund RPC is authenticated-only and excludes service role'
);
select ok(
  not has_function_privilege(
    'anon', 'public.record_dashboard_return(uuid,text,text,date,jsonb)',
    'EXECUTE'
  ) and not has_function_privilege(
    'service_role', 'public.inspect_dashboard_return(uuid,text,text,date)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated', 'public.record_dashboard_return(uuid,text,text,date,jsonb)',
    'EXECUTE'
  ) and has_function_privilege(
    'authenticated', 'public.inspect_dashboard_return(uuid,text,text,date)',
    'EXECUTE'
  ),
  'return and inspection RPCs are authenticated-only and role-gated'
);
select ok(
  procedure.prosecdef
    -- Empty GUC values may be catalogued as search_path=""; parse the value.
    and (
      select count(*) = 1
      from unnest(coalesce(procedure.proconfig, array[]::text[]))
        as configuration
      where split_part(configuration, '=', 1) = 'search_path'
        and btrim(
          substring(configuration from length('search_path=') + 1),
          '"'
        ) = ''
    )
    and procedure.prosrc
      ~* $role_gate$if\s+not\s+public\.dashboard_has_any_role\s*\($role_gate$
    and procedure.prosrc
      ~* $role_gate$'owner'\s*::\s*public\.dashboard_role$role_gate$
    and procedure.prosrc
      ~* $role_gate$'admin'\s*::\s*public\.dashboard_role$role_gate$
    and procedure.prosrc
      ~* $role_gate$'viewer'\s*::\s*public\.dashboard_role$role_gate$
    and procedure.prosrc
      ~* $role_gate$errcode\s*=\s*'42501'$role_gate$,
  'product reporting RPC preserves SECURITY DEFINER, fixed path, and role gate'
)
from pg_proc as procedure
where procedure.oid =
  'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'::regprocedure;

select is(
  public.dashboard_money_to_poisha(123.45),
  12345::bigint,
  'money converts to exact integer poisha'
);
select throws_ok(
  $$select public.dashboard_money_to_poisha(0.001)$$,
  '22023', 'Money must have at most two decimal places.',
  'fractional poisha is rejected'
);
select results_eq(
  $$
    select allocation_key, allocated_poisha
    from public.dashboard_allocate_poisha(
      5,
      array[
        '81000000-0000-4000-8000-000000000001'::uuid,
        '81000000-0000-4000-8000-000000000002'::uuid,
        '81000000-0000-4000-8000-000000000003'::uuid
      ],
      array[1, 1, 1]::bigint[]
    )
    order by allocation_key
  $$,
  $$values
    ('81000000-0000-4000-8000-000000000001'::uuid, 2::bigint),
    ('81000000-0000-4000-8000-000000000002'::uuid, 2::bigint),
    ('81000000-0000-4000-8000-000000000003'::uuid, 1::bigint)
  $$,
  'awkward one-poisha largest remainder uses immutable UUID order'
);

insert into public.categories (id, name, slug)
values (
  '82000000-0000-4000-8000-000000000001',
  'PGTAP product allocation', 'pgtap-product-allocation'
);
insert into public.products (
  id, category_id, name, slug, price, stock, sku, is_active
) values
  (
    '82100000-0000-4000-8000-000000000001',
    '82000000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 11, 'PGTAP-KNOWN', true
  ),
  (
    '82100000-0000-4000-8000-000000000002',
    '82000000-0000-4000-8000-000000000001',
    'PGTAP unknown cost', 'pgtap-unknown-cost', 0.50, 22,
    'PGTAP-UNKNOWN', true
  );
insert into public.product_business_data (
  product_id, buying_price, buying_price_verified_at
) values ('82100000-0000-4000-8000-000000000001', 0.40, now());
insert into public.campaigns (id, name, channel)
values (
  '82200000-0000-4000-8000-000000000001',
  'PGTAP allocation campaign', 'WhatsApp'
);

insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, order_date, customer_location, sales_channel,
  campaign_id, campaign_name_snapshot, dashboard_order_status,
  dashboard_payment_status, settlement_status, discount_amount, refund_amount,
  refund_scope, return_disposition, refund_review_status,
  courier_cost_snapshot, packaging_cost_snapshot
) values
  (
    '82300000-0000-4000-8000-000000000001',
    'PGTAP-ALLOC-DELIVERED', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 2.00, 0.01, 2.00,
    '2026-07-17', 'Inside Dhaka', 'WhatsApp',
    '82200000-0000-4000-8000-000000000001',
    'PGTAP allocation campaign', 'Pending', 'Unpaid', 'Awaiting',
    0.01, 0, 'product_only', 'not_applicable', 'resolved', 0.01, null
  ),
  (
    '82300000-0000-4000-8000-000000000002',
    'PGTAP-ALLOC-PENDING', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 99.00, 0, 99.00,
    '2026-07-17', 'Inside Dhaka', 'WhatsApp', null, null,
    'Pending', 'Unpaid', 'Not Applicable', 0, 0, 'product_only',
    'not_applicable', 'resolved', null, null
  ),
  (
    '82300000-0000-4000-8000-000000000003',
    'PGTAP-CANCELLED-PREPAID', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'bkash', 'verified', 'cancelled', 1.00, 0, 1.00,
    '2026-07-17', 'Inside Dhaka', 'Website', null, null,
    'Cancelled', 'Paid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', null, null
  ),
  (
    '82300000-0000-4000-8000-000000000004',
    'PGTAP-RETURN-RESELLABLE', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 2.00, 0, 2.00,
    '2026-07-17', 'Inside Dhaka', 'ReturnQA', null, null,
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', 0.20, 0.10
  ),
  (
    '82300000-0000-4000-8000-000000000005',
    'PGTAP-RETURN-DAMAGED', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 2.00, 0, 2.00,
    '2026-07-17', 'Inside Dhaka', 'ReturnQA', null, null,
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', 0.20, 0.10
  ),
  (
    '82300000-0000-4000-8000-000000000006',
    'PGTAP-AMBIGUOUS-LEGACY', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 1.00, 0, 1.00,
    '2026-07-17', 'Inside Dhaka', 'Website', null, null,
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', null, null
  ),
  (
    '82300000-0000-4000-8000-000000000007',
    'PGTAP-FULL-NO-RETURN', 'Synthetic', '00000000000', 'Synthetic',
    'Inside Dhaka', 'cod', 'unpaid', 'pending', 1.00, 0, 1.00,
    '2026-07-17', 'Inside Dhaka', 'ReturnQA', null, null,
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', 0.20, 0.10
  );

insert into public.order_items (
  id, order_id, product_id, product_name, product_slug, unit_price,
  quantity, line_total, actual_unit_selling_price
) values
  (
    '82400000-0000-4000-8000-000000000001',
    '82300000-0000-4000-8000-000000000001',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 1, 1.00, 1.00
  ),
  (
    '82400000-0000-4000-8000-000000000002',
    '82300000-0000-4000-8000-000000000001',
    '82100000-0000-4000-8000-000000000002',
    'PGTAP unknown cost', 'pgtap-unknown-cost', 0.50, 2, 1.00, 0.50
  ),
  (
    '82400000-0000-4000-8000-000000000003',
    '82300000-0000-4000-8000-000000000002',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 99.00, 1, 99.00, 99.00
  ),
  (
    '82400000-0000-4000-8000-000000000004',
    '82300000-0000-4000-8000-000000000003',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 1, 1.00, 1.00
  ),
  (
    '82400000-0000-4000-8000-000000000005',
    '82300000-0000-4000-8000-000000000004',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 2, 2.00, 1.00
  ),
  (
    '82400000-0000-4000-8000-000000000006',
    '82300000-0000-4000-8000-000000000005',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 2, 2.00, 1.00
  ),
  (
    '82400000-0000-4000-8000-000000000007',
    '82300000-0000-4000-8000-000000000006',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 1, 1.00, 1.00
  ),
  (
    '82400000-0000-4000-8000-000000000008',
    '82300000-0000-4000-8000-000000000007',
    '82100000-0000-4000-8000-000000000001',
    'PGTAP known cost', 'pgtap-known-cost', 1.00, 1, 1.00, 1.00
  );

update public.orders
set order_status = 'delivered', dashboard_order_status = 'Delivered'
where id in (
  '82300000-0000-4000-8000-000000000001',
  '82300000-0000-4000-8000-000000000004',
  '82300000-0000-4000-8000-000000000005',
  '82300000-0000-4000-8000-000000000006',
  '82300000-0000-4000-8000-000000000007'
);
set constraints dashboard_capture_delivered_snapshot immediate;

select is(
  (select count(*) from public.order_financial_snapshots
   where order_id = '82300000-0000-4000-8000-000000000003'),
  0::bigint,
  'cancelled prepaid order has no recognized revenue or COGS snapshot'
);
select is(
  (select count(*) from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000003'),
  0::bigint,
  'cancelled prepaid order has no delivered units'
);

select is(
  (select count(*) from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  2::bigint,
  'Delivered recognition creates one immutable allocation per item'
);
select is(
  (select count(*) from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000002'),
  0::bigint,
  'non-Delivered orders create no product allocations'
);
select is(
  (select sum(gross_product_revenue_poisha)::bigint
   from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  200::bigint,
  'Gross Product Revenue excludes delivery and reconciles exactly'
);
select is(
  (select sum(delivery_revenue_poisha)::bigint
   from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  1::bigint,
  'Allocated Delivery Revenue reconciles exactly'
);
select is(
  (select row(
     sum(product_discount_poisha)::bigint,
     sum(delivery_discount_poisha)::bigint
   )
   from public.order_item_financial_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  row(1::bigint, 0::bigint),
  'discount is deterministic and product-first before delivery'
);
select ok(
  exists (
    select 1 from public.order_item_financial_allocations
    where order_item_id = '82400000-0000-4000-8000-000000000002'
      and quantity = 2 and cogs_poisha is null
      and packaging_cost_poisha is null
  ),
  'mixed quantity and unknown COGS/fulfillment remain explicit NULL'
);

select ok(
  exists (
    select 1 from public.dashboard_user_profiles
    where role = 'owner' and is_active
  ),
  'an active development owner exists for authenticated RPC tests'
);
select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.dashboard_user_profiles
   where role = 'owner' and is_active order by user_id limit 1),
  true
);
set local role authenticated;

select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.02,
    'product_only', 'pgtap-product-fallback-001', '2026-07-18', null
  )$$,
  'product-only proportional fallback refund succeeds'
);
select is(
  (select sum(delivery_refund_poisha)::bigint
   from public.order_item_refund_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  0::bigint,
  'product-only fallback does not silently refund delivery'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.02,
    'product_only', 'pgtap-product-explicit-002',
    '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000002","refund_poisha":2}]'::jsonb
  )$$,
  'explicit item-level product refund succeeds when product is known'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.01,
    'delivery_only', 'pgtap-delivery-003', '2026-07-18', null
  )$$,
  'delivery refund succeeds only with explicit delivery scope'
);
select is(
  (select sum(delivery_refund_poisha)::bigint
   from public.order_item_refund_allocations
   where order_id = '82300000-0000-4000-8000-000000000001'),
  1::bigint,
  'delivery-scoped refund consumes only delivery capacity'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.02,
    'product_only', 'pgtap-product-fallback-001', '2026-07-18', null
  )$$,
  'an exact idempotent retry returns the original adjustment without duplication'
);
select is(
  (select count(*) from public.order_financial_adjustments
   where order_id = '82300000-0000-4000-8000-000000000001'
     and idempotency_key = 'pgtap-product-fallback-001'),
  1::bigint,
  'an exact retry leaves one append-only refund event'
);
select throws_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.03,
    'product_only', 'pgtap-product-fallback-001', '2026-07-18', null
  )$$,
  '23505',
  'The refund idempotency key is already used by a different request.',
  'a conflicting reuse of an idempotency key is rejected atomically'
);
select throws_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', -0.01,
    'product_only', 'pgtap-negative', '2026-07-18', null
  )$$,
  '22023', 'A positive refund and idempotency key are required.',
  'negative refunds are rejected'
);
select throws_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 1.00,
    'product_only', 'pgtap-item-over', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000001","refund_poisha":100}]'::jsonb
  )$$,
  '23514', 'An explicit refund exceeds the item remaining scoped revenue.',
  'explicit item over-allocation is rejected even when order capacity remains'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 1.95,
    'full_order', 'pgtap-full-004', '2026-07-18', null
  )$$,
  'full-order refund consumes all remaining product and delivery revenue'
);

select is(
  (select net_revenue from public.dashboard_order_financials
   where order_id = '82300000-0000-4000-8000-000000000001'),
  0.00::numeric,
  'full refund reduces adjusted order Net Revenue to exactly zero'
);
select throws_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000001', 0.01,
    'product_only', 'pgtap-over-refund', '2026-07-19', null
  )$$,
  '23514',
  'Product-only refund exceeds remaining recognized product revenue.',
  'over-refunds are rejected atomically'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000007', 1.00,
    'full_order', 'pgtap-full-no-return', '2026-07-18', null
  )$$,
  'full refund without return succeeds'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000004', 2.00,
    'product_only', 'pgtap-resellable-refund', '2026-07-18', null
  )$$,
  'resellable order monetary refund is a separate business event'
);
select lives_ok(
  $$select public.record_dashboard_return(
    '82300000-0000-4000-8000-000000000004',
    'returned_resellable', 'pgtap-resellable-return', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000005","returned_quantity":2}]'::jsonb
  )$$,
  'resellable product return records explicit returned units'
);
select lives_ok(
  $$select public.record_dashboard_return(
    '82300000-0000-4000-8000-000000000004',
    'returned_resellable', 'pgtap-resellable-return', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000005","returned_quantity":2}]'::jsonb
  )$$,
  'exact return retry is idempotent and creates no second event'
);
select is(
  (select count(*) from public.inventory_restoration_movements
   where order_id = '82300000-0000-4000-8000-000000000004'),
  0::bigint,
  'recording a resellable return does not automatically restore inventory'
);
select is(
  (select recognized_cogs from public.dashboard_order_financials
   where order_id = '82300000-0000-4000-8000-000000000004'),
  0.80::numeric,
  'COGS remains recognized until the later resellable inspection action'
);
select lives_ok(
  $$select public.inspect_dashboard_return(
    (select id from public.order_return_events
     where idempotency_key = 'pgtap-resellable-return'),
    'confirmed_resellable', 'pgtap-resellable-inspection', '2026-07-19'
  )$$,
  'later owner/admin inspection creates exactly-once restoration evidence'
);
select lives_ok(
  $$select public.inspect_dashboard_return(
    (select id from public.order_return_events
     where idempotency_key = 'pgtap-resellable-return'),
    'confirmed_resellable', 'pgtap-resellable-inspection', '2026-07-19'
  )$$,
  'exact inspection retry returns the original action without duplication'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000005', 0.50,
    'product_only', 'pgtap-damaged-refund-1', '2026-07-18', null
  )$$,
  'damaged order monetary refund is separate from its return'
);
select lives_ok(
  $$select public.record_dashboard_return(
    '82300000-0000-4000-8000-000000000005',
    'returned_damaged', 'pgtap-damaged-return-1', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000006","returned_quantity":1}]'::jsonb
  )$$,
  'damaged product return records returned units without restock'
);
select throws_ok(
  $$select public.record_dashboard_return(
    '82300000-0000-4000-8000-000000000005',
    'returned_damaged', 'pgtap-damaged-over-return', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000006","returned_quantity":2}]'::jsonb
  )$$,
  '23514', 'Returned quantity exceeds immutable delivered quantity.',
  'sequential over-return is rejected under the order/snapshot mutex'
);
select lives_ok(
  $$select public.record_dashboard_refund(
    '82300000-0000-4000-8000-000000000005', 1.50,
    'product_only', 'pgtap-damaged-refund-2', '2026-07-18', null
  )$$,
  'remaining damaged monetary refund succeeds independently'
);
select lives_ok(
  $$select public.record_dashboard_return(
    '82300000-0000-4000-8000-000000000005',
    'returned_damaged', 'pgtap-damaged-return-2', '2026-07-18',
    '[{"order_item_id":"82400000-0000-4000-8000-000000000006","returned_quantity":1}]'::jsonb
  )$$,
  'remaining damaged return can be recorded exactly once'
);
select lives_ok(
  $$select public.inspect_dashboard_return(
    (select id from public.order_return_events
     where idempotency_key = 'pgtap-damaged-return-1'),
    'confirmed_damaged', 'pgtap-damaged-inspection-1', '2026-07-19'
  )$$,
  'damaged return inspection closes without restoration movement'
);
select lives_ok(
  $$select public.inspect_dashboard_return(
    (select id from public.order_return_events
     where idempotency_key = 'pgtap-damaged-return-2'),
    'confirmed_damaged', 'pgtap-damaged-inspection-2', '2026-07-19'
  )$$,
  'second damaged return inspection also creates no restoration'
);
select throws_ok(
  $$select public.inspect_dashboard_return(
    (select id from public.order_return_events
     where idempotency_key = 'pgtap-resellable-return'),
    'confirmed_resellable', 'pgtap-conflicting-inspection', '2026-07-19'
  )$$,
  '23505', 'A return event can be inspected and restored only once.',
  'a return restoration action is exactly once'
);
reset role;

select is(
  (select row(net_revenue, recognized_cogs) from public.dashboard_order_financials
   where order_id = '82300000-0000-4000-8000-000000000007'),
  row(0.00::numeric, 0.40::numeric),
  'full refund without return reverses revenue and retains COGS'
);
select is(
  (select row(net_revenue, recognized_cogs) from public.dashboard_order_financials
   where order_id = '82300000-0000-4000-8000-000000000004'),
  row(0.00::numeric, 0.00::numeric),
  'resellable return reverses scoped revenue and supported COGS'
);
select is(
  (select row(net_revenue, recognized_cogs) from public.dashboard_order_financials
   where order_id = '82300000-0000-4000-8000-000000000005'),
  row(0.00::numeric, 0.80::numeric),
  'damaged return reverses scoped revenue and retains COGS'
);
select is(
  (select coalesce(sum(quantity_delta)::bigint, 0::bigint)
   from public.inventory_restoration_movements
   where order_id = '82300000-0000-4000-8000-000000000004'),
  2::bigint,
  'resellable return creates an immutable inventory-restoration movement'
);
select is(
  (select count(*) from public.inventory_restoration_movements
   where order_id = '82300000-0000-4000-8000-000000000005'),
  0::bigint,
  'damaged return creates no inventory-restoration movement'
);

update public.orders
set refund_amount = 0.50,
    refund_scope = null,
    return_disposition = null,
    refund_review_status = 'needs_review'
where id = '82300000-0000-4000-8000-000000000006';
select ok(
  exists (
    select 1 from public.order_financial_adjustments
    where order_id = '82300000-0000-4000-8000-000000000006'
      and refund_review_status = 'needs_review'
      and refund_scope is null and return_disposition is null
      and allocation_method = 'unallocated_needs_review'
  ),
  'ambiguous legacy refund is quarantined without inferred scope or disposition'
);
select is(
  (select count(*) from public.order_item_refund_allocations
   where order_id = '82300000-0000-4000-8000-000000000006'),
  0::bigint,
  'ambiguous legacy refund is not silently allocated to products or delivery'
);

select throws_ok(
  $$
    update public.orders set refund_amount = 1.99
    where id = '82300000-0000-4000-8000-000000000001'
  $$,
  '23514', 'Recognized refunds cannot be reduced or deleted.',
  'refund reductions are rejected'
);
select throws_ok(
  $$
    update public.order_item_financial_allocations
    set product_discount_poisha = product_discount_poisha + 1
    where order_item_id = '82400000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'Recognized financial history is immutable. Append an approved adjustment instead.',
  'original item recognition is immutable'
);

update public.products set price = 999.99
where id = '82100000-0000-4000-8000-000000000001';
update public.product_business_data
set buying_price = 888.88, buying_price_verified_at = now()
where product_id = '82100000-0000-4000-8000-000000000001';
insert into public.business_settings (setting_key, setting_value)
values ('pgtap_financial_default', '999.99'::jsonb);
update public.order_items
set actual_unit_selling_price = 777.77, quantity = 3
where id = '82400000-0000-4000-8000-000000000001';
select is(
  (select row(gross_product_revenue_poisha, quantity, cogs_poisha)
   from public.order_item_financial_allocations
   where order_item_id = '82400000-0000-4000-8000-000000000001'),
  row(100::bigint, 1, 40::bigint),
  'later product, cost, order-item, and settings changes do not rewrite recognition'
);
update public.order_items
set actual_unit_selling_price = 1.00, quantity = 1
where id = '82400000-0000-4000-8000-000000000001';

select ok(
  (select all_reconciled
   from public.dashboard_product_allocation_reconciliation
   where order_id = '82300000-0000-4000-8000-000000000001'),
  'product allocations reconcile to immutable snapshots and adjusted Net Revenue'
);
select is(
  (select refund_events_needing_review
   from public.dashboard_product_allocation_data_quality),
  1::bigint,
  'the single ambiguous legacy refund appears in data-quality reporting'
);
select is(
  (
    select overallocated_product_refund_items
      + overallocated_delivery_refund_items
      + overallocated_returned_items
      + resellable_returns_awaiting_inspection
      + non_delivered_product_allocations
      + resellable_returns_missing_cogs_evidence
      + inventory_restoration_mismatches
      + mutable_item_snapshot_mismatches
    from public.dashboard_product_allocation_data_quality
  ),
  0::bigint,
  'scoped refunds, returns, COGS reversals, and restoration movements reconcile'
);
select ok(
  position(
    'for update' in lower(pg_get_functiondef(
      'public.dashboard_validate_refund_adjustment()'::regprocedure
    ))
  ) > 0
  and exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'order_financial_adjustments_idempotency_uidx'
      and indexdef ilike '%unique%order_id%idempotency_key%'
  ) and exists (
    select 1 from pg_constraint
    where conname = 'order_return_events_idempotency_key'
  ) and exists (
    select 1 from pg_constraint
    where conname = 'order_return_inspections_return_event_id_key'
  ),
  'row locking and the unique idempotency index protect concurrent refund/return writes'
);
select is(
  (select stock from public.products
   where id = '82100000-0000-4000-8000-000000000001'),
  11,
  'recognition and refunds do not change inventory'
);

set local role authenticated;
select throws_ok(
  $$select * from public.get_dashboard_product_financials(
    '2026-07-17', '2026-07-17', 'Website', null, 'Delivered',
    null, null, 100, 0
  )$$,
  '23514',
  'Product financials contain refund evidence marked needs_review.',
  'authoritative product reporting fails closed for ambiguous legacy refunds'
);
select is(
  (
    select count(*) from public.get_dashboard_product_financials(
      '2026-07-17', '2026-07-17', 'WhatsApp',
      '82200000-0000-4000-8000-000000000001', 'Delivered',
      null, null, 100, 0
    )
  ),
  2::bigint,
  'date, channel, campaign, and Delivered filters return product rows'
);
select is(
  (
    select row(
      sum(gross_product_revenue), sum(allocated_delivery_revenue),
      sum(allocated_discount), sum(allocated_refund),
      sum(adjusted_product_net_revenue), sum(delivered_units)::bigint,
      sum(returned_units)::bigint
    )
    from public.get_dashboard_product_financials(
      '2026-07-17', '2026-07-17', 'WhatsApp',
      '82200000-0000-4000-8000-000000000001', 'Delivered',
      null, null, 100, 0
    )
  ),
  row(
    2.00::numeric, 0.01::numeric, 0.01::numeric,
    2.00::numeric, 0.00::numeric, 3::bigint, 0::bigint
  ),
  'Top Products exposes distinct revenue, delivery, discount, refund, net, delivered, and returned measures'
);
select is(
  (
    select row(recognized_cogs, gross_profit, contribution_profit)
    from public.get_dashboard_product_financials(
      '2026-07-17', '2026-07-17', 'WhatsApp', null, 'Delivered',
      '82100000-0000-4000-8000-000000000001', null, 100, 0
    )
  ),
  row(0.40::numeric, -0.40::numeric, null::numeric),
  'refunds reverse revenue only while COGS remains recognized and fulfillment NULL propagates'
);
select ok(
  (select recognized_cogs is null and gross_profit is null
     and contribution_profit is null
   from public.get_dashboard_product_financials(
     '2026-07-17', '2026-07-17', 'WhatsApp', null, 'Delivered',
     '82100000-0000-4000-8000-000000000002', null, 100, 0
   )),
  'unknown COGS keeps product profit measures NULL'
);
select is(
  (
    select row(
      delivered_units, returned_units, adjusted_product_net_revenue,
      recognized_cogs, gross_profit, contribution_profit
    )
    from public.get_dashboard_product_financials(
      '2026-07-17', '2026-07-17', 'ReturnQA', null, 'Delivered',
      '82100000-0000-4000-8000-000000000001', null, 100, 0
    )
  ),
  row(
    5::bigint, 4::bigint, 0.00::numeric,
    1.20::numeric, -1.20::numeric, -2.10::numeric
  ),
  'Top Products preserves delivered units and separately reports returned units and net COGS'
);
select is(
  (
    select count(*) from public.get_dashboard_product_financials(
      '2026-07-17', '2026-07-17', 'WhatsApp', null, 'Pending',
      null, null, 100, 0
    )
  ),
  0::bigint,
  'non-Delivered status filters return no recognized product financials'
);
select is(
  (
    select count(*) from public.get_dashboard_product_financials(
      '2026-07-18', '2026-07-18', 'WhatsApp', null, 'Delivered',
      null, null, 100, 0
    )
  ),
  0::bigint,
  'Asia/Dhaka business-date filtering uses immutable snapshot dates'
);
reset role;

select * from finish();
rollback;
