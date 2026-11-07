import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { applyUniversalMigrations } from "./apply-universal-migrations.mjs";
import { migrateLegacyWorkspace } from "./migrate-legacy-workspace.mjs";
import { join } from "node:path";

const ids = {
  sourceOwner: "00000000-0000-4000-8000-000000000001",
  targetOwner: "00000000-0000-4000-8000-000000000002",
  workspace: "00000000-0000-4000-8000-000000000003",
  store: "00000000-0000-4000-8000-000000000004",
  category: "00000000-0000-4000-8000-000000000005",
  product: "00000000-0000-4000-8000-000000000006",
  badProduct: "00000000-0000-4000-8000-000000000007",
  order: "00000000-0000-4000-8000-000000000008",
  badOrder: "00000000-0000-4000-8000-000000000009",
  item: "00000000-0000-4000-8000-000000000010",
  badItem: "00000000-0000-4000-8000-000000000011",
  expense: "00000000-0000-4000-8000-000000000012",
  duplicateOrder: "00000000-0000-4000-8000-000000000013",
  duplicateItem: "00000000-0000-4000-8000-000000000014",
  unsupported: "00000000-0000-4000-8000-000000000015",
  orphanOrder: "00000000-0000-4000-8000-000000000016",
  orphanItem: "00000000-0000-4000-8000-000000000017",
  missingProduct: "00000000-0000-4000-8000-000000000018",
};

const sourceSchema = `
create table public.dashboard_user_profiles(user_id uuid primary key, role text, is_active boolean);
create table public.categories(id uuid primary key, name text, slug text, is_active boolean);
create table public.products(id uuid primary key, category_id uuid, name text, slug text, sku text, price text, stock text, is_active boolean, created_at timestamptz, updated_at timestamptz, image_url text, description text);
create table public.product_business_data(product_id uuid primary key, sku_override text, variation text, buying_price text, buying_price_verified_at timestamptz, reorder_level text, internal_notes text, updated_at timestamptz);
create table public.orders(id uuid primary key, order_number text, customer_name text, customer_phone text, customer_address text, delivery_area text, customer_note text, payment_method text, payment_status text, order_status text, dashboard_order_status text, dashboard_payment_status text, subtotal text, discount_amount text, delivery_charge text, courier_cost_snapshot text, total text, refund_amount text, created_at timestamptz, updated_at timestamptz, order_date timestamptz, external_reference text, courier text, sales_channel text, campaign_id uuid, campaign_name_snapshot text, settlement_status text);
create table public.order_items(id uuid primary key, order_id uuid, product_id uuid, product_name text, unit_price text, actual_unit_selling_price text, quantity text, line_total text, buying_cost_snapshot text, sku_snapshot text, product_image_url text, product_slug text, created_at timestamptz);
create table public.order_financial_snapshots(order_id uuid, recognition_status text, cogs_complete boolean, cogs text, product_revenue text, delivery_revenue text, discount_amount text, courier_cost text, packaging_cost text, recognized_at timestamptz, created_at timestamptz);
create table public.expenses(id uuid primary key, expense_date date, category_key text, accounting_class text, description text, amount text, created_at timestamptz, updated_at timestamptz, campaign_id uuid, sales_channel text, reference text, payment_method text);
create table public.dashboard_active_source_fundings(source_type text, source_id uuid, funding_treatment text);
create table public.cash_movements(id uuid primary key, amount text);
`;

let source;
let targets = [];
afterEach(async () => {
  await source?.close();
  for (const target of targets) await target.close();
  source = undefined;
  targets = [];
});

async function createSource() {
  source = new PGlite();
  await source.exec(sourceSchema);
  await source.query("insert into public.dashboard_user_profiles values($1,'owner',true)", [ids.sourceOwner]);
  await source.query("insert into public.categories values($1,'Synthetic goods','synthetic-goods',true)", [ids.category]);
  await source.query("insert into public.products values($1,$2,'Fixture product','fixture-product','FIX-1','12.50','8',true,now(),now(),'https://example.invalid/item.jpg','Fictional product')", [ids.product, ids.category]);
  await source.query("insert into public.product_business_data values($1,'FIX-1-A','Default',null,null,'2',null,now())", [ids.product]);
  await source.query("insert into public.orders(id,order_number,customer_name,customer_phone,customer_address,delivery_area,payment_method,payment_status,order_status,subtotal,delivery_charge,total,created_at,order_date,discount_amount,refund_amount) values($1,'SYN-100','Sample Buyer','01700000000','Fictional address','Test area','COD','paid','delivered','12.50','0','12.50',now(),now(),'0','0')", [ids.order]);
  await source.query("insert into public.order_items(id,order_id,product_id,product_name,unit_price,actual_unit_selling_price,quantity,line_total,created_at) values($1,$2,$3,'Fixture product','12.50','12.50','1','12.50',now())", [ids.item, ids.order, ids.product]);
  await source.query("insert into public.order_financial_snapshots values($1,'Delivered',true,'5.00','12.50','0','0',null,null,now(),now())", [ids.order]);
  await source.query("insert into public.expenses values($1,current_date,'office','operating_expense','Fictional test expense','5.00',now(),now(),null,null,null,'cash')", [ids.expense]);
  await source.query("insert into public.dashboard_active_source_fundings values('expense',$1,'unpaid')", [ids.expense]);
  await source.query("insert into public.cash_movements values($1,'2.00')", [ids.unsupported]);
  return source;
}

async function createTarget() {
  const target = new PGlite({ extensions: { pgcrypto } });
  targets.push(target);
  await target.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
  `);
  await applyUniversalMigrations(target, {
    migrationsPath: join(process.cwd(), "supabase", "universal", "migrations"),
    executeSql: (sql) => target.exec(sql),
    write: () => undefined,
  });
  await target.query("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.invalid',now()),($2,'source-owner@example.invalid',now())", [ids.targetOwner, ids.sourceOwner]);
  await target.query("insert into public.workspaces(id,name,created_by) values($1,'Synthetic workspace',$2)", [ids.workspace, ids.targetOwner]);
  await target.query("insert into public.workspace_memberships(workspace_id,user_id,role) values($1,$2,'owner')", [ids.workspace, ids.targetOwner]);
  await target.query("insert into public.stores(id,workspace_id,name,platform,base_url,created_by) values($1,$2,'Import store','custom','https://fixture.example.invalid',$3)", [ids.store, ids.workspace, ids.targetOwner]);
  return target;
}

function context(apply, runId, write = () => undefined) {
  return { sourceOwnerId: ids.sourceOwner, targetOwnerId: ids.targetOwner, workspaceId: ids.workspace, storeId: ids.store, apply, runId, write };
}

async function canonicalImportState(target, runId) {
  const definitions = {
    products: "id,workspace_id,name,category,status,currency,price",
    product_variants: "id,workspace_id,product_id,sku,name,currency,price,reorder_level",
    product_variant_costs: "workspace_id,product_variant_id,cost_price,private_notes",
    customers: "id,workspace_id,full_name,phone",
    orders: "id,workspace_id,store_id,customer_id,order_number,status,total,refund_total",
    order_items: "id,workspace_id,order_id,product_variant_id,product_name_snapshot,quantity,unit_price,line_total",
    inventory_levels: "workspace_id,store_id,product_variant_id,quantity,reorder_level",
    inventory_movements: "workspace_id,store_id,product_variant_id,movement_type,quantity_delta,idempotency_key,source_reference,note,actor_id",
    refunds: "id,workspace_id,order_id,amount,status",
    expenses: "id,workspace_id,store_id,category,amount,currency,expense_date,status,accounting_class",
    financial_entries: "id,workspace_id,store_id,order_id,entry_type,amount,currency,idempotency_key",
  };
  const state = {};
  for (const [table, columns] of Object.entries(definitions)) {
    state[table] = (await target.query(`select ${columns} from public.${table} where workspace_id=$1`, [ids.workspace])).rows
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  state.identities = (await target.query("select source_table,source_id,target_table,target_id,source_hash from public.legacy_import_records where workspace_id=$1 order by source_table,source_id", [ids.workspace])).rows;
  state.holds = (await target.query("select source_table,source_id,reason_code,(resolved_at is not null) as resolved from public.legacy_import_holds where workspace_id=$1 order by source_table,source_id", [ids.workspace])).rows;
  const run = (await target.query("select status,current_stage,last_completed_stage,summary from public.legacy_import_runs where id=$1", [runId])).rows[0];
  state.run = { ...run, summary: { target_counts_after: run.summary.target_counts_after, active_holds: run.summary.active_holds, last_completed_stage: run.summary.last_completed_stage } };
  return state;
}

async function actualOutcome(target, row) {
  const { rows: identity } = await target.query("select target_table,target_id from public.legacy_import_records where workspace_id=$1 and source_table=$2 and source_id=$3", [ids.workspace, row.source_table, row.source_id]);
  if (identity.length) return { expected_destination_table: identity[0].target_table, expected_destination_id: identity[0].target_id, expected_action: "imported", reason: null };
  const { rows: hold } = await target.query("select reason_code from public.legacy_import_holds where workspace_id=$1 and source_table=$2 and source_id=$3 and resolved_at is null", [ids.workspace, row.source_table, row.source_id]);
  return { expected_destination_table: row.expected_destination_table, expected_destination_id: row.expected_destination_id, expected_action: row.expected_action === "rejected" ? "rejected" : "held", reason: hold[0]?.reason_code ?? row.reason };
}

describe("legacy importer synthetic database fixtures", () => {
  it("matches row-level predictions to clean apply, keeps dry-run non-mutating, and is idempotent", async () => {
    const src = await createSource();
    const dryTarget = await createTarget();
    const mapping = context(false, "10000000-0000-4000-8000-000000000001");
    const dryRun = await migrateLegacyWorkspace(src, dryTarget, mapping);
    expect(dryRun.preflight.filter((row) => row.expected_action === "imported").map((row) => row.source_table).sort()).toEqual(["expenses", "legacy_order_customer", "order_financial_snapshots", "order_financial_snapshots", "order_items", "orders", "product_business_data", "products"]);
    expect((await dryTarget.query("select count(*)::int as count from public.products")).rows[0].count).toBe(0);
    expect((await dryTarget.query("select count(*)::int as count from public.legacy_import_records")).rows[0].count).toBe(0);
    expect((await dryTarget.query("select count(*)::int as count from public.legacy_import_holds")).rows[0].count).toBe(0);

    const applyTarget = await createTarget();
    const applyCtx = context(true, dryRun.runId);
    await migrateLegacyWorkspace(src, applyTarget, applyCtx);
    for (const row of dryRun.preflight) {
      const actual = await actualOutcome(applyTarget, row);
      expect(actual, `${row.source_table}:${row.source_id}`).toEqual({
        expected_destination_table: row.expected_destination_table,
        expected_destination_id: row.expected_destination_id,
        expected_action: row.expected_action,
        reason: row.reason,
      });
    }
    const beforeRetry = await applyTarget.query("select count(*)::int as count from public.expenses where workspace_id=$1", [ids.workspace]);
    expect(beforeRetry.rows[0].count).toBe(1);
    await migrateLegacyWorkspace(src, applyTarget, applyCtx);
    expect((await applyTarget.query("select count(*)::int as count from public.expenses where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await applyTarget.query("select count(*)::int as count from public.products where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await applyTarget.query("select count(*)::int as count from public.inventory_levels where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await applyTarget.query("select count(*)::int as count from public.financial_entries where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(3);
  }, 60000);

  it("records a transient write failure as a hold and retries it safely", async () => {
    const src = await createSource();
    const target = await createTarget();
    const ctx = context(true, "10000000-0000-4000-8000-000000000002");
    let failExpenseInsert = true;
    const flakyTarget = {
      query(sql, values) {
        if (failExpenseInsert && String(sql).startsWith("insert into public.expenses(")) {
          failExpenseInsert = false;
          throw new Error("synthetic transient database failure");
        }
        return target.query(sql, values);
      },
    };
    await migrateLegacyWorkspace(src, flakyTarget, ctx);
    expect((await target.query("select reason_code from public.legacy_import_holds where workspace_id=$1 and source_table='expenses' and source_id=$2 and resolved_at is null", [ids.workspace, ids.expense])).rows[0].reason_code).toBe("destination_write_failed");
    await migrateLegacyWorkspace(src, flakyTarget, ctx);
    expect((await target.query("select count(*)::int as count from public.expenses where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await target.query("select count(*)::int as count from public.legacy_import_holds where workspace_id=$1 and source_table='expenses' and source_id=$2 and resolved_at is null", [ids.workspace, ids.expense])).rows[0].count).toBe(0);
  }, 60000);

  it("rolls back a failed order and its child item, then resumes without duplicates", async () => {
    const src = await createSource();
    const target = await createTarget();
    const ctx = context(true, "10000000-0000-4000-8000-000000000005");
    let failItemInsert = true;
    const flakyTarget = {
      query(sql, values) {
        if (failItemInsert && String(sql).startsWith("insert into public.order_items(")) {
          failItemInsert = false;
          throw new Error("synthetic transient order-item failure");
        }
        return target.query(sql, values);
      },
    };
    await migrateLegacyWorkspace(src, flakyTarget, ctx);
    expect((await target.query("select count(*)::int as count from public.orders where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(0);
    expect((await target.query("select count(*)::int as count from public.order_items where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(0);
    await migrateLegacyWorkspace(src, flakyTarget, ctx);
    expect((await target.query("select count(*)::int as count from public.orders where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await target.query("select count(*)::int as count from public.order_items where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
    expect((await target.query("select count(*)::int as count from public.customers where workspace_id=$1", [ids.workspace])).rows[0].count).toBe(1);
  }, 60000);

  it.each([
    ["after products", "Importing orders", "orders", "products", 1],
    ["after orders", "Importing expenses", "expenses", "orders", 2],
    ["after expense rows", "Expenses:", "expenses", "orders", 3],
    ["after hold rows", "Holds:", "holds", "expenses", 3],
  ])("resumes an interrupted import %s to the same final records", async (_label, message, expectedCurrent, expectedLast, expectedSkipped) => {
    const src = await createSource();
    const runId = "10000000-0000-4000-8000-000000000006";
    const uninterrupted = await createTarget();
    await migrateLegacyWorkspace(src, uninterrupted, context(true, runId));
    const expected = await canonicalImportState(uninterrupted, runId);

    const resumed = await createTarget();
    let interrupted = false;
    const interruptedContext = context(true, runId, (output) => {
      if (!interrupted && output.startsWith(message)) {
        interrupted = true;
        throw new Error("synthetic process interruption");
      }
    });
    await expect(migrateLegacyWorkspace(src, resumed, interruptedContext)).rejects.toThrow("synthetic process interruption");
    const failedRun = (await resumed.query("select status,current_stage,last_completed_stage,summary from public.legacy_import_runs where id=$1", [runId])).rows[0];
    expect(failedRun).toMatchObject({ status: "failed", current_stage: expectedCurrent, last_completed_stage: expectedLast });
    expect(failedRun.summary.safe_to_resume).toBe(true);
    await migrateLegacyWorkspace(src, resumed, context(true, runId));
    expect(await canonicalImportState(resumed, runId)).toEqual(expected);
    const finishedSummary = (await resumed.query("select summary from public.legacy_import_runs where id=$1", [runId])).rows[0].summary;
    expect(finishedSummary.records_already_imported).toBe(expectedSkipped);
    expect(finishedSummary.records_imported).toBe(3 - expectedSkipped);
    expect(finishedSummary.records_requiring_manual_intervention)
      .toBe(finishedSummary.records_held + finishedSummary.records_rejected);
  }, 60000);

  it("recovers when completion tracking fails after all data stages", async () => {
    const src = await createSource();
    const runId = "10000000-0000-4000-8000-000000000007";
    const uninterrupted = await createTarget();
    await migrateLegacyWorkspace(src, uninterrupted, context(true, runId));
    const expected = await canonicalImportState(uninterrupted, runId);
    const resumed = await createTarget();
    let failCompletion = true;
    const interruptedTarget = {
      query(sql, values) {
        if (failCompletion && String(sql).startsWith("update public.legacy_import_runs set status=$2,finished_at=now(),current_stage=null")) {
          failCompletion = false;
          throw new Error("synthetic completion tracking failure");
        }
        return resumed.query(sql, values);
      },
    };
    await expect(migrateLegacyWorkspace(src, interruptedTarget, context(true, runId))).rejects.toThrow("synthetic completion tracking failure");
    expect((await resumed.query("select status,current_stage,last_completed_stage from public.legacy_import_runs where id=$1", [runId])).rows[0])
      .toMatchObject({ status: "failed", current_stage: "completion", last_completed_stage: "holds" });
    await migrateLegacyWorkspace(src, resumed, context(true, runId));
    expect(await canonicalImportState(resumed, runId)).toEqual(expected);
    const finishedSummary = (await resumed.query("select summary from public.legacy_import_runs where id=$1", [runId])).rows[0].summary;
    expect(finishedSummary.records_already_imported).toBe(3);
    expect(finishedSummary.records_imported).toBe(0);
    expect(finishedSummary.records_requiring_manual_intervention)
      .toBe(finishedSummary.records_held + finishedSummary.records_rejected);
  }, 60000);

  it("holds an invalid product and its dependent order and item with an actionable parent reason", async () => {
    const src = await createSource();
    await src.query("insert into public.products values($1,null,'Broken product','broken','BAD','not-a-price','1',true,now(),now(),null,null)", [ids.badProduct]);
    await src.query("insert into public.orders(id,order_number,customer_name,customer_phone,payment_status,order_status,subtotal,delivery_charge,total,created_at,order_date,discount_amount,refund_amount) values($1,'SYN-101','Sample Buyer','01700000001','pending','pending','2','0','2',now(),now(),'0','0')", [ids.badOrder]);
    await src.query("insert into public.order_items(id,order_id,product_id,product_name,unit_price,quantity,line_total,created_at) values($1,$2,$3,'Broken product','2','1','2',now())", [ids.badItem, ids.badOrder, ids.badProduct]);
    await src.query("insert into public.orders(id,order_number,customer_name,customer_phone,payment_status,order_status,subtotal,delivery_charge,total,created_at,order_date,discount_amount,refund_amount) values($1,'SYN-102','Orphan Buyer','01700000003','pending','pending','3','0','3',now(),now(),'0','0')", [ids.orphanOrder]);
    await src.query("insert into public.order_items(id,order_id,product_id,product_name,unit_price,quantity,line_total,created_at) values($1,$2,$3,'Missing parent','3','1','3',now())", [ids.orphanItem, ids.orphanOrder, ids.missingProduct]);
    const target = await createTarget();
    const result = await migrateLegacyWorkspace(src, target, context(false, undefined));
    const rows = new Map(result.preflight.map((row) => [`${row.source_table}:${row.source_id}`, row]));
    expect(rows.get(`products:${ids.badProduct}`)?.reason).toBe("product_price_invalid");
    expect(rows.get(`orders:${ids.badOrder}`)?.reason).toBe("order_product_not_imported");
    expect(rows.get(`order_items:${ids.badItem}`)?.reason).toBe("parent_order_not_imported");
    expect(rows.get(`orders:${ids.orphanOrder}`)?.reason).toBe("order_product_not_imported");
    expect(rows.get(`order_items:${ids.orphanItem}`)?.reason).toBe("parent_order_not_imported");
    const applyTarget = await createTarget();
    const applyCtx = context(true, "10000000-0000-4000-8000-000000000003");
    const applied = await migrateLegacyWorkspace(src, applyTarget, applyCtx);
    for (const row of result.preflight) expect(await actualOutcome(applyTarget, row), `${row.source_table}:${row.source_id}`).toEqual({
      expected_destination_table: row.expected_destination_table,
      expected_destination_id: row.expected_destination_id,
      expected_action: row.expected_action,
      reason: row.reason,
    });
    expect(applied.activeHolds).toBeGreaterThan(0);
    await migrateLegacyWorkspace(src, applyTarget, applyCtx);
    expect((await applyTarget.query("select count(*)::int as count from public.legacy_import_holds where workspace_id=$1 and source_table='products' and source_id=$2 and resolved_at is null", [ids.workspace, ids.badProduct])).rows[0].count).toBe(1);
  }, 60000);

  it("holds duplicate order numbers and destination ID collisions instead of overwriting", async () => {
    const src = await createSource();
    await src.query("insert into public.orders(id,order_number,customer_name,customer_phone,payment_status,order_status,subtotal,delivery_charge,total,created_at,order_date,discount_amount,refund_amount) values($1,'SYN-100','Another Buyer','01700000002','pending','pending','12.50','0','12.50',now(),now(),'0','0')", [ids.duplicateOrder]);
    await src.query("insert into public.order_items(id,order_id,product_id,product_name,unit_price,quantity,line_total,created_at) values($1,$2,$3,'Fixture product','12.50','1','12.50',now())", [ids.duplicateItem, ids.duplicateOrder, ids.product]);
    const target = await createTarget();
    await target.query("insert into public.products(id,workspace_id,source_store_id,name,status,currency,price) values($1,$2,$3,'Existing destination product','active','BDT',12.5)", [ids.product, ids.workspace, ids.store]);
    const result = await migrateLegacyWorkspace(src, target, context(false, undefined));
    const rows = new Map(result.preflight.map((row) => [`${row.source_table}:${row.source_id}`, row]));
    expect(rows.get(`products:${ids.product}`)?.expected_action).toBe("rejected");
    expect(rows.get(`products:${ids.product}`)?.reason).toBe("destination_id_conflict");
    expect(rows.get(`orders:${ids.order}`)?.reason).toBe("duplicate_order_number");
    expect(rows.get(`orders:${ids.duplicateOrder}`)?.reason).toBe("duplicate_order_number");
    expect(rows.get(`cash_movements:${ids.unsupported}`)?.reason).toBe("legacy_entity_not_mapped_to_universal_accounting");
    const applyResult = await migrateLegacyWorkspace(src, target, context(true, "10000000-0000-4000-8000-000000000004"));
    for (const row of result.preflight) expect(await actualOutcome(target, row), `${row.source_table}:${row.source_id}`).toEqual({
      expected_destination_table: row.expected_destination_table,
      expected_destination_id: row.expected_destination_id,
      expected_action: row.expected_action,
      reason: row.reason,
    });
    expect(applyResult.activeHolds).toBeGreaterThan(0);
    expect((await target.query("select count(*)::int as count from public.products where id=$1", [ids.product])).rows[0].count).toBe(1);
    await expect(src.query("insert into public.products(id,name) values($1,'Duplicate source key')", [ids.product])).rejects.toMatchObject({ code: "23505" });
  }, 60000);
});
