import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260908120000_phase_4d_4_objective_cutover.sql"), "utf8");
const runtime = readFileSync(resolve(root, "src/lib/review/pilot-runtime.ts"), "utf8");
const pilot = readFileSync(resolve(root, "src/lib/supabase/pilot.ts"), "utf8");
const registry = readFileSync(resolve(root, "src/lib/review/registry.ts"), "utf8");
const documentation = readFileSync(resolve(root, "docs/PHASE_4D_4_OBJECTIVE_CUTOVER.md"), "utf8");
const sql = migration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

const issuerStart = sql.indexOf("create or replace function public.study_graph_issue_kuzushiji_objective_pilot_instance");
const stateStart = sql.indexOf("create or replace function public.study_graph_get_kuzushiji_pilot_objective_state");
const issuer = sql.slice(issuerStart, stateStart);

test("4D-4 widens instance target without rewriting or seeding existing rows", () => {
  assert.match(sql, /^begin; /);
  assert.match(sql, /drop constraint exercise_instances_srs_target_check/);
  assert.match(sql, /check \(srs_target in \('legacy-item', 'objective'\)\)/);
  assert.doesNotMatch(sql, /insert into private\.objective_review_state/);
  assert.doesNotMatch(sql, /update private\.objective_review_state/);
  assert.doesNotMatch(sql, /insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(sql, /update public\.(review_state|review_attempts)/);
  assert.match(documentation, /legacy state is not seeded/i);
});

test("Objective issuance and attribution are atomic and server-derived", () => {
  assert.ok(issuerStart >= 0 && stateStart > issuerStart);
  assert.match(issuer, /insert into private\.exercise_instances/);
  assert.match(issuer, /'objective'/);
  assert.match(issuer, /insert into private\.instance_objective_bindings/);
  assert.match(issuer, /private\.exercise_objective_bindings/);
  assert.match(issuer, /kuzushiji\.a\.eitaigura-u3042-00032-1\.read/);
  assert.match(issuer, /eob\.objective_version = 1/);
  assert.match(issuer, /eob\.evidence_use = 'srs'/);
  assert.match(issuer, /p_srs_epoch <> 1/);
  assert.doesNotMatch(issuer, /p_objective_id|p_objective_version|p_evidence_use/);
});

test("new cutover RPCs remain service-role only", () => {
  for (const fn of [
    "study_graph_issue_kuzushiji_objective_pilot_instance",
    "study_graph_get_kuzushiji_pilot_objective_state",
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*? to service_role`));
  }
  assert.doesNotMatch(sql, /grant execute[\s\S]* to (anon|authenticated|public)/);
});

test("runtime registers immutable Objective content before issuing the Objective instance", () => {
  assert.match(pilot, /study_graph_register_objective_definition/);
  assert.match(pilot, /study_graph_register_exercise_objective_binding/);
  assert.match(pilot, /study_graph_issue_kuzushiji_objective_pilot_instance/);
  assert.match(pilot, /p_srs_epoch: KUZUSHIJI_PILOT_SRS_EPOCH/);
  assert.doesNotMatch(pilot, /study_graph_issue_kuzushiji_pilot_instance\"/);
});

test("submission cuts Objective instances to Objective persistence but preserves old instance retries", () => {
  assert.match(runtime, /instance\.srs_target === \"objective\"/);
  assert.match(runtime, /recordKuzushijiObjectivePilotAttempt/);
  assert.match(runtime, /recordKuzushijiPilotAttempt/);
  assert.match(runtime, /resultFromStoredObjectiveReceipt/);
  assert.match(runtime, /resultFromStoredReceipt/);
  assert.match(runtime, /stored\.attempt_id !== request\.attemptId/);
  assert.match(runtime, /instance_already_answered/);
});

test("pilot queue authority is the Objective epoch, not legacy review_state", () => {
  assert.match(registry, /getKuzushijiPilotObjectiveState/);
  assert.match(registry, /objectiveState\.due_at/);
  assert.match(registry, /visualCandidates\.slice\(0, 1\)/);
  const kuzushijiSection = registry.slice(registry.indexOf("async function loadKuzushijiReview"), registry.indexOf("async function loadGraphPractice"));
  assert.doesNotMatch(kuzushijiSection, /getDueReviewItems|getReviewStates/);
});
