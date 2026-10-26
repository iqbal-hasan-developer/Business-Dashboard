import nextEnv from "@next/env";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_NAMES = [
  "BUSINESS_DATA_PROVIDER",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

const MOCK_CONTROL_NAMES = ["ENABLE_MOCK_EXPENSE_CONTROLS", "ENABLE_MOCK_MARKETING_CONTROLS"];
const { loadEnvConfig } = nextEnv;

function parseUrl(value, name, { requireHttps }) {
  let cleaned = value?.trim();
  if (cleaned && ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'")))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  let url;
  try {
    url = new URL(cleaned);
  } catch {
    const hint = !cleaned?.startsWith("http://") && !cleaned?.startsWith("https://")
      ? " (Did you forget 'https://' at the beginning? e.g. 'https://your-app.vercel.app')"
      : "";
    return { error: `${name} must be a valid absolute URL.${hint}` };
  }

  const localHost = ["localhost", "127.0.0.1"].includes(url.hostname);
  const allowedProtocol = url.protocol === "https:" || (!requireHttps && localHost && url.protocol === "http:");
  if (!allowedProtocol || url.username || url.password) {
    return { error: `${name} must use HTTPS without embedded credentials.` };
  }
  if (name === "NEXT_PUBLIC_APP_URL" && (url.pathname !== "/" || url.search || url.hash)) {
    return { error: "NEXT_PUBLIC_APP_URL must be an origin without a path, query, or fragment." };
  }
  return { url };
}

function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

export function validateDeploymentEnv(env) {
  const errors = [];
  const warnings = [];
  const isMockDemo = env.ENABLE_MOCK_DEMO?.trim().toLowerCase() === "true";
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  const isVercelPreview = vercelEnvironment === "preview";
  const requireHttps = vercelEnvironment === "production";

  if (isMockDemo) {
    if (!env.NEXT_PUBLIC_APP_URL?.trim()) {
      errors.push("NEXT_PUBLIC_APP_URL is required.");
    } else {
      const app = parseUrl(env.NEXT_PUBLIC_APP_URL.trim(), "NEXT_PUBLIC_APP_URL", { requireHttps });
      if (app.error) errors.push(app.error);
    }
    warnings.push("ENABLE_MOCK_DEMO is active. Deploying isolated demo with sample data; no Supabase connection required.");
    return { errors, warnings };
  }

  const missing = REQUIRED_NAMES.filter((name) => !env[name]?.trim());

  if (isVercelPreview && missing.length > 0) {
    warnings.push(
      `Preview deployment has no complete private-data connection (${missing.join(", ")}); it will remain fail-closed.`,
    );
    return { errors, warnings };
  }

  for (const name of missing) errors.push(`${name} is required.`);
  if (missing.length > 0) return { errors, warnings };

  if (env.BUSINESS_DATA_PROVIDER?.trim().toLowerCase() !== "supabase") {
    errors.push("BUSINESS_DATA_PROVIDER must be supabase for a deployment build.");
  }

  const app = parseUrl(env.NEXT_PUBLIC_APP_URL.trim(), "NEXT_PUBLIC_APP_URL", { requireHttps });
  if (app.error) errors.push(app.error);
  const supabase = parseUrl(env.NEXT_PUBLIC_SUPABASE_URL.trim(), "NEXT_PUBLIC_SUPABASE_URL", { requireHttps });
  if (supabase.error) errors.push(supabase.error);

  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.trim();
  if (publishableKey.startsWith("sb_secret_") || jwtRole(publishableKey) === "service_role") {
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not contain a Supabase secret or service-role key.");
  }

  if (vercelEnvironment) {
    for (const name of MOCK_CONTROL_NAMES) {
      if (env[name]?.trim().toLowerCase() === "true") {
        errors.push(`${name} must not be enabled on Vercel.`);
      }
    }
  }

  return { errors, warnings };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  loadEnvConfig(process.cwd(), false);
  const { errors, warnings } = validateDeploymentEnv(process.env);
  for (const warning of warnings) console.warn(`Deployment environment warning: ${warning}`);
  if (errors.length > 0) {
    console.error("Deployment environment validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("Deployment environment validation passed without printing secret values.");
}
