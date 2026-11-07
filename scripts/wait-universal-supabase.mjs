import { spawnSync } from "node:child_process";

const status = spawnSync("supabase", ["status", "--workdir", "supabase/universal", "--output", "json"], { encoding: "utf8" });
if (status.status !== 0) throw new Error("The disposable Supabase stack is not running; inspect the service startup step.");

let services;
try {
  services = JSON.parse(status.stdout);
} catch {
  throw new Error("Supabase status did not return valid local service metadata.");
}

const apiUrl = services.API_URL;
const apiKey = services.PUBLISHABLE_KEY ?? services.ANON_KEY;
if (!apiUrl || !apiKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(apiUrl).hostname)) {
  throw new Error("Supabase readiness checks require loopback Auth and PostgREST services.");
}

const checks = [
  () => fetch(new URL("/auth/v1/health", apiUrl)),
  () => fetch(new URL("/rest/v1/", apiUrl), { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } }),
];
const deadline = Date.now() + 60_000;
let lastStatus = "not contacted";
while (Date.now() < deadline) {
  const results = await Promise.all(checks.map(async (check) => {
    try { return (await check()).status; } catch { return 0; }
  }));
  if (results.every((result) => result >= 200 && result < 300)) {
    process.stdout.write("Local Supabase Auth and PostgREST are ready; service credentials were not printed.\n");
    process.exit(0);
  }
  lastStatus = results.map((value) => value || "unreachable").join("/");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error(`Local Auth/PostgREST did not become ready within 60 seconds (HTTP statuses ${lastStatus}).`);
