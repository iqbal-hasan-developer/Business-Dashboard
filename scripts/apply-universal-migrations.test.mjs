import { describe, expect, it } from "vitest";
import { isLocalDatabaseUrl, sha256 } from "./apply-universal-migrations.mjs";

describe("universal migration runner safeguards", () => {
  it("accepts only loopback PostgreSQL targets", () => {
    expect(isLocalDatabaseUrl("postgres://postgres:password@localhost:54322/postgres")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://postgres@127.0.0.1:5432/commerce_test")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://postgres@db.internal:5432/commerce")).toBe(false);
    expect(isLocalDatabaseUrl("not a connection string")).toBe(false);
  });

  it("uses stable SHA-256 checksums for immutable migration history", () => {
    expect(sha256("migration sql")).toBe("ead66d541419836c7c2ebccd9bb0bc2c9ae444aa6f2e7734989a7ae737dcbdd4");
    expect(sha256("migration sql")).not.toBe(sha256("changed migration sql"));
  });
});
