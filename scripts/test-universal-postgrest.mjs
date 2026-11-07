import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../supabase/universal");
const status = spawnSync("supabase", ["status", "--workdir", projectDirectory, "--output", "json"], { encoding: "utf8" });
if (status.status !== 0) throw new Error("The isolated Supabase stack is not running.");

let services;
try {
  services = JSON.parse(status.stdout);
} catch {
  throw new Error("Could not read local Supabase connection settings.");
}

const apiUrl = services.API_URL;
const publishableKey = services.PUBLISHABLE_KEY ?? services.ANON_KEY;
const serviceRoleKey = services.SERVICE_ROLE_KEY;
if (!apiUrl || !publishableKey || !serviceRoleKey) throw new Error("Local Supabase did not provide the required test services.");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(apiUrl).hostname)) throw new Error("Tenant tests only run against loopback Supabase.");

const admin = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = randomUUID();

async function createSignedInUser(label) {
  const email = `tenant-${label}-${suffix}@example.invalid`;
  const password = `isolated-${randomUUID()}-A1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create isolated test account (${label}).`);
  const client = createClient(apiUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) throw new Error(`Could not authenticate isolated test account (${label}).`);
  return { client, userId: data.user.id, email };
}

function assertSucceeded(result, label) {
  if (result.error) throw new Error(`${label} failed (database code ${result.error.code ?? "unknown"}).`);
  return result.data;
}

{
  const accountA = await createSignedInUser("a");
  const accountB = await createSignedInUser("b");
  const workspaceA = assertSucceeded(await accountA.client.rpc("create_workspace", { p_name: "Isolated A" }), "Create workspace A");
  const workspaceB = assertSucceeded(await accountB.client.rpc("create_workspace", { p_name: "Isolated B" }), "Create workspace B");
  const storeA = assertSucceeded(await accountA.client.from("stores").insert({
    workspace_id: workspaceA, name: "Store A", platform: "custom", base_url: "https://a.example.invalid",
    created_by: accountA.userId,
  }).select("id").single(), "Create store A");
  const productA = assertSucceeded(await accountA.client.from("products").insert({
    workspace_id: workspaceA, source_store_id: storeA.id, name: "Product A", status: "active", currency: "USD", price: 10,
  }).select("id").single(), "Create product A");
  const ownRows = assertSucceeded(await accountA.client.from("products").select("id").eq("workspace_id", workspaceA), "Read own workspace");
  const spoofedRows = assertSucceeded(await accountA.client.from("products").select("id").eq("workspace_id", workspaceB), "Read spoofed workspace");
  const otherUserRows = assertSucceeded(await accountB.client.from("products").select("id").eq("workspace_id", workspaceA), "Read other user's workspace");
  assert.equal(ownRows.length, 1);
  assert.equal(spoofedRows.length, 0);
  assert.equal(otherUserRows.length, 0);

  const forgedInsert = await accountB.client.from("products").insert({
    workspace_id: workspaceA, source_store_id: storeA.id, name: "Forged", status: "active", currency: "USD", price: 1,
  });
  assert.equal(forgedInsert.error?.code, "42501");
  const crossUpdate = await accountB.client.from("products").update({ name: "Tampered" }).eq("id", productA.id).select("id");
  assertSucceeded(crossUpdate, "Attempt cross-workspace update");
  assert.equal(crossUpdate.data.length, 0);
  const crossDelete = await accountB.client.from("products").delete().eq("id", productA.id);
  assert.equal(crossDelete.error?.code, "42501");
  const directory = assertSucceeded(await accountA.client.rpc("list_workspace_members", { p_workspace_id: workspaceA }), "Read authorized member directory");
  assert(directory.some((member) => member.email === accountA.email));

  console.log("Isolated Supabase Auth and PostgREST tenant tests passed.");
}
