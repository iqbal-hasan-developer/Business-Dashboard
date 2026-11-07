import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { applyUniversalMigrations } from "./apply-universal-migrations.mjs";

const workspaces = 4;
const rowsPerWorkspace = Number(process.env.UNIVERSAL_BENCH_ROWS_PER_WORKSPACE || 4000);
if (!Number.isInteger(rowsPerWorkspace) || rowsPerWorkspace < 1000 || rowsPerWorkspace > 20000) {
  throw new Error("UNIVERSAL_BENCH_ROWS_PER_WORKSPACE must be an integer between 1000 and 20000.");
}
const database = new PGlite({ extensions: { pgcrypto } });
try {
  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema extensions;
    create table auth.users(id uuid primary key, email text unique, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant usage on schema public to authenticated;
  `);
  await applyUniversalMigrations(database, {
    migrationsPath: fileURLToPath(new URL("../supabase/universal/migrations", import.meta.url)),
    executeSql: (sql) => database.exec(sql),
    write: () => undefined,
  });
  await database.exec(`
    insert into auth.users(id,email,email_confirmed_at)
    select md5('bench-user-' || n)::uuid, 'bench-' || n || '@example.invalid', now()
    from generate_series(1,${workspaces}) as gs(n);
    insert into public.workspaces(id,name,created_by)
    select md5('bench-workspace-' || n)::uuid, 'Synthetic workspace ' || n, md5('bench-user-' || n)::uuid
    from generate_series(1,${workspaces}) as gs(n);
    insert into public.stores(id,workspace_id,name,platform,base_url,created_by)
    select md5('bench-store-' || public.workspaces.id)::uuid, public.workspaces.id, 'Synthetic store', 'custom', 'https://bench.example.invalid', created_by
    from public.workspaces;
    insert into public.products(id,workspace_id,source_store_id,external_id,sku,name,category,status,currency,price,updated_at)
    select md5('bench-product-' || w.id || '-' || g)::uuid, w.id, s.id, g::text,
      'SKU-' || g, case when g=${rowsPerWorkspace} then 'raresearchtoken product ' || g else 'synthetic product ' || g end,
      'category-' || mod(g,8), 'active', 'BDT', g::numeric, now() - g * interval '1 second'
    from public.workspaces w join public.stores s on s.workspace_id=w.id cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.product_variants(id,workspace_id,product_id,external_id,sku,name,currency,price,reorder_level)
    select md5('bench-variant-' || w.id || '-' || g)::uuid, w.id, md5('bench-product-' || w.id || '-' || g)::uuid,
      g::text, 'VSKU-' || g, 'Default', 'BDT', g::numeric, 5
    from public.workspaces w cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.inventory_levels(workspace_id,store_id,product_variant_id,quantity,source,observed_at,reorder_level)
    select w.id, s.id, md5('bench-variant-' || w.id || '-' || g)::uuid,
      case when mod(g,11)=0 then 0 when mod(g,7)=0 then 2 else 20 end,
      'manual_count', now() - g * interval '1 second', 5
    from public.workspaces w join public.stores s on s.workspace_id=w.id cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.customers(id,workspace_id,store_id,external_id,email,phone,full_name,created_at,last_seen_at)
    select md5('bench-customer-' || w.id || '-' || g)::uuid, w.id, s.id, g::text,
      'customer-' || g || '@example.invalid', '01' || lpad(g::text,9,'0'),
      case when g=${rowsPerWorkspace} then 'raresearchtoken customer ' || g else 'synthetic customer ' || g end,
      now() - g * interval '2 seconds', now() - g * interval '1 second'
    from public.workspaces w join public.stores s on s.workspace_id=w.id cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.orders(id,workspace_id,store_id,customer_id,external_id,order_number,status,payment_status,currency,
      subtotal,total,customer_name_snapshot,placed_at,created_at)
    select md5('bench-order-' || w.id || '-' || g)::uuid, w.id, s.id,
      md5('bench-customer-' || w.id || '-' || g)::uuid, g::text, 'ORDER-' || g,
      case when mod(g,17)=0 then 'cancelled' else 'confirmed' end, 'paid', 'BDT', g::numeric, g::numeric,
      case when g=${rowsPerWorkspace} then 'raresearchtoken customer ' || g else 'synthetic customer ' || g end,
      now() - g * interval '1 second', now() - g * interval '1 second'
    from public.workspaces w join public.stores s on s.workspace_id=w.id cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.order_items(workspace_id,order_id,product_variant_id,product_name_snapshot,quantity,unit_price,line_total)
    select w.id, md5('bench-order-' || w.id || '-' || g)::uuid, md5('bench-variant-' || w.id || '-' || g)::uuid,
      'synthetic item ' || g, 1, g::numeric, g::numeric
    from public.workspaces w cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    insert into public.expenses(workspace_id,store_id,category,description,amount,currency,expense_date,created_by)
    select w.id, s.id, 'category-' || mod(g,8), 'synthetic expense ' || g, g::numeric, 'BDT',
      current_date - mod(g,365)::integer, w.created_by
    from public.workspaces w join public.stores s on s.workspace_id=w.id cross join generate_series(1,${rowsPerWorkspace}) as gs(g);
    analyze public.products;
    analyze public.product_variants;
    analyze public.inventory_levels;
    analyze public.customers;
    analyze public.orders;
    analyze public.order_items;
    analyze public.expenses;
  `);

  const workspaceId = (await database.query("select id from public.workspaces order by name limit 1")).rows[0].id;
  const cases = [
    ["product page", "select id,name from public.workspace_product_stock where workspace_id=$1 order by updated_at desc,id limit 25", [workspaceId]],
    ["product exact count", "select count(*)::bigint from public.workspace_product_stock where workspace_id=$1", [workspaceId]],
    ["product substring search", "select id from public.workspace_product_stock where workspace_id=$1 and (name ilike '%raresearchtoken%' or sku ilike '%raresearchtoken%')", [workspaceId]],
    ["product SKU lookup", "select id from public.products where workspace_id=$1 and sku='SKU-2000'", [workspaceId]],
    ["order substring search", "select id from public.orders where workspace_id=$1 and (order_number ilike '%raresearchtoken%' or customer_name_snapshot ilike '%raresearchtoken%')", [workspaceId]],
    ["customer substring search", "select id from public.customers where workspace_id=$1 and (full_name ilike '%raresearchtoken%' or email ilike '%raresearchtoken%' or phone ilike '%raresearchtoken%')", [workspaceId]],
    ["inventory state/category/quantity page", "select id from public.workspace_inventory_stock where workspace_id=$1 and stock_status='low_stock' and category='category-0' and stock_quantity between 0 and 2 order by stock_quantity,id limit 25", [workspaceId]],
    ["customer order-count page", "select id,order_count from public.workspace_customer_order_counts where workspace_id=$1 and order_count between 1 and 3 order by created_at desc,id limit 25", [workspaceId]],
    ["expense date/category page", "select id from public.expenses where workspace_id=$1 and category='category-1' and expense_date between current_date-30 and current_date order by expense_date desc,id limit 25", [workspaceId]],
    ["expense exact count", "select count(*)::bigint from public.expenses where workspace_id=$1 and category='category-1' and expense_date between current_date-30 and current_date", [workspaceId]],
    ["dashboard order aggregate", "select count(*)::bigint as order_count,coalesce(sum(total),0)::numeric as gross_total from public.orders where workspace_id=$1", [workspaceId]],
  ];
  const measurements = [];
  for (const [name, sql, values] of cases) {
    const started = performance.now();
    const result = await database.query(sql, values);
    const elapsedMs = performance.now() - started;
    const explained = await database.query(`explain (analyze, buffers, format json) ${sql}`, values);
    const root = explained.rows[0]["QUERY PLAN"][0];
    const indexScans = [];
    const visit = (node) => {
      if (node["Index Name"]) indexScans.push({ name: node["Index Name"], type: node["Node Type"] });
      for (const child of node.Plans ?? []) visit(child);
    };
    visit(root.Plan);
    measurements.push({
      name, workspaceScoped: true, query: sql,
      returnedRows: result.rows.length,
      measuredMs: Number(elapsedMs.toFixed(3)),
      explainAnalyzeMs: root["Execution Time"],
      plan: { node: root.Plan["Node Type"], relation: root.Plan["Relation Name"] ?? null, planRows: root.Plan["Plan Rows"], actualRows: root.Plan["Actual Rows"], indexScans },
    });
  }
  process.stdout.write(JSON.stringify({
    engine: "PGlite PostgreSQL 18.6; not Supabase PostgreSQL 17",
    dataset: { workspaces, rowsPerWorkspacePerEntity: rowsPerWorkspace, entities: ["products", "variants", "inventory levels", "customers", "orders", "order items", "expenses"], rowsPerEntity: workspaces * rowsPerWorkspace },
    measurements,
  }, null, 2) + "\n");
} finally {
  await database.close();
}
