import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("current API/online/offline v1 runtime remains isolated from the unused v2 adapter", () => {
  for (const file of ["src/lib/review/pilot-runtime.ts", "src/lib/supabase/pilot.ts", "src/lib/review/registry.ts",
    "app/api/review/pilot/issue/route.ts", "app/api/review/pilot/attempt/route.ts", "src/lib/review/offline/pilot-transport.ts"]) {
    assert.doesNotMatch(read(file), /objective-runtime|study_graph_issue_objective_instance_v2|study_graph_record_objective_attempt_v2/);
  }
  const runtime = read("src/lib/review/pilot-runtime.ts");
  assert.match(runtime, /getKuzushijiDashboard\(\)/);
  assert.match(runtime, /buildKuzushijiScopeSnapshot\(data\)/);
  assert.match(runtime, /KUZUSHIJI_PILOT_SRS_EPOCH/);
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
});

test("new transport and gate are server-only; acceptance has no gate argument or legacy writer", () => {
  for (const path of ["src/lib/review/objective-runtime.ts", "src/lib/supabase/objective-runtime.ts"]) assert.match(read(path), /import "server-only"/);
  const runtime = read("src/lib/review/objective-runtime.ts");
  assert.match(runtime, /STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED === "true"/);
  assert.doesNotMatch(runtime.slice(runtime.indexOf("export async function submitObjectiveAttemptV2")), /newObjectiveIssuanceVersion|STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED/);
  const transport = read("src/lib/supabase/objective-runtime.ts");
  assert.doesNotMatch(transport, /"study_graph_record_objective_attempt"|"study_graph_issue_kuzushiji_objective_pilot_instance"|console\./);
});

test("the only approved migration adds an ownership-filtered read RPC and its ACL", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.includes("phase_5a_2a"));
  assert.equal(files.length, 1);
  const sql = read(`supabase/migrations/${files[0]}`);
  assert.match(sql, /security definer\s+set search_path = pg_catalog/i);
  assert.match(sql, /ei\.instance_id = p_instance_id\s+and ei\.learner_id = p_learner_id/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter table|create table)\b|pg_advisory|objective_review_state|objective_srs_opportunities/i);
  assert.match(sql, /from public, anon, authenticated, service_role/);
  assert.match(sql, /to service_role/);
});

test("six-field requestHash, hosted gate and no automatic fallback remain explicit", () => {
  const source = read("src/lib/review/exercises/attempt-content.ts");
  for (const field of ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint"]) assert.match(source, new RegExp(`${field}: request\\.${field}`));
  assert.doesNotMatch(source, /expectedStateRevision|opportunityId|gradePolicyVersion/);
  const docs = read("docs/PHASE_5A_2A_OBJECTIVE_RUNTIME.md");
  for (const term of ["Hosted Security Advisor", "Hosted Performance Advisor", "smoke test", "Supervisor", "no automatic v1 fallback"]) assert.ok(docs.includes(term));
  assert.match(read(".github/workflows/ci.yml"), /npm run test:phase5a-2a:db/);
});
