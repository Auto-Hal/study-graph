import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(root, "supabase/migrations/20260908140000_phase_4e_2_scope_snapshot_sync.sql");
const documentationPath = resolve(root, "docs/PHASE_4E_2_SNAPSHOT_SYNC.md");
const sql = readFileSync(migrationPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");
const normalized = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

test("Phase 4E-2 migration is additive and creates only the two snapshot tables", () => {
  assert.match(normalized, /^begin; /);
  assert.match(normalized, / commit;$/);
  assert.equal((normalized.match(/create table private\./g) ?? []).length, 2);
  assert.match(normalized, /create table private\.scope_knowledge_snapshots/);
  assert.match(normalized, /create table private\.project_snapshot_sync_state/);
  assert.doesNotMatch(normalized, /\bdrop\s+(table|function|schema|trigger|index)\b/);
  assert.doesNotMatch(normalized, /\btruncate\b/);
  assert.doesNotMatch(normalized, /alter table public\./);
  assert.doesNotMatch(normalized, /alter table private\.(review_state|review_attempts|exercise_instances|exercise_attempts|objective_review_state|objective_srs_applications)/);
  assert.doesNotMatch(normalized, /insert into public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalized, /update public\.(review_state|review_attempts)/);
  assert.doesNotMatch(normalized, /insert into private\.(exercise_instances|exercise_attempts|objective_review_state|objective_srs_applications)/);
});

test("snapshot archive fields, hash contract, and immutable trigger are present", () => {
  assert.match(normalized, /snapshot_id uuid primary key/);
  assert.match(normalized, /generation bigint not null check \(generation > 0\)/);
  assert.match(normalized, /constraint scope_knowledge_snapshots_project_generation_key unique \(project_id, generation\)/);
  assert.match(normalized, /content_hash text not null check \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(normalized, /source_evidence jsonb not null check \(jsonb_typeof\(source_evidence\) = 'object'\)/);
  assert.match(normalized, /scope_decisions jsonb not null check \(jsonb_typeof\(scope_decisions\) = 'array'\)/);
  assert.match(normalized, /before update or delete on private\.scope_knowledge_snapshots/);
  assert.match(normalized, /execute function private\.study_graph_archive_row_is_immutable\(\)/);
});

test("sync state has a forward pointer, lease fields, and restrictive current FK", () => {
  assert.match(normalized, /current_snapshot_id uuid null/);
  assert.match(normalized, /current_generation bigint not null default 0/);
  assert.match(normalized, /next_generation bigint not null default 1/);
  assert.match(normalized, /active_run_id uuid null/);
  assert.match(normalized, /active_generation bigint null/);
  assert.match(normalized, /active_lease_until timestamptz null/);
  assert.match(normalized, /foreign key \(current_snapshot_id\) references private\.scope_knowledge_snapshots \(snapshot_id\) on update restrict on delete restrict/);
  assert.match(normalized, /next_generation > current_generation/);
});

test("RPCs are server-only and use project serialization and stale-run guards", () => {
  for (const name of [
    "study_graph_begin_scope_snapshot_sync",
    "study_graph_publish_scope_knowledge_snapshot",
    "study_graph_fail_scope_snapshot_sync",
    "study_graph_get_current_scope_knowledge_snapshot",
  ]) {
    assert.match(normalized, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(normalized, new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(normalized, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`));
  }
  assert.match(normalized, /security definer/);
  assert.match(normalized, /set search_path = pg_catalog/);
  assert.match(normalized, /pg_advisory_xact_lock\(hashtextextended\('scope-sync\|'/);
  assert.match(normalized, /snapshot_sync_in_progress/);
  assert.match(normalized, /snapshot_sync_lease_expired/);
  assert.match(normalized, /snapshot_publish_stale/);
  assert.match(normalized, /snapshot_run_mismatch/);
  assert.match(normalized, /active_run_id is distinct from p_run_id/);
  assert.match(normalized, /last_error_code = p_error_code/);
});

test("PL/pgSQL sync-state updates qualify columns that collide with OUT parameters", () => {
  assert.equal(
    (
      normalized.match(
        /update private\.project_snapshot_sync_state as st[\s\S]*?where st\.project_id = p_project_id/g,
      ) ?? []
    ).length,
    4,
  );
  assert.doesNotMatch(normalized, /\bwhere\s+project_id\s*=\s*p_project_id\b/);
});

test("publish requires complete evidence and moves the current pointer transactionally", () => {
  assert.match(normalized, /\(?p_source_evidence ->> 'paginationComplete'\)? is distinct from 'true'/);
  assert.match(normalized, /\(?p_source_evidence ->> 'relationCompleteness'\)? is distinct from 'true'/);
  assert.match(normalized, /snapshot_evidence_incomplete/);
  assert.match(normalized, /insert into private\.scope_knowledge_snapshots/);
  assert.match(normalized, /update private\.project_snapshot_sync_state/);
  assert.match(normalized, /current_snapshot_id = p_snapshot_id/);
  assert.match(normalized, /current_generation = p_generation/);
  assert.match(normalized, /last_succeeded_at = v_now/);
  assert.match(normalized, /return query select v_existing\.snapshot_id/);
  assert.match(normalized, /snapshot_publish_conflict/);
});

test("both tables deny browser direct access and documentation records the boundary", () => {
  for (const table of ["scope_knowledge_snapshots", "project_snapshot_sync_state"]) {
    assert.match(normalized, new RegExp(`alter table private\\.${table} enable row level security`));
    assert.match(normalized, new RegExp(`revoke all on table private\\.${table} from public, anon, authenticated, service_role`));
  }
  assert.match(documentation, /strict server.*reader/i);
  assert.match(documentation, /pagination/i);
  assert.match(documentation, /relationCompleteness/i);
  assert.match(documentation, /immutable/i);
  assert.match(documentation, /lease/i);
  assert.match(documentation, /no demo/i);
  assert.match(documentation, /runtime.*not.*cutover/i);
  assert.match(documentation, /rollback/i);
});
