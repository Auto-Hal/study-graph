import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const foundationMigration = read("supabase/migrations/20260917021000_phase_5a_1b_objective_opportunity_rpc_foundation.sql");
const lockOrderMigration = read("supabase/migrations/20260918010500_phase_5a_1b_objective_issuer_lock_order.sql");
const migration = `${foundationMigration}\n${lockOrderMigration}`;

function functionBody(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.lastIndexOf(marker);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = migration.indexOf("\ncreate or replace function public.", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

test("historical Objective instance bindings remain valid without fabricated v2 context", () => {
  assert.match(foundationMigration, /scheduling_context_version is null[\s\S]*opportunity_kind is null[\s\S]*expected_state_revision is null/);
  assert.doesNotMatch(migration, /update\s+private\.instance_objective_bindings\s+set\s+scheduling_context_version/i);
});

test("v2 scheduling context keeps unseen, due, and practice semantics strict", () => {
  assert.match(foundationMigration, /opportunity_kind = 'unseen'[\s\S]*evidence_use = 'srs'[\s\S]*expected_state_revision = 0[\s\S]*expires_at is not null/);
  assert.match(foundationMigration, /opportunity_kind = 'due'[\s\S]*evidence_use = 'srs'[\s\S]*expected_state_revision > 0[\s\S]*expires_at is not null/);
  assert.match(foundationMigration, /opportunity_kind = 'practice'[\s\S]*evidence_use = 'practice-only'[\s\S]*expected_state_revision is null[\s\S]*expires_at is null/);
});

test("active SRS uniqueness is Objective-key scoped and never time-predicate based", () => {
  const uniqueStart = foundationMigration.indexOf("create unique index objective_srs_opportunities_one_active_idx");
  const uniqueEnd = foundationMigration.indexOf("create index objective_srs_opportunities_instance_idx", uniqueStart);
  const unique = foundationMigration.slice(uniqueStart, uniqueEnd);
  for (const field of ["learner_id", "project_id", "objective_id", "srs_epoch"]) assert.match(unique, new RegExp(field));
  assert.match(unique, /where status = 'active'/);
  assert.doesNotMatch(unique, /expires_at|now\(|current_timestamp/i);
});

test("practice never creates an SRS opportunity row", () => {
  const issuer = functionBody("study_graph_issue_objective_instance_v2");
  assert.match(issuer, /p_intent = 'practice'[\s\S]*v_effective_evidence_use := 'practice-only'/);
  assert.match(issuer, /if v_effective_evidence_use = 'srs' then[\s\S]*insert into private\.objective_srs_opportunities/);
});

test("issuer derives expected revision under the Objective lock and pins v1 policies", () => {
  const issuer = functionBody("study_graph_issue_objective_instance_v2");
  assert.doesNotMatch(issuer.slice(0, issuer.indexOf("returns table")), /expected_state_revision|opportunity_kind|effective_evidence_use/);
  const lock = issuer.indexOf("pg_advisory_xact_lock");
  const stateLock = issuer.indexOf("from private.objective_review_state", lock);
  assert.ok(lock >= 0 && stateLock > lock);
  assert.match(issuer, /v_expected_state_revision := 0/);
  assert.match(issuer, /v_expected_state_revision := v_state\.state_revision/);
  assert.match(issuer, /interval '604800 seconds'/);
  assert.match(issuer, /'deterministic-correctness-cap-v1'/);
  assert.match(issuer, /'on-publication-v1'/);
});

test("issuer and acceptance use the same mutable instance -> opportunity -> state ordering", () => {
  const issuer = functionBody("study_graph_issue_objective_instance_v2");
  const issuerObjectiveLock = issuer.indexOf("'objective|'");
  const issuerActiveProbe = issuer.indexOf("from private.objective_srs_opportunities oso", issuerObjectiveLock);
  const issuerInstanceLock = issuer.indexOf("from private.exercise_instances ei", issuerActiveProbe);
  const issuerOpportunityLock = issuer.indexOf("from private.objective_srs_opportunities oso", issuerInstanceLock);
  const issuerStateLock = issuer.indexOf("from private.objective_review_state ors", issuerOpportunityLock);
  assert.ok(issuerObjectiveLock >= 0 && issuerActiveProbe > issuerObjectiveLock);
  assert.ok(issuerInstanceLock > issuerActiveProbe && issuerOpportunityLock > issuerInstanceLock && issuerStateLock > issuerOpportunityLock);

  const accept = functionBody("study_graph_record_objective_attempt_v2");
  const attemptLock = accept.indexOf("'objective-v2-attempt|'");
  const objectiveLock = accept.indexOf("'objective|'", attemptLock);
  const instanceForUpdate = accept.indexOf("from private.exercise_instances ei", objectiveLock);
  const opportunityForUpdate = accept.indexOf("from private.objective_srs_opportunities oso", objectiveLock);
  const stateForUpdate = accept.indexOf("from private.objective_review_state ors", objectiveLock);
  assert.ok(attemptLock >= 0 && objectiveLock > attemptLock);
  assert.ok(instanceForUpdate > objectiveLock && opportunityForUpdate > instanceForUpdate && stateForUpdate > opportunityForUpdate);
});

test("issuer reuses a valid active SRS opportunity and lazily terminalizes only the old row", () => {
  const issuer = functionBody("study_graph_issue_objective_instance_v2");
  assert.match(issuer, /v_active_binding\.expires_at > v_now[\s\S]*return query select[\s\S]*true/);
  assert.match(issuer, /update private\.objective_srs_opportunities oso[\s\S]*where oso\.opportunity_id = v_active\.opportunity_id[\s\S]*and oso\.instance_id = v_active\.instance_id[\s\S]*and oso\.status = 'active'/);
});

test("v2 acceptance is DB-authoritative for expected revision and deterministic grading", () => {
  const accept = functionBody("study_graph_record_objective_attempt_v2");
  assert.match(accept, /expected_state_revision = 0 and not v_state_found/);
  assert.match(accept, /v_state\.state_revision = v_instance_binding\.expected_state_revision/);
  assert.match(accept, /if p_is_correct = false then[\s\S]*v_effective_grade := 'again'/);
  assert.match(accept, /p_is_correct = true and p_self_evaluation is not null[\s\S]*v_effective_grade := p_self_evaluation/);
  assert.match(accept, /v_reason := 'stale-opportunity'/);
  assert.match(accept, /v_reason := 'issuance-context-missing'/);
});

test("no-SRS path cannot update Objective review state", () => {
  const accept = functionBody("study_graph_record_objective_attempt_v2");
  const applyStart = accept.indexOf("if v_srs_applied then");
  const stateMutation = accept.indexOf("insert into private.objective_review_state", applyStart);
  const applyEnd = accept.indexOf("end if;", stateMutation);
  assert.ok(applyStart >= 0 && stateMutation > applyStart && applyEnd > stateMutation);
  assert.equal(accept.indexOf("insert into private.objective_review_state", applyEnd + 1), -1);
});

test("Receipt v2 is emitted only by the new acceptance foundation while v1 writer stays v1", () => {
  const accept = functionBody("study_graph_record_objective_attempt_v2");
  const v1 = read("supabase/migrations/20260909100000_fix_objective_raw_answer_contract.sql");
  assert.match(accept, /'receiptVersion', 2/);
  assert.match(v1, /'receiptVersion', 1/);
  assert.doesNotMatch(v1, /'receiptVersion', 2/);
});

test("new v2 RPCs are service-role-only SECURITY DEFINER functions", () => {
  for (const name of ["study_graph_issue_objective_instance_v2", "study_graph_record_objective_attempt_v2"]) {
    const body = functionBody(name);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = pg_catalog/);
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role;`));
  }
});

test("current learner runtime does not call or import the v2 authority RPCs", () => {
  for (const path of [
    "src/lib/review/pilot-runtime.ts",
    "src/lib/supabase/pilot.ts",
    "app/api/review/pilot/issue/route.ts",
    "app/api/review/pilot/attempt/route.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /study_graph_issue_objective_instance_v2|study_graph_record_objective_attempt_v2/);
  }
});

test("request hash tuple and browser/offline storage contracts remain untouched", () => {
  const attempt = read("src/lib/review/exercises/attempt-content.ts");
  for (const field of ["attemptId", "instanceId", "rawAnswer", "selfEvaluation", "responseMs", "usedHint"]) {
    assert.match(attempt, new RegExp(`${field}: request\\.${field}`));
  }
  assert.doesNotMatch(attempt, /expectedStateRevision|opportunityKind|gradePolicyVersion/);
  assert.doesNotMatch(migration, /indexeddb|service.?worker|notion|openai/i);
});
