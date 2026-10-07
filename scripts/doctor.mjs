import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
const [major, minor] = process.versions.node.split(".").map(Number);
const supported = (major === 22 && minor >= 18) || major === 24;
console.log(`Node ${process.version}: ${supported ? "supported" : "unsupported; use 22.18+ or 24.x"}`);
console.log(`Lockfile: ${existsSync(new URL("../package-lock.json", import.meta.url)) ? "present" : "missing"}`);
for (const key of ["NOTION_TOKEN", "STUDY_GRAPH_APP_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "STUDY_GRAPH_LEARNER_ID"]) {
  console.log(`${key}: ${process.env[key]?.trim() ? "present (not validated)" : "missing"}`);
}
for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]) {
  if (process.env[key] !== undefined && !process.env[key].trim()) console.log(`${key}: empty override; remove it to use the built-in default`);
}
const portablePsql = new URL("../.tools/postgresql-17.11/pgsql/bin/psql.exe", import.meta.url);
for (const binary of ["psql", "docker"]) {
  const executable = binary === "psql" && existsSync(portablePsql) ? fileURLToPath(portablePsql) : binary;
  const result = spawnSync(executable, ["--version"], { encoding: "utf8" });
  console.log(`${binary}: ${result.status === 0 ? "available" : binary === "docker" ? "unavailable (optional with portable PostgreSQL)" : "unavailable; isolated DB tests need PostgreSQL and psql"}`);
}
console.log("Presence only. Credentials, network access, hosted migrations and deployment are not verified.");
if (!supported) process.exitCode = 1;
