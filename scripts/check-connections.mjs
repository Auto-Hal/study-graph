import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root, true, { info() {}, error() {} });
const source = readFileSync(new URL("../src/lib/supabase/review.ts", import.meta.url), "utf8");
const defaultValue = name => source.match(new RegExp(`const ${name} = "([^"]+)"`))?.[1];
const base = (process.env.SUPABASE_URL ?? defaultValue("DEFAULT_SUPABASE_URL"))?.replace(/\/$/, "");
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? defaultValue("DEFAULT_SUPABASE_PUBLISHABLE_KEY");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const learner = process.env.STUDY_GRAPH_LEARNER_ID;
const token = process.env.STUDY_GRAPH_APP_TOKEN ?? process.env.StudyGraph_APP_TOKEN;
const notionToken = process.env.NOTION_TOKEN ?? process.env.StudyGraph_NOTION_TOKEN;

// These POST requests call existing read RPCs only. No answers, issuance,
// snapshot refresh, configuration changes, or raw response bodies are logged.
const checks = [
  { name: "Notion authentication", url: "https://api.notion.com/v1/users/me", key: notionToken, notion: true },
  { name: "legacy review token", rpc: "study_graph_review_states", key: publicKey,
    body: { p_token: token }, required: token },
  { name: "learner Objective state", rpc: "study_graph_get_kuzushiji_pilot_objective_state", key: serviceKey,
    body: { p_learner_id: learner }, required: learner, expectRow: true },
  ...["kuzushiji", "western-art-history", "philosophy"].map(project => ({
    name: `${project} snapshot`, rpc: "study_graph_get_current_scope_knowledge_snapshot", key: serviceKey,
    body: { p_project_id: project }, expectRow: true,
  })),
];

await Promise.all(checks.map(async check => {
  let result;
  try {
    if (!check.key?.trim() || ("required" in check && !check.required?.trim())) {
      result = { check: check.name, ok: false, reason: "missing configuration" };
    } else {
      const url = check.url ?? `${base}/rest/v1/rpc/${check.rpc}`;
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || (!check.notion && (!base || !publicKey?.trim()))) {
        throw new Error("Invalid connection configuration");
      }
      const response = await fetch(url, {
        method: check.notion ? "GET" : "POST",
        headers: check.notion
          ? { Authorization: `Bearer ${check.key}`, "Notion-Version": "2025-09-03" }
          : { apikey: check.key, Authorization: `Bearer ${check.key}`, "Content-Type": "application/json" },
        body: check.notion ? undefined : JSON.stringify(check.body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      const rows = Array.isArray(data) ? data.length : undefined;
      const ok = response.ok && (check.notion ? data.object === "user" : Array.isArray(data))
        && (!check.expectRow || rows > 0);
      result = { check: check.name, status: response.status, ok, rows };
      if (!ok) result.reason = response.status === 401 || response.status === 403
        ? "authentication or authorization failed"
        : response.ok ? "expected data unavailable" : "request failed";
    }
  } catch (error) {
    // Error messages may contain credential-bearing URLs; log only the type.
    result = { check: check.name, ok: false, errorType: error.name };
  }
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}));
