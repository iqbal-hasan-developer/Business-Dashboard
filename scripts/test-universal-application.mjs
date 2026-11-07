import { spawnSync } from "node:child_process";
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
if (!apiUrl || !publishableKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(apiUrl).hostname)) {
  throw new Error("Application checks require a loopback Supabase Auth/PostgREST stack.");
}

const env = {
  ...process.env,
  BUSINESS_DATA_PROVIDER: "supabase",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
};
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "--config", "playwright.universal.config.ts"], { env, stdio: "inherit" });
if (result.error) throw new Error("Could not start the isolated application test runner.");
process.exitCode = result.status ?? 1;
