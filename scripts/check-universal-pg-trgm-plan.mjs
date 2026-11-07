import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const status = spawnSync("supabase", ["status", "--workdir", "supabase/universal", "--output", "json"], { encoding: "utf8" });
if (status.status !== 0) throw new Error("The isolated Supabase stack is not running.");
let services;
try { services = JSON.parse(status.stdout); } catch { throw new Error("Could not read isolated Supabase connection status."); }
if (!services.DB_URL) throw new Error("The isolated Supabase database URL is unavailable.");
const databaseUrl = new URL(services.DB_URL);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) throw new Error("The trigram check only runs against loopback Supabase.");

const expectedIndexes = [
  "products_name_trgm_idx", "products_sku_trgm_idx", "orders_number_trgm_idx",
  "orders_customer_name_trgm_idx", "orders_customer_phone_trgm_idx", "customers_name_trgm_idx",
  "customers_email_trgm_idx", "customers_phone_trgm_idx", "variants_name_trgm_idx",
  "variants_sku_trgm_idx", "variants_barcode_trgm_idx", "expenses_description_trgm_idx",
  "expenses_category_trgm_idx",
];
const client = new Client({ connectionString: services.DB_URL, application_name: "universal-pg-trgm-check" });
await client.connect();
try {
  const server = await client.query("select current_setting('server_version') as version");
  const available = await client.query("select default_version from pg_catalog.pg_available_extensions where name='pg_trgm'");
  const extension = await client.query("select n.nspname as schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm'");
  assert.equal(
    extension.rows[0]?.schema,
    "extensions",
    `pg_trgm must be installed in extensions; PostgreSQL ${server.rows[0].version}, available=${available.rows.length > 0}`,
  );
  const indexes = await client.query(
    `select index_class.relname as indexname, access_method.amname,
        operator_schema.nspname as operator_schema, operator_class.opcname as operator_class
      from pg_catalog.pg_index index_data
      join pg_catalog.pg_class index_class on index_class.oid=index_data.indexrelid
      join pg_catalog.pg_namespace index_schema on index_schema.oid=index_class.relnamespace
      join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
      cross join lateral unnest(index_data.indclass::oid[]) as classes(operator_class_oid)
      join pg_catalog.pg_opclass operator_class on operator_class.oid=classes.operator_class_oid
      join pg_catalog.pg_namespace operator_schema on operator_schema.oid=operator_class.opcnamespace
      where index_schema.nspname='public' and index_class.relname=any($1::text[])
      order by index_class.relname`,
    [expectedIndexes],
  );
  assert.deepEqual(indexes.rows.map((row) => row.indexname).sort(), [...expectedIndexes].sort(), "migration trigram indexes are incomplete or lack the expected GIN operator class");
  assert(indexes.rows.every((row) => row.amname === "gin" && row.operator_schema === "extensions" && row.operator_class === "gin_trgm_ops"), "migration indexes use an unexpected access method or operator class");

  await client.query("begin");
  await client.query("create temporary table phase4c_trgm_probe(value text) on commit drop");
  await client.query("insert into phase4c_trgm_probe select 'synthetic search fixture ' || n from generate_series(1,20000) as gs(n)");
  await client.query("insert into phase4c_trgm_probe values ('phase4c-unique-search-token')");
  await client.query("create index phase4c_trgm_probe_idx on phase4c_trgm_probe using gin(value extensions.gin_trgm_ops)");
  await client.query("analyze phase4c_trgm_probe");
  const started = performance.now();
  const probe = await client.query("select count(*)::integer as count from phase4c_trgm_probe where value ilike '%unique-search-token%'");
  const elapsedMs = performance.now() - started;
  assert.equal(probe.rows[0].count, 1, "trigram substring probe returned an unexpected result");
  const explained = await client.query("explain (analyze, buffers, format json) select value from phase4c_trgm_probe where value ilike '%unique-search-token%'");
  const plan = explained.rows[0]["QUERY PLAN"][0];
  const indexesUsed = [];
  const visit = (node) => {
    if (node["Index Name"]) indexesUsed.push(node["Index Name"]);
    for (const child of node.Plans ?? []) visit(child);
  };
  visit(plan.Plan);
  assert(indexesUsed.includes("phase4c_trgm_probe_idx"), "the PostgreSQL 17 plan did not use its trigram index");
  await client.query("rollback");
  process.stdout.write(JSON.stringify({
    database: "isolated Supabase PostgreSQL 17",
    extension: "pg_trgm@extensions",
    migrationIndexes: indexes.rows.length,
    syntheticRows: 20001,
    query: "value ILIKE '%unique-search-token%'",
    resultCount: probe.rows[0].count,
    measuredMs: Number(elapsedMs.toFixed(3)),
    queryPlanMs: plan["Execution Time"],
    indexesUsed,
  }) + "\n");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
