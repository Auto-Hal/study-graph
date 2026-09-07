import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260908100000_phase_4d_2_objective_persistence.sql",
);
const documentationPath = resolve(root, "docs/PHASE_4D_2_OBJECTIVE_PERSISTENCE.md");
const sql = readFileSync(migrationPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");
const normalizedSql = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

const objectiveAttemptStart = normalizedSql.indexOf(
  "create or replace function public.study_graph_record_objective_attempt",
);
const objectiveAttemptEnd = normalizedSql.indexOf(
  "revoke all on function public.study_graph_register_objective_definition",
);
const objectiveAttemptSql = normalizedSql.slice(objectiveAttemptStart, objectiveAttemptEnd);

test("Phase 4D-2 is additive and creates exactly the five Objective tables", () => {
  assert.match(normalizedSql, /^begin; /);
  assert.match(normalizedSql, / commit;\s*$/);
  assert.equal((normalizedSql.match(/create table private\./g) ?? []).length, 5);
  for (const table of [
    "objective_definitions",
    "exercise_objective_bindings",
    "instance_objective_bindings",
    "objective_review_state",
    "objective_srs_applications",
  ]) {
    assert.match(normalizedSql, new RegExp(`create table private\\.${table}`));
  }
  assert.doesNotMatch(normalizedSql, /\bdrop\s+(table|function|schema|trigger|index)\b/);
  assert.doesNotMatch(normalizedSql, /alter table public\./);
  assert.doesNotMatch(normalizedSql, /alter table private\.exercise_(instances|attempts)/);
  assert.doesNotMatch(normalizedSql, /insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalizedSql, /create or replace function public\.study_graph_record_exercise_attempt/);
});

test("Objective definitions archive semantic payloads without recomputing Node hashes", () => {
  assert.match(normalizedSql, /project_id text not null/);
  assert.match(normalizedSql, /objective_id text not null/);
  assert.match(normalizedSql, /objective_version integer not null check \(objective_version > 0\)/);
  assert.match(normalizedSql, /canonicalization_version integer not null check \(canonicalization_version > 0\)/);
  assert.match(normalizedSql, /canonical_payload text not null/);
  assert.match(normalizedSql, /content_hash text not null check \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(normalizedSql, /payload jsonb not null check \(jsonb_typeof\(payload\) = 'object'\)/);
  assert.match(normalizedSql, /primary key \(project_id, objective_id, objective_version\)/);
  assert.match(normalizedSql, /constraint objective_definitions_content_hash_key unique \(content_hash\)/);
  assert.match(normalizedSql, /objective-definition\|/);
  assert.match(normalizedSql, /objective_archive_conflict/);
  assert.match(normalizedSql, /objective_content_hash_conflict/);
  assert.doesNotMatch(normalizedSql, /digest\(|sha256|pgcrypto/);
});

test("Git revision content hashes resolve to immutable DB revision UUID bindings", () => {
  assert.match(normalizedSql, /revision_id uuid not null unique/);
  assert.match(normalizedSql, /foreign key \(revision_id\) references private\.exercise_revisions \(revision_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /foreign key \(project_id, objective_id, objective_version\) references private\.objective_definitions \(project_id, objective_id, objective_version\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /p_revision_content_hash text/);
  assert.match(normalizedSql, /er\.content_hash = p_revision_content_hash/);
  assert.match(normalizedSql, /revision_content_hash_not_found/);
  assert.match(normalizedSql, /revision_content_hash_ambiguous/);
  assert.match(normalizedSql, /exercise-objective-binding\|/);
  assert.match(normalizedSql, /exercise_objective_binding_conflict/);
  assert.match(normalizedSql, /p_evidence_use not in \('srs', 'practice-only'\)/);
});

test("instance Objective attribution is pinned once and is never backfilled", () => {
  assert.match(normalizedSql, /instance_id uuid primary key/);
  assert.match(normalizedSql, /foreign key \(instance_id\) references private\.exercise_instances \(instance_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /srs_epoch integer not null check \(srs_epoch > 0\)/);
  assert.match(normalizedSql, /instance-objective-binding\|/);
  assert.match(normalizedSql, /instance_objective_binding_conflict/);
  assert.match(normalizedSql, /revision_objective_binding_not_found/);
  assert.match(normalizedSql, /foreign key \(instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use\) references private\.instance_objective_bindings/);
  assert.match(documentation, /does not backfill/i);
});

test("Objective state uses learner/project/objective/epoch and remains the only mutable table", () => {
  assert.match(normalizedSql, /primary key \(learner_id, project_id, objective_id, srs_epoch\)/);
  assert.doesNotMatch(normalizedSql, /objective_review_state[\s\S]{0,1000}primary key \([^)]*objective_version/);
  assert.match(normalizedSql, /state_revision bigint not null default 1 check \(state_revision > 0\)/);
  assert.match(normalizedSql, /last_application_id uuid/);
  assert.match(normalizedSql, /objective_review_state_due_at_idx/);
  assert.doesNotMatch(normalizedSql, /before update or delete on private\.objective_review_state/);
});

test("Objective applications are immutable, one-per-attempt, and explicit about no-SRS reasons", () => {
  assert.match(normalizedSql, /attempt_id uuid not null unique/);
  assert.match(normalizedSql, /instance_id uuid not null unique/);
  assert.match(normalizedSql, /evidence_use text not null check \(evidence_use in \('srs', 'practice-only'\)\)/);
  assert.match(normalizedSql, /foreign key \(attempt_id\) references private\.exercise_attempts \(attempt_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /foreign key \(instance_id\) references private\.exercise_instances \(instance_id\) on update restrict on delete restrict/);
  for (const reason of [
    "applied",
    "grader-unavailable",
    "scope-not-eligible",
    "revision-quarantined",
    "revision-retired",
    "practice-only",
    "epoch-inactive",
  ]) assert.match(normalizedSql, new RegExp(`'${reason}'`));
  assert.match(normalizedSql, /constraint objective_srs_applications_plan_check check \(/);
  assert.match(normalizedSql, /applied = true and reason = 'applied'/);
  assert.match(normalizedSql, /applied = false and reason <> 'applied' and effective_grade is null and state_before is null and state_after is null/);
  assert.match(normalizedSql, /before update or delete on private\.objective_srs_applications/);
  assert.match(objectiveAttemptSql, /if p_srs_applied then v_state_before := to_jsonb\(v_state\);/);
  assert.match(normalizedSql, /and state_before is null and state_after is null/);
});

test("All Objective tables are RLS protected and browser roles have no direct table access", () => {
  for (const table of [
    "objective_definitions",
    "exercise_objective_bindings",
    "instance_objective_bindings",
    "objective_review_state",
    "objective_srs_applications",
  ]) {
    assert.match(normalizedSql, new RegExp(`alter table private\\.${table} enable row level security`));
    assert.match(normalizedSql, new RegExp(`revoke all on table private\\.${table} from public, anon, authenticated, service_role`));
  }
  for (const table of [
    "objective_definitions",
    "exercise_objective_bindings",
    "instance_objective_bindings",
    "objective_srs_applications",
  ]) assert.match(normalizedSql, new RegExp(`before update or delete on private\\.${table}`));
});

test("Registration RPCs are service-role-only and idempotent/conflict-aware", () => {
  const functions = [
    "study_graph_register_objective_definition",
    "study_graph_register_exercise_objective_binding",
    "study_graph_register_instance_objective_binding",
    "study_graph_record_objective_attempt",
  ];
  for (const name of functions) {
    assert.match(normalizedSql, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(normalizedSql, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(normalizedSql, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.doesNotMatch(normalizedSql, /grant execute on function public\.[^(]+\([\s\S]*?to (anon|authenticated)/);
  assert.match(normalizedSql, /security definer/);
  assert.match(normalizedSql, /set search_path = pg_catalog/);
});

test("Objective attempt transaction locks absent state, preserves retries, and does not touch legacy SRS", () => {
  assert.notEqual(objectiveAttemptStart, -1);
  assert.notEqual(objectiveAttemptEnd, -1);
  assert.match(objectiveAttemptSql, /objective-attempt\|/);
  assert.match(objectiveAttemptSql, /attempt_conflict/);
  assert.match(objectiveAttemptSql, /v_existing_attempt_instance_id <> p_instance_id/);
  assert.match(objectiveAttemptSql, /v_existing_attempt_learner_id <> p_learner_id/);
  assert.match(objectiveAttemptSql, /attempt_not_objective/);
  assert.match(objectiveAttemptSql, /instance_already_answered/);
  assert.match(objectiveAttemptSql, /objective\|.*v_instance_binding\.project_id.*v_instance_binding\.objective_id.*v_instance_binding\.srs_epoch/);
  assert.match(objectiveAttemptSql, /from private\.objective_review_state ors where[\s\S]*for update/);
  assert.match(objectiveAttemptSql, /insert into private\.exercise_attempts/);
  assert.match(objectiveAttemptSql, /insert into private\.objective_review_state/);
  assert.match(objectiveAttemptSql, /insert into private\.objective_srs_applications/);
  assert.doesNotMatch(objectiveAttemptSql, /insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(objectiveAttemptSql, /update public\.(review_state|review_attempts)/);
  assert.match(objectiveAttemptSql, /'receiptVersion', 1/);
  assert.match(objectiveAttemptSql, /'acceptedAt', v_now/);
  assert.match(objectiveAttemptSql, /'gradingStatus', p_grading_status/);
  assert.match(objectiveAttemptSql, /'isCorrect', p_is_correct/);
  assert.match(objectiveAttemptSql, /'evidenceUse', v_instance_binding\.evidence_use/);
  assert.match(objectiveAttemptSql, /'objectiveVersion'/);
  assert.match(objectiveAttemptSql, /'srsEpoch'/);
  assert.match(objectiveAttemptSql, /return query select v_existing_application\.receipt/);
});

test("Objective scheduler SQL mirrors the existing four-grade scheduler", () => {
  assert.match(objectiveAttemptSql, /when 'again' then[\s\S]*v_interval := 0[\s\S]*v_repetitions := 0[\s\S]*interval '10 minutes'/);
  assert.match(objectiveAttemptSql, /when 'hard' then[\s\S]*v_previous_interval = 0 then 1[\s\S]*ceil\(v_previous_interval \* 1\.2\)/);
  assert.match(objectiveAttemptSql, /when 'good' then[\s\S]*v_previous_interval = 0 then 2[\s\S]*round\(v_previous_interval \* 2\.2\)/);
  assert.match(objectiveAttemptSql, /when 'easy' then[\s\S]*v_previous_interval = 0 then 5[\s\S]*round\(v_previous_interval \* 3\.2\)/);
  assert.match(objectiveAttemptSql, /state_revision := case/);
  assert.match(objectiveAttemptSql, /v_state\.state_revision \+ 1/);
});

test("Documentation records the Phase 4D-2 boundary and integration limitation", () => {
  assert.match(documentation, /Node canonicalization.*hash authority/i);
  assert.match(documentation, /service-role-only/i);
  assert.match(documentation, /advisory lock/i);
  assert.match(documentation, /receipt/i);
  assert.match(documentation, /legacy.*isolation/i);
  assert.match(documentation, /runtime.*not connected/i);
  assert.match(documentation, /integration verification required/i);
  assert.match(documentation, /rollback/i);
});
