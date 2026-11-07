import { readFile } from "node:fs/promises";

const filename = process.argv[2];
if (!filename) throw new Error("A temporary Supabase startup log path is required.");
const content = await readFile(filename, "utf8");
const diagnosticLines = content.split(/\r?\n/).filter((line) => /(error|failed|unhealthy|docker|container|timeout|not found|unable)/i.test(line));
const safeLines = diagnosticLines.map((line) => line
  .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
  .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[REDACTED JWT]")
  .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1[REDACTED]@")
  .replace(/\b(?:anon|service[_ -]?role|publishable|secret|api)[_ -]?(?:key|token)\s*[:=]\s*\S+/gi, "[REDACTED SERVICE CREDENTIAL]"));
process.stdout.write(safeLines.slice(-40).join("\n") || "No safe startup diagnostics were available; consult the Supabase CLI setup and runner Docker status.\n");
