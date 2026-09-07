import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  root,
  "supabase/migrations/20260907100000_phase_4c_2_content_archive.sql",
);
const documentationPath = resolve(root, "docs/PHASE_4C_2_ARCHIVE_SCHEMA.md");
const sql = readFileSync(migrationPath, "utf8");
const documentation = readFileSync(documentationPath, "utf8");
const normalizedSql = sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("Phase 4C-2 migration is additive and scoped to private archive tables", () => {
  assert.match(normalizedSql, /create schema if not exists private/);
  assert.match(normalizedSql, /create table private\.content_releases/);
  assert.match(normalizedSql, /create table private\.exercise_revisions/);
  assert.match(normalizedSql, /create table private\.content_release_entries/);
  assert.doesNotMatch(normalizedSql, /alter table public\./);
  assert.doesNotMatch(normalizedSql, /create table public\./);
  assert.doesNotMatch(normalizedSql, /drop table/);
  assert.match(normalizedSql, /begin;.*commit;/);
});

test("revision identity and manifest hash constraints support archive idempotency", () => {
  assert.match(normalizedSql, /constraint exercise_revisions_identity_key unique \(project_id, exercise_id, exercise_version\)/);
  assert.match(normalizedSql, /manifest_hash text not null unique/);
  assert.match(normalizedSql, /content_hash text not null check \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(normalizedSql, /canonicalization_version integer not null check \(canonicalization_version > 0\)/);
  assert.match(normalizedSql, /canonical_payload text not null/);
  assert.match(normalizedSql, /payload jsonb not null/);
});

test("release entries enforce foreign keys and restrict parent deletion", () => {
  assert.match(normalizedSql, /foreign key \(release_id\) references private\.content_releases \(release_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /foreign key \(revision_id\) references private\.exercise_revisions \(revision_id\) on update restrict on delete restrict/);
  assert.match(normalizedSql, /primary key \(release_id, revision_id\)/);
  assert.match(normalizedSql, /create index content_release_entries_revision_id_idx on private\.content_release_entries \(revision_id\)/);
});

test("archive rows reject mutation and browser roles receive no access", () => {
  assert.match(normalizedSql, /create or replace function private\.study_graph_archive_row_is_immutable\(\)/);
  assert.match(normalizedSql, /before update or delete on private\.content_releases/);
  assert.match(normalizedSql, /before update or delete on private\.exercise_revisions/);
  assert.match(normalizedSql, /before update or delete on private\.content_release_entries/);
  assert.match(normalizedSql, /alter table private\.content_releases enable row level security/);
  assert.match(normalizedSql, /alter table private\.exercise_revisions enable row level security/);
  assert.match(normalizedSql, /alter table private\.content_release_entries enable row level security/);
  assert.match(normalizedSql, /revoke usage on schema private from public, anon, authenticated/);
  assert.match(normalizedSql, /revoke all on table private\.content_releases from public, anon, authenticated/);
  assert.match(normalizedSql, /revoke all on table private\.exercise_revisions from public, anon, authenticated/);
  assert.match(normalizedSql, /revoke all on table private\.content_release_entries from public, anon, authenticated/);
  assert.doesNotMatch(normalizedSql, /security definer/);
});

test("rollback and canonicalization authority are documented", () => {
  assert.match(documentation, /Node canonicalization v1/);
  assert.match(documentation, /canonical_payload/);
  assert.match(documentation, /Operational status[\s\S]*outside the revision `contentHash`/);
  assert.match(documentation, /4C-3/);
  assert.match(documentation, /drop table if exists private\.content_release_entries/);
  assert.match(documentation, /drop table if exists private\.exercise_revisions/);
  assert.match(documentation, /drop table if exists private\.content_releases/);
});
