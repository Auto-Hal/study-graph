import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(resolve(root, "supabase/migrations/20260908150000_phase_4e_5_offline_prefetch.sql"), "utf8");
const normalized = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

test("Phase 4E-5 migration is additive and archive mappings are immutable", () => {
  assert.match(normalized, /^begin; /);
  assert.match(normalized, / commit;$/);
  assert.equal((normalized.match(/create table private\./g) ?? []).length, 1);
  assert.match(normalized, /create table private\.offline_instance_issuance_requests/);
  assert.match(normalized, /request_id uuid primary key/);
  assert.match(normalized, /instance_id uuid not null/);
  assert.match(normalized, /assets jsonb not null check \(jsonb_typeof\(assets\) = 'array'\)/);
  assert.match(normalized, /feedback jsonb not null check \(jsonb_typeof\(feedback\) = 'object'\)/);
  assert.match(normalized, /foreign key \(instance_id\) references private\.exercise_instances \(instance_id\) on update restrict on delete restrict/);
  assert.match(normalized, /foreign key \(snapshot_id\) references private\.scope_knowledge_snapshots \(snapshot_id\) on update restrict on delete restrict/);
  assert.match(normalized, /before update or delete on private\.offline_instance_issuance_requests/);
  assert.match(normalized, /enable row level security/);
  assert.match(normalized, /revoke all on table private\.offline_instance_issuance_requests from public, anon, authenticated, service_role/);
  assert.doesNotMatch(normalized, /\bdrop\s+(table|function|schema|trigger|index)\b/);
  assert.doesNotMatch(normalized, /\btruncate\b/);
  assert.doesNotMatch(normalized, /insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalized, /update public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalized, /insert into private\.(exercise_attempts|objective_review_state|objective_srs_applications)/);
});

test("v2 archive registration and prefetch functions are server-only hardened boundaries", () => {
  for (const name of [
    "study_graph_register_kuzushiji_pilot_v2_archive",
    "study_graph_prefetch_kuzushiji_objective_instance",
  ]) {
    assert.match(normalized, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(normalized, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.match(normalized, /security definer/);
  assert.match(normalized, /set search_path = pg_catalog/);
  assert.match(normalized, /pg_advisory_xact_lock\(\s*hashtextextended\(\s*'offline-prefetch\|'/);
  assert.match(normalized, /v_request\.learner_id <> p_learner_id/);
  assert.match(normalized, /not exists \( select 1 from private\.exercise_attempts as ea where ea\.instance_id = r\.instance_id \)/);
  assert.match(normalized, /v_request\.instance_id/);
  assert.match(normalized, /p_srs_epoch is distinct from 1/);
  assert.match(normalized, /p_scope_evidence ->> 'status'\) is distinct from 'eligible'/);
  assert.doesNotMatch(normalized, /on conflict \(release_id, revision_id\) do nothing/);
  assert.match(normalized, /on conflict on constraint content_release_entries_pkey do nothing/);
  assert.match(normalized, /p_new_issuance_allowed boolean/);
  assert.match(normalized, /p_legacy_item_id is distinct from '3ccd2793-4134-815f-95f0-cc64dcdb86c7'/);
  assert.match(normalized, /decision ->> 'subjectId' = '3ccd2793-4134-815f-95f0-cc64dcdb86c7'/);
  assert.doesNotMatch(normalized, /v_instance\.project_id/);
  for (const field of [
    "instance_id",
    "learner_id",
    "release_id",
    "revision_id",
    "presentation",
    "presentation_hash",
    "issued_at",
    "scope_evidence",
    "legacy_item_id",
    "legacy_exercise_id",
  ]) {
    assert.match(normalized, new RegExp(`v_instance\\.${field}`));
  }
});

test("prefetch function preserves request idempotency and one-unused-instance semantics", () => {
  const functionBody = normalized.slice(normalized.indexOf("create or replace function public.study_graph_prefetch_kuzushiji_objective_instance"));
  assert.ok(functionBody.indexOf("where r.request_id = p_request_id") < functionBody.indexOf("where r.learner_id = p_learner_id"));
  assert.match(functionBody, /offline_prefetch_request_conflict/);
  assert.match(functionBody, /not exists \( select 1 from private\.exercise_attempts as ea where ea\.instance_id = r\.instance_id \)/);
  assert.match(functionBody, /if exists \( select 1 from private\.exercise_attempts as ea where ea\.instance_id = v_instance\.instance_id \)/);
  assert.match(functionBody, /order by r\.created_at asc limit 1/);
  assert.match(functionBody, /insert into private\.exercise_instances/);
  assert.match(functionBody, /insert into private\.instance_objective_bindings/);
  const requestRecovery = functionBody.indexOf("where r.request_id = p_request_id");
  const scopeGate = functionBody.indexOf("message = 'pilot_scope_not_eligible'");
  const reuse = functionBody.indexOf("order by r.created_at asc limit 1");
  const killSwitch = functionBody.indexOf("message = 'pilot_issuance_disabled'");
  const instanceInsert = functionBody.indexOf("insert into private.exercise_instances");
  assert.ok(requestRecovery >= 0 && requestRecovery < scopeGate, "same request recovery must precede Scope gate");
  assert.ok(scopeGate < reuse, "current Scope gate must precede same-device reuse");
  assert.ok(reuse < killSwitch, "same-device reuse must precede kill-switch rejection");
  assert.ok(killSwitch < instanceInsert, "kill-switch rejection must precede new instance insert");
  assert.match(functionBody, /coalesce\(p_new_issuance_allowed, false\) is not true/);
});
