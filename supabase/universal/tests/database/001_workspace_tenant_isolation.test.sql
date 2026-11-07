begin;
select plan(28);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'owner-a@example.invalid', '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'owner-b@example.invalid', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.workspaces (id, name, created_by)
values
  ('00000000-0000-4000-8000-000000000201', 'Sample workspace A', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000202', 'Sample workspace B', '00000000-0000-4000-8000-000000000102');

insert into public.workspace_memberships (workspace_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'owner'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'owner');

insert into public.stores (id, workspace_id, name, platform, base_url, created_by)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'Store A', 'custom', 'https://a.example.invalid', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 'Store B', 'custom', 'https://b.example.invalid', '00000000-0000-4000-8000-000000000102');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);

select is(public.current_workspace_role('00000000-0000-4000-8000-000000000201'), 'owner', 'member role resolves in its workspace');
select is(public.current_workspace_role('00000000-0000-4000-8000-000000000202'), null, 'membership does not resolve in another workspace');
select is((select count(*)::integer from public.workspaces), 1, 'workspace list is tenant-scoped');
select is((select count(*)::integer from public.stores), 1, 'store list is tenant-scoped');
select is((select count(*)::integer from public.workspace_memberships), 1, 'membership list is tenant-scoped');
select is((select count(*)::integer from public.list_workspace_members('00000000-0000-4000-8000-000000000201')), 1, 'members can read the directory for their workspace');
select is((select count(*)::integer from public.list_workspace_members('00000000-0000-4000-8000-000000000202')), 0, 'member directory does not disclose another workspace');

update public.stores
set name = 'Tampered store'
where id = '00000000-0000-4000-8000-000000000302';
select is((select name from public.stores where id = '00000000-0000-4000-8000-000000000302'), null, 'cross-workspace store cannot be read or changed');

select throws_ok(
  $$insert into public.workspace_memberships (workspace_id, user_id, role) values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000102', 'admin')$$,
  '42501',
  'workspace membership writes require an invitation workflow'
);

select throws_ok(
  $$insert into public.stores (workspace_id, name, platform, base_url, created_by) values ('00000000-0000-4000-8000-000000000201', 'Spoofed actor store', 'custom', 'https://spoofed.example.invalid', '00000000-0000-4000-8000-000000000102')$$,
  '42501',
  'store creation must record the authenticated actor'
);

select throws_ok(
  $$delete from public.workspaces where id = '00000000-0000-4000-8000-000000000202'$$,
  '42501',
  'workspace deletion is unavailable until a retention workflow exists'
);

select throws_ok(
  $$select public.create_workspace('   ')$$,
  '22023',
  'Workspace name must contain 1 to 120 characters.',
  'empty workspace names are rejected'
);

reset role;
select throws_ok(
  $$update public.workspace_memberships set is_active = false where workspace_id = '00000000-0000-4000-8000-000000000201' and user_id = '00000000-0000-4000-8000-000000000101'$$,
  '23514',
  'A workspace must retain at least one active owner.',
  'the last active workspace owner cannot be removed'
);

set local role authenticated;
select is(
  public.current_workspace_role(public.create_workspace('Created through setup')),
  'owner',
  'workspace creation atomically grants the creator the owner role'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select is((select count(*)::integer from public.save_workspace_product(
  '00000000-0000-4000-8000-000000000201', null, null, 'Commerce test item', null,
  'TEST-1', 'Test', null, array[]::text[], 'active', 'BDT', 10, 4,
  null, 'Default', '{}'::jsonb, 1
)), 1, 'workspace product and variant save together');

select is(public.adjust_workspace_inventory(
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301',
  (select id from public.product_variants where product_id = (select id from public.products where name = 'Commerce test item')),
  4, 'pgtap-stock-1', 'Initial count'
), 4, 'inventory adjustment is recorded');

select isnt(public.create_workspace_order(
  '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301',
  'TEST-ORDER-1', 'Test Customer', '01700000000', '{"address":"Dhaka"}'::jsonb, 'COD',
  jsonb_build_array(jsonb_build_object(
    'variant_id', (select id::text from public.product_variants where product_id = (select id from public.products where name = 'Commerce test item')),
    'quantity', 2, 'unit_price', 10
  )), 0, 5, 2, 0
), null::uuid, 'workspace order is created with immutable item snapshots');

select lives_ok($$select public.set_workspace_order_status(
  '00000000-0000-4000-8000-000000000201',
  (select id from public.orders where order_number = 'TEST-ORDER-1'), 'fulfilled', 'pending'
)$$, 'fulfillment records inventory and financial entries atomically');
select is((select quantity from public.inventory_levels where product_variant_id = (select product_variant_id from public.order_items where order_id = (select id from public.orders where order_number = 'TEST-ORDER-1'))), 2::numeric, 'fulfillment decrements variant stock');
select is((select amount from public.financial_entries where idempotency_key = 'order-revenue:' || (select id::text from public.orders where order_number = 'TEST-ORDER-1')), 20::numeric, 'fulfillment recognizes product revenue');
select is((select amount from public.financial_entries where idempotency_key = 'order-cogs:' || (select id::text from public.orders where order_number = 'TEST-ORDER-1')), 8::numeric, 'fulfillment recognizes snapshot COGS');

select isnt(public.record_workspace_refund(
  '00000000-0000-4000-8000-000000000201',
  (select id from public.orders where order_number = 'TEST-ORDER-1'), 2, 'Completed customer refund'
), null::uuid, 'manager can record completed refund evidence');
select is((select refund_total from public.orders where order_number = 'TEST-ORDER-1'), 2::numeric, 'refund updates the order refund total');
select lives_ok($$select public.save_workspace_customer_notes(
  '00000000-0000-4000-8000-000000000201',
  (select id from public.customers where phone = '01700000000'), 'Call before delivery'
)$$, 'customer notes use a workspace-authorized RPC');
select is((select notes from public.customers where phone = '01700000000'), 'Call before delivery', 'customer note is saved');
select is((public.workspace_reporting_metrics('00000000-0000-4000-8000-000000000201', current_date - 1, current_date + 1)->'totals'->0->>'revenue')::numeric, 120::numeric, 'reporting returns workspace recognized revenue');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select is((select count(*)::integer from public.orders), 0, 'another workspace cannot read the created order');
select throws_ok($$select public.record_workspace_refund(
  '00000000-0000-4000-8000-000000000201',
  (select id from public.orders where order_number = 'TEST-ORDER-1'), 1, 'forged'
)$$, '42501', 'cross-workspace refund write is denied');

select * from finish();
rollback;
