import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "universal", "migrations", "202611040001_workspace_store_foundation.sql"),
  "utf8",
);

describe("universal workspace migration contract", () => {
  it("keeps the clean-install schema separate from the legacy migration chain", () => {
    expect(migration).toContain("create table public.workspaces");
    expect(migration).toContain("create table public.workspace_memberships");
    expect(migration).toContain("create table public.stores");
  });

  it("enables row-level security and scopes reads to active workspace membership", () => {
    expect(migration).toMatch(/alter table public\.workspaces enable row level security/i);
    expect(migration).toMatch(/alter table public\.workspace_memberships enable row level security/i);
    expect(migration).toMatch(/alter table public\.stores enable row level security/i);
    expect(migration.match(/current_workspace_role\(workspace_id\) is not null/g)).toHaveLength(2);
  });

  it("pins privileged helpers to an empty search path and restricts workspace creation", () => {
    expect(migration.match(/security definer\s+set search_path = ''/gi)).toHaveLength(3);
    expect(migration).toMatch(/revoke all on function public\.create_workspace\(text\)[\s\S]*?from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant execute on function public\.create_workspace\(text\)\s+to authenticated/i);
  });

  it("does not let owners orphan a workspace", () => {
    expect(migration).toContain("workspace_memberships_keep_owner");
    expect(migration).toContain("A workspace must retain at least one active owner.");
  });

  it("keeps membership changes behind a future invitation workflow", () => {
    expect(migration).toMatch(/grant select on table public\.workspace_memberships to authenticated/i);
    expect(migration).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*workspace_memberships/i);
    expect(migration).not.toContain("owners_manage_workspace_memberships");
  });

  it("binds store creation to its actor and prevents workspace transfers", () => {
    expect(migration).toMatch(/created_by = \(select auth\.uid\(\)\)/i);
    expect(migration).toContain("stores_keep_workspace_ownership");
    expect(migration).toContain("Store workspace ownership cannot be changed.");
  });
});
