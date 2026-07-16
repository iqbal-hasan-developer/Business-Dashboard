-- DEVELOPMENT SQL EDITOR ONLY. ROLLBACK-ONLY SYNTHETIC FIXTURES.
-- Requires the reviewed development product-allocation proposal.
-- Confirm the breadcrumb is NexaNotion Business Dashboard Dev.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table product_allocation_fixture_ids (
  name text primary key,
  id uuid not null,
  stock_before integer
) on commit drop;

insert into product_allocation_fixture_ids values
  ('category', '70000000-0000-4000-8000-000000000001', null),
  ('product_a', '71000000-0000-4000-8000-000000000001', 20),
  ('product_b', '71000000-0000-4000-8000-000000000002', 30),
  ('product_unknown', '71000000-0000-4000-8000-000000000003', 40),
  ('order_awkward', '72000000-0000-4000-8000-000000000001', null),
  ('order_full_refund', '72000000-0000-4000-8000-000000000002', null),
  ('order_cancelled', '72000000-0000-4000-8000-000000000003', null),
  ('order_resellable', '72000000-0000-4000-8000-000000000004', null),
  ('order_damaged', '72000000-0000-4000-8000-000000000005', null),
  ('order_ambiguous', '72000000-0000-4000-8000-000000000006', null),
  ('item_a_awkward', '73000000-0000-4000-8000-000000000001', null),
  ('item_b_awkward', '73000000-0000-4000-8000-000000000002', null),
  ('item_unknown_awkward', '73000000-0000-4000-8000-000000000003', null),
  ('item_a_full', '73000000-0000-4000-8000-000000000004', null),
  ('item_b_full', '73000000-0000-4000-8000-000000000005', null),
  ('item_cancelled', '73000000-0000-4000-8000-000000000006', null),
  ('item_resellable', '73000000-0000-4000-8000-000000000007', null),
  ('item_damaged', '73000000-0000-4000-8000-000000000008', null),
  ('item_ambiguous', '73000000-0000-4000-8000-000000000009', null);

insert into public.categories (id, name, slug)
values (
  '70000000-0000-4000-8000-000000000001',
  'PRODUCT ALLOCATION FIXTURE',
  'product-allocation-fixture'
);

insert into public.products (
  id, category_id, name, slug, price, stock, sku, is_active
) values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 1.00, 20, 'FIX-A', true
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000001',
    'Fixture Product B', 'fixture-product-b', 0.50, 30, 'FIX-B', true
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000001',
    'Fixture Unknown Cost', 'fixture-product-unknown', 0.25, 40,
    'FIX-UNKNOWN', true
  );

insert into public.product_business_data (
  product_id, buying_price, buying_price_verified_at
) values
  ('71000000-0000-4000-8000-000000000001', 0.40, now()),
  ('71000000-0000-4000-8000-000000000002', 0.20, now());

insert into public.orders (
  id, order_number, customer_name, customer_phone, customer_address,
  delivery_area, payment_method, payment_status, order_status, subtotal,
  delivery_charge, total, order_date, customer_location, sales_channel,
  dashboard_order_status, dashboard_payment_status, settlement_status,
  discount_amount, refund_amount, refund_scope, return_disposition,
  refund_review_status, courier_cost_snapshot, packaging_cost_snapshot
) values
  (
    '72000000-0000-4000-8000-000000000001',
    'ALLOC-AWKWARD-001', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Inside Dhaka', 'cod', 'unpaid', 'pending',
    3.00, 0.01, 3.00, '2026-07-17', 'Inside Dhaka', 'WhatsApp',
    'Pending', 'Unpaid', 'Awaiting', 0.01, 0, 'product_only',
    'not_applicable', 'resolved', 0.02, null
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    'ALLOC-FULL-002', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Outside Dhaka', 'bkash', 'verified', 'pending',
    10.00, 1.00, 11.00, '2026-07-18', 'Outside Dhaka', 'Website',
    'Pending', 'Paid', 'Not Applicable', 0, 0, 'product_only',
    'not_applicable', 'resolved', 1.00, 0.50
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    'ALLOC-CANCELLED-003', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Inside Dhaka', 'nagad', 'verified', 'cancelled',
    99.00, 0, 99.00, '2026-07-19', 'Inside Dhaka', 'Facebook Page',
    'Cancelled', 'Paid', 'Not Applicable', 0, 0, null,
    'not_applicable', 'resolved', null, null
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    'ALLOC-RESELLABLE-004', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Inside Dhaka', 'cod', 'unpaid', 'pending',
    2.00, 0, 2.00, '2026-07-19', 'Inside Dhaka', 'ReturnQA',
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', 0.20, 0.10
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    'ALLOC-DAMAGED-005', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Inside Dhaka', 'cod', 'unpaid', 'pending',
    2.00, 0, 2.00, '2026-07-19', 'Inside Dhaka', 'ReturnQA',
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', 0.20, 0.10
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    'ALLOC-AMBIGUOUS-006', 'Synthetic customer', '00000000000',
    'Synthetic address', 'Inside Dhaka', 'cod', 'unpaid', 'pending',
    1.00, 0, 1.00, '2026-07-19', 'Inside Dhaka', 'Website',
    'Pending', 'Unpaid', 'Awaiting', 0, 0, null,
    'not_applicable', 'resolved', null, null
  );

insert into public.order_items (
  id, order_id, product_id, product_name, product_slug, unit_price,
  quantity, line_total, actual_unit_selling_price
) values
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 1.00, 1, 1.00, 1.00
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'Fixture Product B', 'fixture-product-b', 0.50, 2, 1.00, 0.50
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003',
    'Fixture Unknown Cost', 'fixture-product-unknown', 0.25, 4, 1.00, 0.25
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 6.00, 1, 6.00, 6.00
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Fixture Product B', 'fixture-product-b', 2.00, 2, 4.00, 2.00
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 99.00, 1, 99.00, 99.00
  ),
  (
    '73000000-0000-4000-8000-000000000007',
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 1.00, 2, 2.00, 1.00
  ),
  (
    '73000000-0000-4000-8000-000000000008',
    '72000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 1.00, 2, 2.00, 1.00
  ),
  (
    '73000000-0000-4000-8000-000000000009',
    '72000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000001',
    'Fixture Product A', 'fixture-product-a', 1.00, 1, 1.00, 1.00
  );

update public.orders
set order_status = 'delivered', dashboard_order_status = 'Delivered'
where id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000005',
  '72000000-0000-4000-8000-000000000006'
);
set constraints dashboard_capture_delivered_snapshot immediate;

-- Product-only fallback: the awkward two-poisha event spills across two item
-- UUIDs and cannot consume the separately tracked delivery poisha.
insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'refund', 0.02, '2026-07-18', 'approved_backfill',
  'proportional_remaining', 'product_only', 'not_returned', 'resolved',
  'fixture-product-fallback-001'
);

-- Known product: direct three poisha to Product B.
insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope,
  return_disposition, refund_review_status,
  item_allocation_request, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000001',
  'refund', 0.03, '2026-07-18', 'approved_backfill', 'explicit',
  'product_only', 'not_returned', 'resolved',
  jsonb_build_array(jsonb_build_object(
    'order_item_id', '73000000-0000-4000-8000-000000000002',
    'refund_poisha', 3
  )),
  'fixture-product-explicit-002'
);

-- Delivery can be refunded only because the event says delivery_only.
insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000001',
  'refund', 0.01, '2026-07-18', 'approved_backfill',
  'proportional_remaining', 'delivery_only', 'not_applicable', 'resolved',
  'fixture-delivery-003'
);

-- Full-order example: one earlier product-only refund, then all remaining
-- product and delivery capacity in a single full_order event.
insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000002',
  'refund', 1.00, '2026-07-19', 'approved_backfill',
  'proportional_remaining', 'product_only', 'not_returned', 'resolved',
  'fixture-full-partial-004'
);

insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000005',
  '72000000-0000-4000-8000-000000000002',
  'refund', 10.00, '2026-07-19', 'approved_backfill',
  'proportional_remaining', 'full_order', 'not_returned', 'resolved',
  'fixture-full-complete-005'
);

-- Monetary refunds and returns are separate business events.
insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000006',
  '72000000-0000-4000-8000-000000000004',
  'refund', 2.00, '2026-07-19', 'approved_backfill',
  'proportional_remaining', 'product_only', 'not_applicable', 'resolved',
  'fixture-resellable-refund-006'
);

insert into public.order_financial_adjustments (
  id, order_id, adjustment_type, amount_delta, occurred_on,
  adjustment_source, allocation_method, refund_scope, return_disposition,
  refund_review_status, idempotency_key
) values (
  '74000000-0000-4000-8000-000000000007',
  '72000000-0000-4000-8000-000000000005',
  'refund', 2.00, '2026-07-19', 'approved_backfill',
  'proportional_remaining', 'product_only', 'not_applicable', 'resolved',
  'fixture-damaged-refund-007'
);

insert into public.order_return_events (
  id, order_id, return_disposition, occurred_on, return_source,
  item_request, idempotency_key
) values
  (
    '75000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000004',
    'returned_resellable', '2026-07-19', 'approved_backfill',
    '[{"order_item_id":"73000000-0000-4000-8000-000000000007","returned_quantity":2}]'::jsonb,
    'fixture-resellable-return-001'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000005',
    'returned_damaged', '2026-07-19', 'approved_backfill',
    '[{"order_item_id":"73000000-0000-4000-8000-000000000008","returned_quantity":2}]'::jsonb,
    'fixture-damaged-return-002'
  );

do $return_not_automatic$
begin
  if exists (
    select 1 from public.inventory_restoration_movements
    where order_id in (
      '72000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000005'
    )
  ) then
    raise exception 'Recording a return automatically created restoration.';
  end if;
end
$return_not_automatic$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.dashboard_user_profiles
   where role = 'owner' and is_active order by user_id limit 1),
  true
);
set local role authenticated;
select public.inspect_dashboard_return(
  '75000000-0000-4000-8000-000000000001',
  'confirmed_resellable', 'fixture-resellable-inspection-001', '2026-07-20'
);
select public.inspect_dashboard_return(
  '75000000-0000-4000-8000-000000000002',
  'confirmed_damaged', 'fixture-damaged-inspection-002', '2026-07-20'
);
reset role;

-- Header-only legacy evidence has no reliable scope/disposition. The capture
-- trigger must quarantine it rather than infer product_only or full_order.
update public.orders
set refund_amount = 0.50,
    refund_scope = null,
    return_disposition = null,
    refund_review_status = 'needs_review'
where id = '72000000-0000-4000-8000-000000000006';

-- Current product, buying-cost, item, and settings changes cannot rewrite the
-- immutable allocation. Restore the mutable item after proving the snapshot.
update public.products
set price = 999.99
where id = '71000000-0000-4000-8000-000000000001';
update public.product_business_data
set buying_price = 888.88, buying_price_verified_at = now()
where product_id = '71000000-0000-4000-8000-000000000001';
insert into public.business_settings (setting_key, setting_value)
values ('fixture_packaging_default', '999.99'::jsonb);
update public.order_items
set actual_unit_selling_price = 777.77, quantity = 7
where id = '73000000-0000-4000-8000-000000000001';

do $immutable_snapshot_check$
begin
  if not exists (
    select 1 from public.order_item_financial_allocations
    where order_item_id = '73000000-0000-4000-8000-000000000001'
      and gross_product_revenue_poisha = 100 and quantity = 1
      and cogs_poisha = 40
  ) then
    raise exception 'Mutable changes rewrote immutable recognition.';
  end if;
end
$immutable_snapshot_check$;

update public.order_items
set actual_unit_selling_price = 1.00, quantity = 1
where id = '73000000-0000-4000-8000-000000000001';

do $expected_rejections$
begin
  begin
    insert into public.order_financial_adjustments (
      order_id, adjustment_type, amount_delta, occurred_on,
      adjustment_source, allocation_method, refund_scope,
      return_disposition, refund_review_status
    ) values (
      '72000000-0000-4000-8000-000000000002',
      'refund', 0.01, '2026-07-20', 'approved_backfill',
      'proportional_remaining', 'product_only', 'not_returned', 'resolved'
    );
    raise exception 'Over-refund unexpectedly succeeded.';
  exception when check_violation then null;
  end;

  begin
    insert into public.order_financial_adjustments (
      order_id, adjustment_type, amount_delta, occurred_on,
      adjustment_source, allocation_method, refund_scope,
      return_disposition, refund_review_status
    ) values (
      '72000000-0000-4000-8000-000000000001',
      'refund', -0.01, '2026-07-20', 'approved_backfill',
      'proportional_remaining', 'product_only', 'not_returned', 'resolved'
    );
    raise exception 'Negative refund unexpectedly succeeded.';
  exception when check_violation then null;
  end;

  begin
    insert into public.order_financial_adjustments (
      order_id, adjustment_type, amount_delta, occurred_on,
      adjustment_source, allocation_method, refund_scope, return_disposition,
      refund_review_status, idempotency_key
    ) values (
      '72000000-0000-4000-8000-000000000001',
      'refund', 0.01, '2026-07-20', 'approved_backfill',
      'proportional_remaining', 'product_only', 'not_returned', 'resolved',
      'fixture-product-fallback-001'
    );
    raise exception 'Duplicate idempotency key unexpectedly succeeded.';
  exception when unique_violation then null;
  end;

  begin
    insert into public.order_financial_adjustments (
      order_id, adjustment_type, amount_delta, occurred_on,
      adjustment_source, allocation_method, refund_scope,
      return_disposition, refund_review_status, item_allocation_request
    ) values (
      '72000000-0000-4000-8000-000000000001',
      'refund', 1.00, '2026-07-20', 'approved_backfill', 'explicit',
      'product_only', 'not_returned', 'resolved',
      '[{"order_item_id":"73000000-0000-4000-8000-000000000001","refund_poisha":100}]'::jsonb
    );
    raise exception 'Explicit item over-allocation unexpectedly succeeded.';
  exception when check_violation then null;
  end;

  begin
    update public.order_item_financial_allocations
    set gross_product_revenue_poisha = gross_product_revenue_poisha + 1
    where order_item_id = '73000000-0000-4000-8000-000000000001';
    raise exception 'Immutable recognition allocation unexpectedly changed.';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.orders
    set refund_amount = 10.99
    where id = '72000000-0000-4000-8000-000000000002';
    raise exception 'Recognized refund unexpectedly decreased.';
  exception when check_violation then null;
  end;
end
$expected_rejections$;

do $assert_product_allocations$
declare
  quality record;
begin
  if (
    select count(*) from public.order_financial_snapshots
    where order_id in (
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000003',
      '72000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000005',
      '72000000-0000-4000-8000-000000000006'
    )
  ) <> 5 then
    raise exception 'Expected five Delivered snapshots and no cancelled snapshot.';
  end if;

  if (
    select count(*) from public.order_item_financial_allocations
    where order_id in (
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000005',
      '72000000-0000-4000-8000-000000000006'
    )
  ) <> 8 then
    raise exception 'Expected one immutable allocation for each Delivered item.';
  end if;
  if exists (
    select 1 from public.order_item_financial_allocations
    where order_id = '72000000-0000-4000-8000-000000000003'
  ) then
    raise exception 'A cancelled prepaid order received product recognition.';
  end if;

  if (
    select row(
      sum(gross_product_revenue_poisha), sum(delivery_revenue_poisha),
      sum(discount_poisha), sum(original_refund_poisha)
    )
    from public.order_item_financial_allocations
    where order_id = '72000000-0000-4000-8000-000000000001'
  ) is distinct from row(300::numeric, 1::numeric, 1::numeric, 0::numeric) then
    raise exception 'Awkward order components did not reconcile.';
  end if;

  if (
    select count(*)
    from public.order_item_refund_allocations as refund
    join public.order_item_financial_allocations as allocation
      on allocation.id = refund.recognition_allocation_id
    where refund.adjustment_id = '74000000-0000-4000-8000-000000000001'
      and refund.product_refund_poisha = 1
      and refund.delivery_refund_poisha = 0
  ) <> 2 then
    raise exception 'Fallback refund did not spill across remaining products.';
  end if;

  if not exists (
    select 1 from public.order_item_refund_allocations as refund
    join public.order_item_financial_allocations as allocation
      on allocation.id = refund.recognition_allocation_id
    where refund.adjustment_id = '74000000-0000-4000-8000-000000000002'
      and allocation.order_item_id = '73000000-0000-4000-8000-000000000002'
      and refund.product_refund_poisha = 3
      and refund.delivery_refund_poisha = 0
  ) then
    raise exception 'Explicit item-directed product refund did not match.';
  end if;

  if (
    select row(
      coalesce(sum(product_refund_poisha), 0),
      coalesce(sum(delivery_refund_poisha), 0)
    )
    from public.order_item_refund_allocations
    where order_id = '72000000-0000-4000-8000-000000000001'
  ) is distinct from row(5::numeric, 1::numeric) then
    raise exception 'Product and delivery refund scopes did not remain separate.';
  end if;

  if (
    select row(recognized_refund_amount, net_revenue)
    from public.dashboard_order_financials
    where order_id = '72000000-0000-4000-8000-000000000001'
  ) is distinct from row(0.06::numeric, 2.94::numeric) then
    raise exception 'Partial and multiple refunds did not reconcile.';
  end if;
  if (
    select net_revenue from public.dashboard_order_financials
    where order_id = '72000000-0000-4000-8000-000000000002'
  ) <> 0 then
    raise exception 'Full-order refund did not reduce Net Revenue to zero.';
  end if;
  if (
    select recognized_cogs from public.dashboard_order_financials
    where order_id = '72000000-0000-4000-8000-000000000002'
  ) is distinct from 0.80::numeric then
    raise exception 'Full refund without return did not retain COGS.';
  end if;
  if (
    select row(
      sum(product_refund_poisha), sum(delivery_refund_poisha)
    )
    from public.order_item_refund_allocations
    where adjustment_id = '74000000-0000-4000-8000-000000000005'
  ) is distinct from row(900::numeric, 100::numeric) then
    raise exception 'Full-order refund did not consume product and delivery remainder.';
  end if;

  if not exists (
    select 1 from public.order_item_financial_allocations
    where order_item_id = '73000000-0000-4000-8000-000000000003'
      and cogs_poisha is null and packaging_cost_poisha is null
  ) then
    raise exception 'Unknown product or fulfillment costs became zero.';
  end if;
  if (
    select row(net_revenue, recognized_cogs)
    from public.dashboard_order_financials
    where order_id = '72000000-0000-4000-8000-000000000004'
  ) is distinct from row(0.00::numeric, 0.00::numeric) then
    raise exception 'Resellable return did not reverse revenue and COGS.';
  end if;
  if (
    select row(net_revenue, recognized_cogs)
    from public.dashboard_order_financials
    where order_id = '72000000-0000-4000-8000-000000000005'
  ) is distinct from row(0.00::numeric, 0.80::numeric) then
    raise exception 'Damaged return did not retain COGS.';
  end if;
  if (
    select coalesce(sum(quantity_delta), 0)
    from public.inventory_restoration_movements
    where order_id = '72000000-0000-4000-8000-000000000004'
  ) <> 2 or exists (
    select 1 from public.inventory_restoration_movements
    where order_id = '72000000-0000-4000-8000-000000000005'
  ) then
    raise exception 'Return disposition produced the wrong restoration movement.';
  end if;
  if not exists (
    select 1 from public.order_financial_adjustments
    where order_id = '72000000-0000-4000-8000-000000000006'
      and refund_review_status = 'needs_review'
      and refund_scope is null and return_disposition is null
  ) then
    raise exception 'Ambiguous legacy refund was not quarantined.';
  end if;
  if exists (
    select 1 from public.dashboard_product_allocation_reconciliation
    where order_id in (
      '72000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      '72000000-0000-4000-8000-000000000005'
    ) and not all_reconciled
  ) then
    raise exception 'Product allocations did not reconcile to order snapshots.';
  end if;

  select * into quality
  from public.dashboard_product_allocation_data_quality;
  if quality.recognized_orders_missing_item_allocations <> 0
     or quality.duplicate_order_item_allocations <> 0
     or quality.incomplete_order_allocations <> 0
     or quality.order_allocation_mismatches <> 1
     or quality.refund_events_missing_allocations <> 1
     or quality.refund_event_amount_mismatches <> 1
     or quality.refund_event_scope_mismatches <> 1
     or quality.overallocated_product_refund_items <> 0
     or quality.overallocated_delivery_refund_items <> 0
     or quality.refund_events_needing_review <> 1
     or quality.return_events_missing_allocations <> 0
     or quality.resellable_returns_awaiting_inspection <> 0
     or quality.overallocated_returned_items <> 0
     or quality.resellable_returns_missing_cogs_evidence <> 0
     or quality.inventory_restoration_mismatches <> 0
     or quality.non_delivered_product_allocations <> 0
     or quality.mutable_item_snapshot_mismatches <> 0 then
    raise exception 'A product-allocation data-quality check failed.';
  end if;

  if exists (
    select 1
    from public.products as product
    join product_allocation_fixture_ids as identifier
      on identifier.id = product.id
    where identifier.name like 'product_%'
      and product.stock is distinct from identifier.stock_before
  ) then
    raise exception 'Inventory changed during product financial fixtures.';
  end if;
  if position(
    'for update' in lower(pg_get_functiondef(
      'public.dashboard_validate_refund_adjustment()'::regprocedure
    ))
  ) = 0 or position(
    'return existing_adjustment.id' in lower(pg_get_functiondef(
      'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)'::regprocedure
    ))
  ) = 0 or position(
    'return existing_event.id' in lower(pg_get_functiondef(
      'public.record_dashboard_return(uuid,text,text,date,jsonb)'::regprocedure
    ))
  ) = 0 or position(
    'only once' in lower(pg_get_functiondef(
      'public.inspect_dashboard_return(uuid,text,text,date)'::regprocedure
    ))
  ) = 0 or not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'order_financial_adjustments_idempotency_uidx'
      and indexdef ilike '%unique%order_id%idempotency_key%'
  ) then
    raise exception 'Concurrent refund/return protection is incomplete.';
  end if;
end
$assert_product_allocations$;

select
  allocation.order_id,
  allocation.order_item_id,
  allocation.sku_snapshot,
  allocation.quantity,
  allocation.gross_product_revenue_poisha,
  allocation.delivery_revenue_poisha,
  allocation.product_discount_poisha,
  allocation.delivery_discount_poisha,
  allocation.original_product_refund_poisha,
  allocation.original_delivery_refund_poisha,
  allocation.net_revenue_poisha,
  allocation.cogs_poisha,
  allocation.courier_cost_poisha,
  allocation.packaging_cost_poisha
from public.order_item_financial_allocations as allocation
where allocation.order_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
)
order by allocation.order_id, allocation.order_item_id;

select *
from public.dashboard_product_allocation_reconciliation
where order_id in (
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002'
)
order by order_id;

select * from public.dashboard_product_allocation_data_quality;

select
  product.id,
  product.stock,
  identifier.stock_before,
  product.stock is not distinct from identifier.stock_before
    as inventory_unchanged
from public.products as product
join product_allocation_fixture_ids as identifier on identifier.id = product.id
where identifier.name like 'product_%'
order by product.id;

rollback;
