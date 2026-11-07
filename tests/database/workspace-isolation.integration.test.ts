import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { createHash } from "node:crypto";
import { mkdtemp, rmdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyUniversalMigrations } from "../../scripts/apply-universal-migrations.mjs";
import { readWorkspaceOverview } from "../../src/domain/workspace-overview";

const migrationsDirectory = join(process.cwd(), "supabase", "universal", "migrations");
const tenantTables = [
  "products", "product_variants", "customers", "orders", "order_items", "refunds",
  "fulfillments", "inventory_levels", "inventory_movements", "expenses",
  "financial_entries", "product_variant_costs", "sync_runs", "sync_checkpoints", "webhook_receipts",
  "background_jobs", "audit_events",
];
const ids = {
  ownerA: "00000000-0000-4000-8000-000000000101",
  ownerB: "00000000-0000-4000-8000-000000000102",
  adminA: "00000000-0000-4000-8000-000000000103",
  manager: "00000000-0000-4000-8000-000000000104",
  staff: "00000000-0000-4000-8000-000000000105",
  viewer: "00000000-0000-4000-8000-000000000106",
  intruder: "00000000-0000-4000-8000-000000000107",
  unverified: "00000000-0000-4000-8000-000000000108",
  newStaff: "00000000-0000-4000-8000-000000000109",
  newAdmin: "00000000-0000-4000-8000-000000000110",
  roleStaff: "00000000-0000-4000-8000-000000000111",
  workspaceA: "00000000-0000-4000-8000-000000000201",
  workspaceB: "00000000-0000-4000-8000-000000000202",
  storeA: "00000000-0000-4000-8000-000000000301",
  storeB: "00000000-0000-4000-8000-000000000302",
  productA: "00000000-0000-4000-8000-000000000401",
  productB: "00000000-0000-4000-8000-000000000402",
  variantA: "00000000-0000-4000-8000-000000000411",
  variantB: "00000000-0000-4000-8000-000000000412",
  customerA: "00000000-0000-4000-8000-000000000421",
  customerB: "00000000-0000-4000-8000-000000000422",
  orderA: "00000000-0000-4000-8000-000000000431",
  orderB: "00000000-0000-4000-8000-000000000432",
};

let database: PGlite;

async function setActor(userId: string) {
  await database.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
}

async function asAuthenticated<T>(userId: string, callback: () => Promise<T>): Promise<T> {
  await database.exec("begin; set local role authenticated;");
  await setActor(userId);
  try {
    return await callback();
  } finally {
    await database.exec("rollback;");
  }
}

async function asDatabaseOwner<T>(callback: () => Promise<T>): Promise<T> {
  await database.exec("begin;");
  try {
    return await callback();
  } finally {
    await database.exec("rollback;");
  }
}

async function expectDatabaseError(code: string, callback: () => Promise<unknown>) {
  await database.exec("savepoint expected_database_error;");
  let caught: { code?: string } | undefined;
  try {
    await callback();
  } catch (error) {
    caught = error as { code?: string };
  }
  await database.exec("rollback to savepoint expected_database_error;");
  expect(caught?.code).toBe(code);
}

async function invite(workspaceId: string, email: string, role: string) {
  const { rows } = await database.query<{ invitation_id: string; invitation_token: string; expires_at: string }>(
    "select * from public.invite_workspace_member($1, $2, $3)",
    [workspaceId, email, role],
  );
  return rows[0];
}

beforeAll(async () => {
  database = new PGlite({ extensions: { pgcrypto } });
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users (
      id uuid primary key,
      email text unique,
      email_confirmed_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
  `);

  const migrationOutput: string[] = [];
  await applyUniversalMigrations(database, {
    migrationsPath: migrationsDirectory,
    executeSql: (sql) => database.exec(sql),
    write: (line) => { migrationOutput.push(line); },
  });
  expect(migrationOutput.filter((line) => line.startsWith("Applied universal migration"))).toHaveLength(8);

  await database.query(
    `insert into auth.users (id, email, email_confirmed_at) values
      ($1, 'owner-a@example.invalid', now()),
      ($2, 'owner-b@example.invalid', now()),
      ($3, 'admin-a@example.invalid', now()),
      ($4, 'manager@example.invalid', now()),
      ($5, 'staff@example.invalid', now()),
      ($6, 'viewer@example.invalid', now()),
      ($7, 'intruder@example.invalid', now()),
      ($8, 'unverified@example.invalid', null),
      ($9, 'new-staff@example.invalid', now()),
      ($10, 'new-admin@example.invalid', now()),
      ($11, 'role-staff@example.invalid', now())`,
    [ids.ownerA, ids.ownerB, ids.adminA, ids.manager, ids.staff, ids.viewer, ids.intruder, ids.unverified, ids.newStaff, ids.newAdmin, ids.roleStaff],
  );
  await database.query(
    `insert into public.workspaces (id, name, created_by) values
      ($1, 'Workspace A', $3), ($2, 'Workspace B', $4)`,
    [ids.workspaceA, ids.workspaceB, ids.ownerA, ids.ownerB],
  );
  await database.query(
    `insert into public.workspace_memberships (workspace_id, user_id, role) values
      ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'manager'),
      ($1, $5, 'staff'), ($1, $6, 'viewer'), ($7, $8, 'owner')`,
    [ids.workspaceA, ids.ownerA, ids.adminA, ids.manager, ids.staff, ids.viewer, ids.workspaceB, ids.ownerB],
  );
  await database.query(
    `insert into public.stores (id, workspace_id, name, platform, base_url, created_by) values
      ($1, $2, 'Store A', 'custom', 'https://a.example.invalid', $3),
      ($4, $5, 'Store B', 'custom', 'https://b.example.invalid', $6)`,
    [ids.storeA, ids.workspaceA, ids.ownerA, ids.storeB, ids.workspaceB, ids.ownerB],
  );
  await database.query(
    `insert into public.store_credentials
      (workspace_id, store_id, ciphertext, nonce, key_id, updated_by)
     values ($1, $2, decode('00112233445566778899aabbccddeeff', 'hex'),
       decode('00112233445566778899aabb', 'hex'), 'fixture-key-v1', $3)`,
    [ids.workspaceA, ids.storeA, ids.ownerA],
  );
  await database.query(
    `insert into public.products (id, workspace_id, source_store_id, external_id, name, status, currency, price) values
      ($1, $3, $5, 'product-a', 'Product A', 'active', 'BDT', 100),
      ($2, $4, $6, 'product-b', 'Product B', 'active', 'USD', 20)`,
    [ids.productA, ids.productB, ids.workspaceA, ids.workspaceB, ids.storeA, ids.storeB],
  );
  await database.query(
    `insert into public.product_variants (id, workspace_id, product_id, external_id, name, currency, price) values
      ($1, $3, $5, 'variant-a', 'Variant A', 'BDT', 100),
      ($2, $4, $6, 'variant-b', 'Variant B', 'USD', 20)`,
    [ids.variantA, ids.variantB, ids.workspaceA, ids.workspaceB, ids.productA, ids.productB],
  );
  await database.query(
    `insert into public.product_variant_costs (workspace_id, product_variant_id, cost_price, updated_by) values
      ($1, $2, 60, $3), ($4, $5, 10, $6)`,
    [ids.workspaceA, ids.variantA, ids.ownerA, ids.workspaceB, ids.variantB, ids.ownerB],
  );
  await database.query(
    `insert into public.customers (id, workspace_id, store_id, external_id, full_name) values
      ($1, $3, $5, 'customer-a', 'Customer A'),
      ($2, $4, $6, 'customer-b', 'Customer B')`,
    [ids.customerA, ids.customerB, ids.workspaceA, ids.workspaceB, ids.storeA, ids.storeB],
  );
  await database.query(
    `insert into public.orders (id, workspace_id, store_id, customer_id, external_id, order_number,
       status, payment_status, currency, subtotal, refund_total, total, placed_at) values
      ($1, $3, $5, $7, 'order-a', 'A-100', 'fulfilled', 'paid', 'BDT', 100, 5, 100, now()),
      ($2, $4, $6, $8, 'order-b', 'B-100', 'processing', 'paid', 'USD', 20, 1, 20, now())`,
    [ids.orderA, ids.orderB, ids.workspaceA, ids.workspaceB, ids.storeA, ids.storeB, ids.customerA, ids.customerB],
  );
  await database.query(
    `insert into public.order_items (workspace_id, order_id, product_variant_id, product_name_snapshot,
       quantity, unit_price, line_total) values
      ($1, $2, $3, 'Product A', 1, 100, 100),
      ($4, $5, $6, 'Product B', 1, 20, 20)`,
    [ids.workspaceA, ids.orderA, ids.variantA, ids.workspaceB, ids.orderB, ids.variantB],
  );
  await database.query(
    `insert into public.refunds (workspace_id, order_id, external_id, amount, currency, status) values
      ($1, $2, 'refund-a', 5, 'BDT', 'succeeded'), ($3, $4, 'refund-b', 1, 'USD', 'succeeded')`,
    [ids.workspaceA, ids.orderA, ids.workspaceB, ids.orderB],
  );
  await database.query(
    `insert into public.fulfillments (workspace_id, order_id, external_id, status) values
      ($1, $2, 'fulfillment-a', 'in_transit'), ($3, $4, 'fulfillment-b', 'in_transit')`,
    [ids.workspaceA, ids.orderA, ids.workspaceB, ids.orderB],
  );
  await database.query(
    `insert into public.inventory_levels (workspace_id, store_id, product_variant_id, quantity, source, observed_at) values
      ($1, $2, $3, 5, 'store_sync', now()), ($4, $5, $6, 8, 'store_sync', now())`,
    [ids.workspaceA, ids.storeA, ids.variantA, ids.workspaceB, ids.storeB, ids.variantB],
  );
  await database.query(
    `insert into public.inventory_movements (workspace_id, store_id, product_variant_id, movement_type, quantity_delta, idempotency_key) values
      ($1, $2, $3, 'adjustment', 5, 'movement-a'), ($4, $5, $6, 'adjustment', 8, 'movement-b')`,
    [ids.workspaceA, ids.storeA, ids.variantA, ids.workspaceB, ids.storeB, ids.variantB],
  );
  await database.query(
    `insert into public.expenses (workspace_id, store_id, category, description, amount, currency, expense_date, created_by) values
      ($1, $2, 'shipping', 'Expense A', 5, 'BDT', current_date, $3),
      ($4, $5, 'shipping', 'Expense B', 2, 'USD', current_date, $6)`,
    [ids.workspaceA, ids.storeA, ids.ownerA, ids.workspaceB, ids.storeB, ids.ownerB],
  );
  await database.query(
    `insert into public.financial_entries (workspace_id, store_id, order_id, entry_type, amount, currency, effective_at, source_type, idempotency_key) values
      ($1, $2, $3, 'revenue', 100, 'BDT', now(), 'store_sync', 'financial-a'),
      ($4, $5, $6, 'revenue', 20, 'USD', now(), 'store_sync', 'financial-b')`,
    [ids.workspaceA, ids.storeA, ids.orderA, ids.workspaceB, ids.storeB, ids.orderB],
  );
  await database.query(
    `insert into public.sync_runs (workspace_id, store_id, entity_type, mode, status) values
      ($1, $2, 'orders', 'manual', 'succeeded'), ($3, $4, 'orders', 'manual', 'succeeded')`,
    [ids.workspaceA, ids.storeA, ids.workspaceB, ids.storeB],
  );
  await database.query(
    `insert into public.sync_checkpoints (workspace_id, store_id, entity_type, cursor) values
      ($1, $2, 'orders', 'a-cursor'), ($3, $4, 'orders', 'b-cursor')`,
    [ids.workspaceA, ids.storeA, ids.workspaceB, ids.storeB],
  );
  await database.query(
    `insert into public.webhook_receipts (workspace_id, store_id, provider_event_id, topic, payload_sha256) values
      ($1, $2, 'event-a', 'orders/updated', decode(repeat('aa', 32), 'hex')),
      ($3, $4, 'event-b', 'orders/updated', decode(repeat('bb', 32), 'hex'))`,
    [ids.workspaceA, ids.storeA, ids.workspaceB, ids.storeB],
  );
  await database.query(
    `insert into public.background_jobs (workspace_id, store_id, job_type, idempotency_key) values
      ($1, $2, 'sync-orders', 'job-a'), ($3, $4, 'sync-orders', 'job-b')`,
    [ids.workspaceA, ids.storeA, ids.workspaceB, ids.storeB],
  );
  await database.query(
    `insert into public.audit_events (workspace_id, actor_id, action, entity_type) values
      ($1, $2, 'fixture', 'product'), ($3, $4, 'fixture', 'product')`,
    [ids.workspaceA, ids.ownerA, ids.workspaceB, ids.ownerB],
  );
});

afterAll(async () => {
  await database?.close();
});

describe("isolated PostgreSQL workspace schema and RLS", () => {
  it("applies every ordered fresh-install migration to PostgreSQL", async () => {
    const { rows } = await database.query<{ server_version: string }>(
      "select current_setting('server_version') as server_version",
    );
    expect(Number(rows[0].server_version.split(".")[0])).toBeGreaterThanOrEqual(14);
    const { rows: tables } = await database.query<{ count: number }>(
      `select count(*)::int as count from information_schema.tables
       where table_schema = 'public' and table_name in
       ('workspaces', 'workspace_memberships', 'stores', 'workspace_invitations', 'store_credentials',
        'products', 'product_variants', 'customers', 'orders', 'order_items', 'refunds',
        'fulfillments', 'inventory_levels', 'inventory_movements', 'expenses',
        'financial_entries', 'sync_runs', 'sync_checkpoints', 'webhook_receipts',
        'background_jobs', 'audit_events', 'product_variant_costs', 'legacy_import_runs',
        'legacy_import_records', 'legacy_import_holds')`,
    );
    expect(tables[0].count).toBe(25);
    const { rows: versions } = await database.query<{ version: string; checksum_sha256: string }>(
      "select version, checksum_sha256 from universal_migrations.schema_versions order by version",
    );
    expect(versions.map((row) => row.version)).toEqual(["202611040001", "202611040002", "202611040003", "202611040004", "202611040005", "202611070006", "202611070007", "202611070008"]);
    expect(versions.every((row) => row.checksum_sha256.length === 64)).toBe(true);
  });

  it("filters product, inventory, orders, and customer-count views without crossing workspaces", async () => {
    const lowProduct = "00000000-0000-4000-8000-000000000403";
    const outProduct = "00000000-0000-4000-8000-000000000404";
    const untrackedProduct = "00000000-0000-4000-8000-000000000405";
    const lowVariant = "00000000-0000-4000-8000-000000000413";
    const outVariant = "00000000-0000-4000-8000-000000000414";
    const untrackedVariant = "00000000-0000-4000-8000-000000000415";
    const noOrdersCustomer = "00000000-0000-4000-8000-000000000423";
    await database.exec("begin");
    try {
    await database.query(
      `insert into public.products (id, workspace_id, source_store_id, name, category, status, currency, price) values
        ($1, $4, $5, 'Low product', 'Clearance', 'active', 'BDT', 10),
        ($2, $4, $5, 'Out product', 'Clearance', 'active', 'BDT', 10),
        ($3, $4, $5, 'Untracked product', 'New', 'active', 'BDT', 10)`,
      [lowProduct, outProduct, untrackedProduct, ids.workspaceA, ids.storeA],
    );
    await database.query(
      `insert into public.product_variants (id, workspace_id, product_id, name, currency, price, reorder_level) values
        ($1, $4, $5, 'Low variation', 'BDT', 10, 2),
        ($2, $4, $6, 'Out variation', 'BDT', 10, 0),
        ($3, $4, $7, 'Untracked variation', 'BDT', 10, 0)`,
      [lowVariant, outVariant, untrackedVariant, ids.workspaceA, lowProduct, outProduct, untrackedProduct],
    );
    await database.query(
      `insert into public.inventory_levels (workspace_id, store_id, product_variant_id, quantity, source, observed_at) values
        ($1, $2, $3, 1, 'manual_count', now()), ($1, $2, $4, 0, 'manual_count', now())`,
      [ids.workspaceA, ids.storeA, lowVariant, outVariant],
    );
    await database.query(
      `insert into public.customers (id, workspace_id, store_id, full_name) values
        ($1, $2, $3, 'No order customer')`,
      [noOrdersCustomer, ids.workspaceA, ids.storeA],
    );
    await database.query(
      `insert into public.orders (id, workspace_id, store_id, customer_id, order_number,
        status, payment_status, currency, subtotal, total, placed_at) values
        ('00000000-0000-4000-8000-000000000435', $1, $2, $3, 'A-101', 'cancelled', 'pending', 'BDT', 0, 0, now())`,
      [ids.workspaceA, ids.storeA, ids.customerA],
    );

    await database.exec("set local role authenticated");
    await setActor(ids.ownerA);
      const { rows: states } = await database.query<{ id: string; stock_status: string; stock_quantity: string | null }>(
        `select id, stock_status, stock_quantity::text from public.workspace_product_stock where workspace_id=$1`,
        [ids.workspaceA],
      );
      expect(states.find((row) => row.id === ids.productA)?.stock_status).toBe("in_stock");
      expect(states.find((row) => row.id === lowProduct)?.stock_status).toBe("low_stock");
      expect(states.find((row) => row.id === outProduct)?.stock_status).toBe("out_of_stock");
      expect(states.find((row) => row.id === untrackedProduct)?.stock_status).toBe("untracked");
      expect(states.find((row) => row.id === untrackedProduct)?.stock_quantity).toBeNull();
      expect(states.some((row) => row.id === "00000000-0000-4000-8000-000000000402")).toBe(false);

      const { rows: inventory } = await database.query<{ id: string; category: string; stock_status: string; stock_quantity: string | null }>(
        `select id, category, stock_status, stock_quantity::text from public.workspace_inventory_stock where workspace_id=$1`,
        [ids.workspaceA],
      );
      expect(inventory.find((row) => row.id === lowVariant)).toMatchObject({ category: "Clearance", stock_status: "low_stock", stock_quantity: "1.000000" });
      expect(inventory.find((row) => row.id === outVariant)?.stock_status).toBe("out_of_stock");
      expect(inventory.find((row) => row.id === untrackedVariant)?.stock_status).toBe("untracked");
      expect(inventory.find((row) => row.id === untrackedVariant)?.stock_quantity).toBeNull();

      const { rows: customerCounts } = await database.query<{ id: string; order_count: number }>(
        `select id, order_count from public.workspace_customer_order_counts where workspace_id=$1`,
        [ids.workspaceA],
      );
      expect(customerCounts.find((row) => row.id === ids.customerA)?.order_count).toBe(2);
      expect(customerCounts.find((row) => row.id === noOrdersCustomer)?.order_count).toBe(0);
      expect((await database.query(
        `select id from public.workspace_customer_order_counts where workspace_id=$1 and order_count=0`,
        [ids.workspaceB],
      )).rows).toHaveLength(0);

      const { rows: allowedOrders } = await database.query<{ id: string }>(
        `select id from public.orders where workspace_id=$1 and customer_id=$2 and store_id=$3`,
        [ids.workspaceA, ids.customerA, ids.storeA],
      );
      expect(allowedOrders).toHaveLength(2);
      const { rows: foreignOrders } = await database.query(
        `select id from public.orders where workspace_id=$1 and customer_id=$2`,
        [ids.workspaceA, ids.customerB],
      );
      expect(foreignOrders).toHaveLength(0);
    } finally {
      await database.exec("rollback");
    }
  });

  it("runs the application overview reader under database tenant policies", async () => {
    const reader = {
      async count(table: "stores" | "products" | "orders" | "customers" | "expenses", workspaceId: string) {
        const { rows } = await database.query<{ count: number }>(
          `select count(*)::int as count from public.${table} where workspace_id = $1`,
          [workspaceId],
        );
        return rows[0].count;
      },
    };

    await asAuthenticated(ids.ownerA, async () => {
      const overview = await readWorkspaceOverview(reader, ids.workspaceA, "Workspace A", "owner");
      expect(overview).toEqual({ workspaceName: "Workspace A", role: "owner", stores: 1, products: 1, orders: 1, customers: 1, expenses: 1 });
      const spoofed = await readWorkspaceOverview(reader, ids.workspaceB, "Workspace B", "owner");
      expect(spoofed).toEqual({ workspaceName: "Workspace B", role: "owner", stores: 0, products: 0, orders: 0, customers: 0, expenses: 0 });
    });
    await asAuthenticated(ids.ownerB, async () => {
      const overview = await readWorkspaceOverview(reader, ids.workspaceB, "Workspace B", "owner");
      expect(overview).toEqual({ workspaceName: "Workspace B", role: "owner", stores: 1, products: 1, orders: 1, customers: 1, expenses: 1 });
    });
    await asAuthenticated(ids.viewer, async () => {
      const overview = await readWorkspaceOverview(reader, ids.workspaceA, "Workspace A", "viewer");
      expect(overview.customers).toBeNull();
      expect(overview.products).toBe(1);
    });
  });

  it("keeps product costs role-gated and writes catalog updates transactionally", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows } = await database.query<{ product_id: string; variant_id: string }>(
        `select * from public.save_workspace_product($1, null, null, 'RPC Product', null,
          'RPC-1', 'Test category', 'Test brand', array[]::text[], 'active', 'BDT',
          12.5, 6.25, null, 'Default', '{}'::jsonb, 3)`,
        [ids.workspaceA],
      );
      expect(rows).toHaveLength(1);
      const saved = await database.query<{ name: string; category: string; brand: string }>(
        "select name, category, brand from public.products where id = $1 and workspace_id = $2",
        [rows[0].product_id, ids.workspaceA],
      );
      expect(saved.rows[0]).toEqual({ name: "RPC Product", category: "Test category", brand: "Test brand" });
      const cost = await database.query<{ cost_price: string }>(
        "select cost_price::text from public.product_variant_costs where workspace_id = $1 and product_variant_id = $2",
        [ids.workspaceA, rows[0].variant_id],
      );
      expect(cost.rows[0].cost_price).toBe("6.250000");
    });

    await asAuthenticated(ids.viewer, async () => {
      const { rows } = await database.query("select * from public.product_variant_costs where workspace_id = $1", [ids.workspaceA]);
      expect(rows).toHaveLength(0);
      await expectDatabaseError("42501", () => database.query(
        `select * from public.save_workspace_product($1, null, null, 'Forbidden', null,
          null, null, null, array[]::text[], 'active', 'BDT', 1, null, null, 'Default', '{}'::jsonb, 0)`,
        [ids.workspaceA],
      ));
    });

    await asAuthenticated(ids.ownerA, async () => {
      await database.query("select public.archive_workspace_product($1, $2)", [ids.workspaceA, ids.productA]);
      const { rows } = await database.query<{ status: string }>("select status from public.products where id = $1", [ids.productA]);
      expect(rows[0].status).toBe("archived");
    });
  });

  it("applies idempotent inventory deltas and prevents negative stock", async () => {
    await asAuthenticated(ids.manager, async () => {
      const adjust = (delta: number, key: string) => database.query<{ quantity: string }>(
        "select public.adjust_workspace_inventory($1, $2, $3, $4, $5, 'Count correction')::text as quantity",
        [ids.workspaceA, ids.storeA, ids.variantA, delta, key],
      );
      expect((await adjust(4, "count-a")).rows[0].quantity).toBe("9.000000");
      expect((await adjust(4, "count-a")).rows[0].quantity).toBe("9.000000");
      await expectDatabaseError("23505", () => adjust(2, "count-a"));
      expect((await adjust(-2, "count-b")).rows[0].quantity).toBe("7.000000");
      await expectDatabaseError("23514", () => adjust(-8, "count-c"));
      const { rows } = await database.query<{ quantity: string }>(
        "select quantity::text from public.inventory_levels where workspace_id = $1 and store_id = $2 and product_variant_id = $3",
        [ids.workspaceA, ids.storeA, ids.variantA],
      );
      expect(rows[0].quantity).toBe("7.000000");
    });
  });

  it("audits draft expenses and validates order refund states in the same workspace", async () => {
    await asAuthenticated(ids.manager, async () => {
      const { rows } = await database.query<{ save_workspace_expense: string }>(
        `select public.save_workspace_expense($1, null, 'utilities', 'Draft bill', 10,
          'BDT', current_date, 'draft', 'operating_expense', null, null, null)`,
        [ids.workspaceA],
      );
      expect(rows[0].save_workspace_expense).toBeTruthy();
      await database.query(
        "select public.set_workspace_order_status($1, $2, 'partially_refunded', 'partially_refunded')",
        [ids.workspaceA, ids.orderA],
      );
      await expectDatabaseError("23514", () => database.query(
        "select public.set_workspace_order_status($1, $2, 'refunded', 'refunded')",
        [ids.workspaceA, ids.orderA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "select public.set_workspace_order_status($1, $2, 'cancelled', 'failed')",
        [ids.workspaceB, ids.orderB],
      ));
    });
  });

  it("calculates workspace reporting metrics from scoped financial entries", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows } = await database.query<{ metrics: { totals: Array<{ revenue: number }>; low_stock_count: number } }>(
        "select public.workspace_reporting_metrics($1, current_date - 1, current_date + 1) as metrics",
        [ids.workspaceA],
      );
      expect(Number(rows[0].metrics.totals[0].revenue)).toBe(100);
      expect(rows[0].metrics.totals).toHaveLength(1);
      expect(rows[0].metrics.low_stock_count).toBeGreaterThanOrEqual(0);
      await expectDatabaseError("42501", () => database.query(
        "select public.workspace_reporting_metrics($1, current_date - 1, current_date + 1)",
        [ids.workspaceB],
      ));
    });
  });

  it("creates a scoped pending order and issues stock atomically on fulfillment", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows } = await database.query<{ id: string }>(
        `select public.create_workspace_order($1, $2, 'A-NEW', 'New customer', '01700000000',
          '{"address":"Dhaka"}'::jsonb, 'COD',
          jsonb_build_array(jsonb_build_object('variant_id', $3::text, 'quantity', 2, 'unit_price', 100)),
          0, 20, 5, 0)::text as id`,
        [ids.workspaceA, ids.storeA, ids.variantA],
      );
      const orderId = rows[0].id;
      await database.query("select public.set_workspace_order_status($1, $2, 'fulfilled', 'pending')", [ids.workspaceA, orderId]);
      const { rows: stock } = await database.query<{ quantity: string }>(
        "select quantity::text from public.inventory_levels where workspace_id=$1 and store_id=$2 and product_variant_id=$3",
        [ids.workspaceA, ids.storeA, ids.variantA],
      );
      expect(stock[0].quantity).toBe("3.000000");
      const { rows: revenue } = await database.query<{ amount: string }>(
        "select amount::text from public.financial_entries where workspace_id=$1 and order_id=$2 and entry_type='revenue'",
        [ids.workspaceA, orderId],
      );
      expect(revenue[0].amount).toBe("200.000000");
      const { rows: cogs } = await database.query<{ amount: string }>(
        "select amount::text from public.financial_entries where workspace_id=$1 and order_id=$2 and entry_type='cogs'",
        [ids.workspaceA, orderId],
      );
      expect(cogs[0].amount).toBe("120.000000");
      const { rows: report } = await database.query<{ metrics: { totals: Array<{ gross_profit: number | null; net_profit: number | null; missing_cogs_orders: number }> } }>(
        "select public.workspace_reporting_metrics($1, current_date - 1, current_date + 1) as metrics",
        [ids.workspaceA],
      );
      expect(report[0].metrics.totals[0].gross_profit).toBeNull();
      expect(report[0].metrics.totals[0].net_profit).toBeNull();
      expect(report[0].metrics.totals[0].missing_cogs_orders).toBe(1);
      await database.query("select public.set_workspace_order_status($1, $2, 'fulfilled', 'pending')", [ids.workspaceA, orderId]);
      const { rows: unchanged } = await database.query<{ quantity: string }>(
        "select quantity::text from public.inventory_levels where workspace_id=$1 and store_id=$2 and product_variant_id=$3",
        [ids.workspaceA, ids.storeA, ids.variantA],
      );
      expect(unchanged[0].quantity).toBe("3.000000");
    });
  });

  it("skips verified versions and refuses modified migration history", async () => {
    const repeatedOutput: string[] = [];
    await applyUniversalMigrations(database, {
      migrationsPath: migrationsDirectory,
      executeSql: (sql) => database.exec(sql),
      write: (line) => { repeatedOutput.push(line); },
    });
    expect(repeatedOutput.filter((line) => line.startsWith("Applied universal migration"))).toHaveLength(0);

    const temporaryMigrations = await mkdtemp(join(tmpdir(), "universal-migrations-"));
    try {
      await writeFile(join(temporaryMigrations, "202611040001_workspace_store_foundation.sql"), "-- modified migration history");
      await expect(applyUniversalMigrations(database, {
        migrationsPath: temporaryMigrations,
        executeSql: (sql) => database.exec(sql),
        write: () => undefined,
      })).rejects.toThrow("has changed; add a new migration");
    } finally {
      await rm(join(temporaryMigrations, "202611040001_workspace_store_foundation.sql"), { force: true });
      await rmdir(temporaryMigrations);
    }
  });

  it("isolates workspace and store reads and blocks cross-workspace writes", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows: workspaces } = await database.query<{ id: string }>("select id from public.workspaces order by id");
      const { rows: stores } = await database.query<{ id: string }>("select id from public.stores order by id");
      expect(workspaces.map((row) => row.id)).toEqual([ids.workspaceA]);
      expect(stores.map((row) => row.id)).toEqual([ids.storeA]);

      const { rows: createdStore } = await database.query(
        `insert into public.stores (workspace_id, name, platform, base_url, created_by)
         values ($1, 'New store', 'custom', 'https://new.example.invalid', $2) returning id`,
        [ids.workspaceA, ids.ownerA],
      );
      expect(createdStore).toHaveLength(1);
      await expectDatabaseError("42501", () => database.query(
        `insert into public.stores (workspace_id, name, platform, base_url, connection_status, external_store_id, created_by)
         values ($1, 'Forged connected store', 'custom', 'https://forged.example.invalid', 'connected', 'forged', $2)`,
        [ids.workspaceA, ids.ownerA],
      ));

      const { rows: update } = await database.query(
        "update public.stores set name = 'cross-tenant write' where id = $1 returning id",
        [ids.storeB],
      );
      expect(update).toHaveLength(0);
      await expectDatabaseError("42501", () => database.query(
        `insert into public.stores (workspace_id, name, platform, base_url, created_by)
         values ($1, 'Forged store', 'custom', 'https://forged.example.invalid', $2)`,
        [ids.workspaceB, ids.ownerA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "delete from public.workspaces where id = $1",
        [ids.workspaceB],
      ));
    });
  });

  it("keeps membership writes behind scoped invitation and ownership RPCs", async () => {
    await asAuthenticated(ids.staff, async () => {
      await expectDatabaseError("42501", () => database.query(
        "insert into public.workspace_memberships (workspace_id, user_id, role) values ($1, $2, 'admin')",
        [ids.workspaceA, ids.staff],
      ));
      await expectDatabaseError("42501", () => database.query(
        "select public.invite_workspace_member($1, 'new@example.invalid', 'admin')",
        [ids.workspaceA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "select public.transfer_workspace_ownership($1, $2)",
        [ids.workspaceA, ids.adminA],
      ));
    });
  });

  it("applies tenant filters to every commerce, finance, and job table", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      for (const table of tenantTables) {
        const { rows } = await database.query<{ workspace_id: string }>(`select workspace_id from public.${table}`);
        expect(rows, `${table} should expose only workspace A`).toHaveLength(1);
        expect(rows[0].workspace_id, `${table} workspace`).toBe(ids.workspaceA);
      }
    });

    await asAuthenticated(ids.staff, async () => {
      const { rows: financial } = await database.query("select id from public.financial_entries");
      const { rows: audit } = await database.query("select id from public.audit_events");
      const { rows: customers } = await database.query("select id from public.customers");
      expect(financial).toHaveLength(0);
      expect(audit).toHaveLength(0);
      expect(customers).toHaveLength(1);
    });

    await asAuthenticated(ids.viewer, async () => {
      const { rows: customers } = await database.query("select id from public.customers");
      expect(customers).toHaveLength(0);
    });
  });

  it("rejects tenant reassignment and unapproved financial mutations", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      await expectDatabaseError("23514", () => database.query(
        "update public.products set workspace_id = $1 where id = $2 returning id",
        [ids.workspaceB, ids.productA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "update public.expenses set workspace_id = $1 where workspace_id = $2 returning id",
        [ids.workspaceB, ids.workspaceA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "delete from public.orders where workspace_id = $1",
        [ids.workspaceA],
      ));
      await expectDatabaseError("42501", () => database.query(
        `insert into public.expenses (workspace_id, category, description, amount, currency, expense_date, created_by)
         values ($1, 'fee', 'Cross workspace', 1, 'USD', current_date, $2)`,
        [ids.workspaceB, ids.ownerA],
      ));
    });
  });

  it("enforces tenant-aware foreign keys, uniqueness, and numeric integrity", async () => {
    await asDatabaseOwner(async () => {
      await expectDatabaseError("23514", () => database.query(
        "update public.stores set workspace_id = $1 where id = $2",
        [ids.workspaceB, ids.storeA],
      ));
      await expectDatabaseError("23503", () => database.query(
        `insert into public.orders (workspace_id, store_id, customer_id, order_number, status, payment_status, currency, total, placed_at)
         values ($1, $2, $3, 'invalid-link', 'pending', 'pending', 'BDT', 1, now())`,
        [ids.workspaceA, ids.storeB, ids.customerA],
      ));
      await expectDatabaseError("23505", () => database.query(
        `insert into public.products (workspace_id, source_store_id, external_id, name, currency)
         values ($1, $2, 'product-a', 'Duplicate', 'BDT')`,
        [ids.workspaceA, ids.storeA],
      ));
      await expectDatabaseError("23505", () => database.query(
        `insert into public.inventory_movements (workspace_id, store_id, product_variant_id, movement_type, quantity_delta, idempotency_key)
         values ($1, $2, $3, 'adjustment', 1, 'movement-a')`,
        [ids.workspaceA, ids.storeA, ids.variantA],
      ));
      await expectDatabaseError("23514", () => database.query(
        `insert into public.orders (workspace_id, store_id, order_number, status, payment_status, currency, total, placed_at)
         values ($1, $2, 'invalid-money', 'pending', 'pending', 'BDT', -1, now())`,
        [ids.workspaceA, ids.storeA],
      ));
    });
  });

  it("creates workspaces atomically for the authenticated creator only", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows } = await database.query<{ create_workspace: string }>(
        "select public.create_workspace('New workspace')",
      );
      const { rows: membership } = await database.query<{ role: string }>(
        "select role from public.workspace_memberships where workspace_id = $1 and user_id = $2",
        [rows[0].create_workspace, ids.ownerA],
      );
      expect(membership[0].role).toBe("owner");
    });
  });

  it("creates hashed invitations, enforces email identity, and accepts idempotently", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const invitation = await invite(ids.workspaceA, "NEW-STAFF@example.invalid", "staff");
      expect(invitation.invitation_token).toHaveLength(72);

      await expectDatabaseError("42501", () => database.query(
        "select token_hash from public.workspace_invitations where id = $1",
        [invitation.invitation_id],
      ));

      await setActor(ids.viewer);
      await expectDatabaseError("42501", () => database.query(
        "select public.accept_workspace_invitation($1)",
        [invitation.invitation_token],
      ));

      await setActor(ids.newStaff);
      const { rows: accepted } = await database.query<{ workspace_id: string }>(
        "select public.accept_workspace_invitation($1) as workspace_id",
        [invitation.invitation_token],
      );
      const { rows: repeated } = await database.query<{ workspace_id: string }>(
        "select public.accept_workspace_invitation($1) as workspace_id",
        [invitation.invitation_token],
      );
      const { rows: acceptedMembership } = await database.query<{ role: string }>(
        "select role from public.workspace_memberships where workspace_id = $1 and user_id = $2",
        [ids.workspaceA, ids.newStaff],
      );
      const { rows: memberships } = await database.query<{ count: number }>(
        "select count(*)::int as count from public.workspace_memberships where workspace_id = $1 and user_id = $2",
        [ids.workspaceA, ids.newStaff],
      );
      expect(accepted[0].workspace_id).toBe(ids.workspaceA);
      expect(repeated[0].workspace_id).toBe(ids.workspaceA);
      expect(acceptedMembership[0].role).toBe("staff");
      expect(memberships[0].count).toBe(1);
    });
  });

  it("returns a workspace's member directory only to its own members", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const { rows } = await database.query<{ user_id: string; email: string | null; role: string }>(
        "select user_id, email, role from public.list_workspace_members($1)",
        [ids.workspaceA],
      );
      expect(rows).toHaveLength(5);
      expect(rows.map((row) => row.email)).toContain("owner-a@example.invalid");
      expect(rows.map((row) => row.email)).not.toContain("owner-b@example.invalid");
    });
    await asAuthenticated(ids.ownerB, async () => {
      const { rows } = await database.query("select * from public.list_workspace_members($1)", [ids.workspaceA]);
      expect(rows).toHaveLength(0);
    });
  });

  it("rejects unverified-email acceptance, expired invitations, and revoked invitations", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const unverifiedInvite = await invite(ids.workspaceA, "unverified@example.invalid", "viewer");
      await setActor(ids.unverified);
      await expectDatabaseError("42501", () => database.query(
        "select public.accept_workspace_invitation($1)",
        [unverifiedInvite.invitation_token],
      ));

      await setActor(ids.ownerA);
      const expiredInvite = await invite(ids.workspaceA, "expired@example.invalid", "viewer");
      await database.exec("reset role");
      await database.query("update public.workspace_invitations set expires_at = now() - interval '1 minute' where id = $1", [expiredInvite.invitation_id]);
      await database.exec("set local role authenticated");
      await setActor(ids.intruder);
      await expectDatabaseError("42501", () => database.query(
        "select public.accept_workspace_invitation($1)",
        [expiredInvite.invitation_token],
      ));

      await setActor(ids.ownerA);
      const revokedInvite = await invite(ids.workspaceA, "revoked@example.invalid", "viewer");
      await database.query("select public.revoke_workspace_invitation($1, $2)", [ids.workspaceA, revokedInvite.invitation_id]);
      await setActor(ids.intruder);
      await expectDatabaseError("42501", () => database.query(
        "select public.accept_workspace_invitation($1)",
        [revokedInvite.invitation_token],
      ));
    });
  });

  it("enforces role hierarchy and preserves an active owner", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      await expectDatabaseError("23505", () => database.query(
        "select * from public.invite_workspace_member($1, 'staff@example.invalid', 'admin')",
        [ids.workspaceA],
      ));
      const adminInvite = await invite(ids.workspaceA, "new-admin@example.invalid", "admin");
      const staffInvite = await invite(ids.workspaceA, "role-staff@example.invalid", "staff");
      await setActor(ids.newAdmin);
      await database.query("select public.accept_workspace_invitation($1)", [adminInvite.invitation_token]);
      await setActor(ids.roleStaff);
      await database.query("select public.accept_workspace_invitation($1)", [staffInvite.invitation_token]);

      await setActor(ids.newAdmin);
      await expectDatabaseError("42501", () => database.query(
        "select * from public.invite_workspace_member($1, 'another-admin@example.invalid', 'admin')",
        [ids.workspaceA],
      ));
      await database.query("select public.set_workspace_member_role($1, $2, 'viewer')", [ids.workspaceA, ids.roleStaff]);
      await expectDatabaseError("42501", () => database.query(
        "select public.set_workspace_member_role($1, $2, 'admin')",
        [ids.workspaceA, ids.roleStaff],
      ));

      await setActor(ids.ownerA);
      await database.query("select public.transfer_workspace_ownership($1, $2)", [ids.workspaceA, ids.newAdmin]);
      const { rows: roles } = await database.query<{ user_id: string; role: string }>(
        "select user_id, role from public.workspace_memberships where workspace_id = $1 and user_id in ($2, $3) order by user_id",
        [ids.workspaceA, ids.ownerA, ids.newAdmin],
      );
      expect(roles.map((row) => row.role)).toEqual(["admin", "owner"]);

      await setActor(ids.newAdmin);
      await expectDatabaseError("23514", () => database.query(
        "select public.remove_workspace_member($1, $2)",
        [ids.workspaceA, ids.newAdmin],
      ));
    });
  });

  it("prevents store ownership transfer and keeps credentials private to privileged workers", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      await expectDatabaseError("42501", () => database.query(
        "update public.stores set workspace_id = $1 where id = $2",
        [ids.workspaceB, ids.storeA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "select ciphertext from public.store_credentials where store_id = $1",
        [ids.storeA],
      ));
      await expectDatabaseError("42501", () => database.query(
        "update public.stores set connection_status = 'connected' where id = $1",
        [ids.storeA],
      ));
    });

    await database.exec("set role service_role");
    const { rows } = await database.query("select workspace_id, store_id from public.store_credentials");
    expect(rows).toEqual([{ workspace_id: ids.workspaceA, store_id: ids.storeA }]);
    await database.exec("reset role");

    await database.exec("begin; set local role service_role;");
    await expectDatabaseError("23514", () => database.query(
      "update public.store_credentials set workspace_id = $1, store_id = $2 where store_id = $3",
      [ids.workspaceB, ids.storeB, ids.storeA],
    ));
    await database.exec("rollback;");
  });

  it("stores only a digest of the bearer token and rejects duplicate pending invitations", async () => {
    await asAuthenticated(ids.ownerA, async () => {
      const invitation = await invite(ids.workspaceA, "hash-check@example.invalid", "viewer");
      const expectedHash = createHash("sha256").update(invitation.invitation_token).digest("hex");
      await database.exec("reset role");
      const { rows } = await database.query<{ digest: string }>(
        "select encode(token_hash, 'hex') as digest from public.workspace_invitations where id = $1",
        [invitation.invitation_id],
      );
      expect(rows[0].digest).toBe(expectedHash);
      await database.exec("set local role authenticated");
      await expectDatabaseError("23505", () => invite(ids.workspaceA, "hash-check@example.invalid", "staff"));
    });
  });
});
