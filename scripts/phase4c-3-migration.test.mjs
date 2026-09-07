import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260907110000_phase_4c_3_instance_attempt.sql",
);
const documentationPath = resolve(root, "docs/PHASE_4C_3_INSTANCE_ATTEMPT.md");
const sql = readFileSync(migrationPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");
const normalizedSql = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("Phase 4C-3 creates only the two new private tables", () => {
  assert.match(normalizedSql, /create table private\.exercise_instances/);
  assert.match(normalizedSql, /create table private\.exercise_attempts/);
  assert.equal((normalizedSql.match(/create table private\./g) ?? []).length, 2);
  assert.doesNotMatch(normalizedSql, /alter table public\./);
  assert.doesNotMatch(normalizedSql, /drop table/);
  assert.match(normalizedSql, /begin;.*commit;/);
});

test("instances and attempts have the required identity, archive, and FK constraints", () => {
  assert.match(normalizedSql, /instance_id uuid primary key/);
  assert.match(normalizedSql, /attempt_id uuid primary key/);
  assert.match(normalizedSql, /instance_id uuid not null unique/);
  assert.match(normalizedSql, /exercise_instances_release_fk foreign key \(release_id\) references private\.content_releases \(release_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /exercise_instances_revision_fk foreign key \(revision_id\) references private\.exercise_revisions \(revision_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /exercise_instances_release_revision_fk foreign key \(release_id, revision_id\) references private\.content_release_entries \(release_id, revision_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /exercise_attempts_instance_fk foreign key \(instance_id\) references private\.exercise_instances \(instance_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /exercise_attempts_legacy_review_attempt_fk foreign key \(legacy_review_attempt_id\) references public\.review_attempts \(id\) on update restrict on delete restrict/);
});

test("new tables are RLS-protected and row mutation is guarded", () => {
  assert.match(normalizedSql, /alter table private\.exercise_instances enable row level security/);
  assert.match(normalizedSql, /alter table private\.exercise_attempts enable row level security/);
  assert.match(normalizedSql, /revoke all on table private\.exercise_instances from public, anon, authenticated/);
  assert.match(normalizedSql, /revoke all on table private\.exercise_attempts from public, anon, authenticated/);
  assert.match(normalizedSql, /before update or delete on private\.exercise_instances/);
  assert.match(normalizedSql, /before update or delete on private\.exercise_attempts/);
  assert.match(normalizedSql, /private\.study_graph_archive_row_is_immutable\(\)/);
});

test("the persistence RPC is server-only and transaction-safe", () => {
  assert.match(normalizedSql, /create or replace function public\.study_graph_record_exercise_attempt\(/);
  assert.match(normalizedSql, /security definer/);
  assert.match(normalizedSql, /set search_path = pg_catalog/);
  assert.match(normalizedSql, /attempt_conflict/);
  assert.match(normalizedSql, /instance_already_answered/);
  assert.match(normalizedSql, /pg_advisory_xact_lock/);
  assert.match(normalizedSql, /from public\.review_state rs where rs\.item_id = v_legacy_item_id for update/);
  assert.match(normalizedSql, /insert into public\.review_attempts/);
  assert.match(normalizedSql, /insert into public\.review_state/);
  assert.match(normalizedSql, /insert into private\.exercise_attempts/);
  assert.match(normalizedSql, /revoke all on function public\.study_graph_record_exercise_attempt\([\s\S]*from public, anon, authenticated, service_role/);
  assert.match(normalizedSql, /grant execute on function public\.study_graph_record_exercise_attempt\([\s\S]*to service_role/);
  assert.doesNotMatch(normalizedSql, /grant execute on function public\.study_graph_record_exercise_attempt\([\s\S]*to anon/);
  assert.doesNotMatch(normalizedSql, /grant execute on function public\.study_graph_record_exercise_attempt\([\s\S]*to authenticated/);
});

test("the RPC records no-SRS attempts and immutable receipts", () => {
  assert.match(normalizedSql, /srs_reason text not null/);
  assert.match(normalizedSql, /srs_applied boolean not null/);
  assert.match(normalizedSql, /legacy_review_attempt_id bigint/);
  assert.match(normalizedSql, /receipt jsonb not null/);
  assert.match(normalizedSql, /if p_srs_applied then/);
  assert.match(normalizedSql, /else v_review_state_after := v_review_state_before/);
  assert.match(normalizedSql, /'receiptVersion', 1/);
  assert.match(normalizedSql, /'legacyReviewAttemptId', v_legacy_review_attempt_id/);
});

test("rollback and later-phase boundaries are documented", () => {
  assert.match(documentation, /client correctness is not authority/i);
  assert.match(documentation, /server grading boundary/i);
  assert.match(documentation, /attempt_conflict/);
  assert.match(documentation, /instance_already_answered/);
  assert.match(documentation, /advisory lock/i);
  assert.match(documentation, /no-SRS/i);
  assert.match(documentation, /4C-4/);
  assert.match(documentation, /drop function if exists public\.study_graph_record_exercise_attempt/);
  assert.match(documentation, /drop table if exists private\.exercise_attempts/);
  assert.match(documentation, /drop table if exists private\.exercise_instances/);
});
