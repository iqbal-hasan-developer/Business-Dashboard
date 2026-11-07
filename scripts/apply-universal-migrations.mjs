import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(projectRoot, "supabase", "universal", "migrations");
const ledgerSchema = "universal_migrations";
const ledgerTable = `${ledgerSchema}.schema_versions`;

export function isLocalDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch {
    return false;
  }
}

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function applyUniversalMigrations(client, {
  migrationsPath = migrationsDirectory,
  executeSql = (sql) => client.query(sql),
  write = (line) => { process.stdout.write(line); },
} = {}) {
    const { rows: targetRows } = await client.query(
      `select current_database() as database_name,
        (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
        has_database_privilege(current_user, current_database(), 'CREATE') as can_create_schemas,
        has_schema_privilege(current_user, 'public', 'CREATE') as can_create_public_objects,
        coalesce((select has_schema_privilege(current_user, oid, 'CREATE') from pg_namespace where nspname = 'extensions'), false) as can_install_extensions,
        to_regclass('auth.users') is not null as has_auth_users,
        to_regprocedure('auth.uid()') is not null as has_auth_uid,
        exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') as has_confirmed_email,
        (select count(*) = 3 from pg_roles where rolname = any(array['anon', 'authenticated', 'service_role'])) as has_supabase_roles`,
    );
    if (!targetRows[0]?.is_superuser && (!targetRows[0]?.can_create_schemas || !targetRows[0]?.can_create_public_objects || !targetRows[0]?.can_install_extensions)) {
      throw new Error("The local migration role must be a superuser or have CREATE privileges on this database and the public and extensions schemas.");
    }
    if (!targetRows[0]?.has_auth_users || !targetRows[0]?.has_auth_uid || !targetRows[0]?.has_confirmed_email || !targetRows[0]?.has_supabase_roles) {
      throw new Error("The local database must have Supabase Auth users, confirmed-email fields, auth.uid(), and API roles initialized before migrations.");
    }

    await client.query("select pg_advisory_lock(741596203119)");
    try {
      const { rows: priorLedger } = await client.query("select to_regclass($1) as ledger", [ledgerTable]);
      if (!priorLedger[0].ledger) {
        const { rows: existingTables } = await client.query(
          `select relation.relname as relation_name
           from pg_class as relation
           join pg_namespace as namespace on namespace.oid = relation.relnamespace
           where namespace.nspname = 'public'
             and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
             and relation.relname <> 'spatial_ref_sys'
           order by relation.relname`,
        );
        if (existingTables.length) {
          const names = existingTables.map((row) => row.relation_name).filter((name) => ["orders", "products", "dashboard_user_profiles"].includes(name));
          throw new Error(`Refusing to initialize a non-empty public schema${names.length ? ` with legacy tables (${names.join(", ")})` : ""}; use a reviewed data migration.`);
        }
        await client.query("begin");
        await client.query(`create schema ${ledgerSchema}`);
        await client.query(`
          create table ${ledgerTable} (
            version text primary key,
            checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
            applied_at timestamptz not null default now()
          )
        `);
        await client.query(`revoke all on schema ${ledgerSchema} from public, anon, authenticated, service_role`);
        await client.query(`revoke all on table ${ledgerTable} from public, anon, authenticated, service_role`);
        await client.query("commit");
      }

      const migrationFiles = (await readdir(migrationsPath))
        .filter((name) => /^\d{12}_.*\.sql$/.test(name))
        .sort();
      if (!migrationFiles.length) throw new Error("No ordered universal SQL migrations were found.");

      for (const filename of migrationFiles) {
        const version = filename.slice(0, 12);
        const sql = await readFile(join(migrationsPath, filename));
        const checksum = sha256(sql);
        const { rows: appliedRows } = await client.query(
          `select checksum_sha256 from ${ledgerTable} where version = $1`,
          [version],
        );
        if (appliedRows.length) {
          if (appliedRows[0].checksum_sha256 !== checksum) {
            throw new Error(`Applied migration ${version} has changed; add a new migration instead of editing history.`);
          }
          continue;
        }

        await client.query("begin");
        try {
          await client.query("set local lock_timeout = '10s'");
          await client.query("set local statement_timeout = '60s'");
          await executeSql(sql.toString("utf8"));
          await client.query(
            `insert into ${ledgerTable} (version, checksum_sha256) values ($1, $2)`,
            [version, checksum],
          );
          await client.query("commit");
          write(`Applied universal migration ${filename}\n`);
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      }

      const { rows: applied } = await client.query(`select version from ${ledgerTable} order by version`);
      write(`Universal schema is current (${applied.length} migrations; database ${targetRows[0].database_name}).\n`);
    } finally {
      await client.query("select pg_advisory_unlock(741596203119)");
    }
}

async function applyMigrations() {
  const connectionString = process.env.UNIVERSAL_DATABASE_URL;
  if (!connectionString) throw new Error("Set UNIVERSAL_DATABASE_URL to a dedicated local PostgreSQL database.");
  if (!isLocalDatabaseUrl(connectionString)) {
    throw new Error("Universal migrations are restricted to loopback databases; remote and production targets are refused.");
  }

  const client = new Client({ connectionString, application_name: "commerce-universal-migrations" });
  await client.connect();
  try {
    await applyUniversalMigrations(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyMigrations().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Universal migration failed."}\n`);
    process.exitCode = 1;
  });
}
