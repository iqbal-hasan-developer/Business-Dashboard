import { describe, expect, it } from "vitest";
import { createSimulationTarget, decimalUnits, isLoopbackPostgresUrl } from "./migrate-legacy-workspace.mjs";
import { isLocalDatabaseUrl } from "./apply-universal-migrations.mjs";
import { PGlite } from "@electric-sql/pglite";

describe("legacy workspace migration safety helpers", () => {
  it("accepts only loopback PostgreSQL URLs", () => {
    expect(isLoopbackPostgresUrl("postgres://user:secret@localhost:5432/legacy")).toBe(true);
    expect(isLoopbackPostgresUrl("postgresql://user:secret@[::1]/universal")).toBe(true);
    expect(isLoopbackPostgresUrl("postgres://user:secret@db.example.com:5432/legacy")).toBe(false);
    expect(isLoopbackPostgresUrl("https://localhost/legacy")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://user:secret@[::1]/universal")).toBe(true);
    expect(isLocalDatabaseUrl("https://localhost/universal")).toBe(false);
  });

  it("compares six-decimal amounts exactly beyond JavaScript safe integers", () => {
    expect(decimalUnits("9007199254740993.000001")).toBe(9007199254740993000001n);
    expect(decimalUnits("0.000001")).toBe(1n);
    expect(decimalUnits("12")).toBe(12000000n);
  });

  it("keeps apply transactions visible to simulated dependencies but rolls all writes back", async () => {
    const db = new PGlite();
    const ctx = { preflight: new Map() };
    const simulated = createSimulationTarget(db, ctx);
    await db.exec("create table parent(id integer primary key); create table child(parent_id integer references parent(id))");
    await db.query("begin");
    await simulated.query("begin");
    await simulated.query("insert into parent values(1)");
    await simulated.query("begin");
    await simulated.query("insert into child values(1)");
    await simulated.query("commit");
    await simulated.query("commit");
    expect((await db.query("select count(*)::int as count from child")).rows[0].count).toBe(1);
    await db.query("rollback");
    expect((await db.query("select count(*)::int as count from parent")).rows[0].count).toBe(0);
    await db.close();
  }, 15000);
});
