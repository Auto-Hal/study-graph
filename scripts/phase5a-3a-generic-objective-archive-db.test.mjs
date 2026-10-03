import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { canonicalizeExerciseRevision } from "../src/lib/review/exercises/revision.ts";
import {
  philosophyArcheContentRelease,
  philosophyArcheObjectiveDefinition,
  philosophyArcheRevision,
  philosophyArcheRevisionPayload,
} from "../src/lib/review/exercises/test-fixtures/philosophy-arche.ts";
import {
  canonicalizeObjectiveDefinition,
  hashObjectiveDefinition,
} from "../src/lib/review/objectives.ts";

assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, "1", "explicit isolated DB opt-in required");
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres");
assert.ok(["postgresql:", "postgres:"].includes(admin.protocol));
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(admin.hostname), "remote databases forbidden");
assert.equal(admin.pathname, "/postgres", "connect to isolated administrative database only");
assert.equal(admin.search, "");

const database = "study_graph_generic_archive_" + randomBytes(6).toString("hex");
const psql = process.env.STUDY_GRAPH_TEST_PSQL ?? "psql";
function runPsql(text, db = database) {
  const env = {
    ...process.env,
    PGHOST: admin.hostname,
    PGPORT: admin.port || "5432",
    PGUSER: decodeURIComponent(admin.username),
    PGPASSWORD: decodeURIComponent(admin.password),
    PGDATABASE: db,
    PGCONNECT_TIMEOUT: "5",
    PGCLIENTENCODING: "UTF8",
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  delete env.PGOPTIONS;
  return spawnSync(psql, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: text,
    encoding: "utf8",
    env,
    timeout: 120_000,
  });
}
function sql(text, db = database) {
  const result = runPsql(text, db);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout.trim();
}
function expectedFailure(text, db = database) {
  const result = runPsql(text, db);
  assert.notEqual(result.status, 0, "expected PostgreSQL statement failure");
  return result;
}
function json(text, db = database) {
  const value = sql(text, db);
  assert.notEqual(value, "", "expected JSON result");
  return JSON.parse(value.split(/\r?\n/).at(-1));
}
function row(text) {
  const value = sql(text);
  assert.notEqual(value, "", "expected one RPC result row");
  return JSON.parse(value.split(/\r?\n/)[0]);
}
function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

const presentationHash = "d".repeat(64);
const learnerId = "11111111-1111-4111-8111-111111111111";
const instanceIdWrongLearner = "22222222-2222-4222-8222-222222222222";
const { manifest: contentReleaseManifest, manifestHash: releaseId } = philosophyArcheContentRelease;
const projectId = philosophyArcheRevision.projectId;
const exerciseId = philosophyArcheRevision.exerciseId;
const objectiveId = philosophyArcheRevision.objectiveId;
const contentHash = philosophyArcheRevision.contentHash;
const canonicalPayload = canonicalizeExerciseRevision(philosophyArcheRevisionPayload);
const manifest = JSON.stringify(contentReleaseManifest);
const payload = JSON.stringify(philosophyArcheRevisionPayload);
const objectivePayload = JSON.stringify(philosophyArcheObjectiveDefinition);
const objectiveCanonicalPayload = canonicalizeObjectiveDefinition(philosophyArcheObjectiveDefinition);
const objectiveHash = hashObjectiveDefinition(philosophyArcheObjectiveDefinition);

function archiveCall({
  manifestValue = manifest,
  payloadValue = payload,
  release = releaseId,
  content = contentHash,
  canonicalPayloadValue = canonicalPayload,
  project = projectId,
  exercise = exerciseId,
  objective = objectiveId,
} = {}) {
  return [
    "set plpgsql.variable_conflict = error;",
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_objective_archive(",
    [
      literal(release), String(contentReleaseManifest.manifestSchemaVersion), literal(release), literal(manifestValue) + "::jsonb", literal(philosophyArcheContentRelease.provenance?.sourceGitSha ?? "phase5a-3a-test"),
      literal(project), literal(exercise), String(philosophyArcheRevision.exerciseVersion), literal(content), String(philosophyArcheRevisionPayload.canonicalizationVersion), literal(canonicalPayloadValue),
      literal(payloadValue) + "::jsonb", literal(objective),
    ].join(","),
    ") r;",
  ].join("\n");
}
function objectiveDefinitionCall() {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_objective_definition(",
    [literal(philosophyArcheObjectiveDefinition.projectId), literal(philosophyArcheObjectiveDefinition.objectiveId), String(philosophyArcheObjectiveDefinition.objectiveVersion), "1", literal(objectiveCanonicalPayload), literal(objectiveHash), literal(objectivePayload) + "::jsonb"].join(","),
    ") r;",
  ].join("\n");
}
function objectiveBindingCall() {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_exercise_objective_binding(",
    [literal(philosophyArcheRevision.contentHash), literal(projectId), literal(objectiveId), "1", literal("srs")].join(","),
    ") r;",
  ].join("\n");
}
function issueCall() {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_issue_objective_instance_v2(",
    [
      literal(learnerId), literal(releaseId), literal(archiveRevisionId), literal(JSON.stringify({ source: "generic-archive" })) + "::jsonb",
      literal(presentationHash), "null", "null", literal("ja-JP"), literal("{}") + "::jsonb", "null",
      literal("arche"), literal("knowledge"), literal(exerciseId), "1", literal("scheduled"),
    ].join(","),
    ") r;",
  ].join("\n");
}

const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((file) => file.endsWith(".sql")).sort();
assert.equal(files.length, 22);
assert.equal(files.at(-2), "20260922100000_phase_5a_3a_generic_objective_archive.sql");
const historicalFiles = files.slice(0, 20);
assert.equal(historicalFiles.length, 20);
assert.equal(philosophyArcheRevision.pilotMetadata, null);
assert.deepEqual(philosophyArcheRevision.stimuli, []);
assert.deepEqual(philosophyArcheRevision.visualAssets, []);
assert.deepEqual(contentReleaseManifest.revisionEntries[0].assets, []);
assert.equal(contentReleaseManifest.revisionEntries[0].grader.strategyId, "legacy-text-v1");
assert.equal(contentReleaseManifest.revisionEntries[0].normalizerVersion, "review-session-ja-v1");

let archiveRevisionId;
let issuedInstanceId;
sql("create database " + database + ";", "postgres");
try {
  sql([
    "do $$ begin",
    "  if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;",
    "  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;",
    "  if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;",
    "end $$;",
    "create schema extensions;",
  ].join("\n"));
  for (const file of files) sql(readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8"));
  assert.equal(sql("show server_version;").split(".")[0], "17");
  assert.equal(sql("set plpgsql.variable_conflict = error; show plpgsql.variable_conflict;"), "error");
  console.log("PASS exact migrations 1-21 applied in isolated PostgreSQL 17 with plpgsql.variable_conflict=error");

  const functionMeta = json([
    "select json_build_object(",
    "'overloads',(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='study_graph_register_objective_archive'),",
    "'definer',p.prosecdef,",
    "'config',array_to_json(p.proconfig),",
    "'result',pg_get_function_result(p.oid),",
    "'definition',pg_get_functiondef(p.oid))",
    "from pg_proc p where p.oid='public.study_graph_register_objective_archive(text,integer,text,jsonb,text,text,text,integer,text,integer,text,jsonb,text)'::regprocedure;",
  ].join("\n"));
  assert.equal(functionMeta.overloads, 1);
  assert.equal(functionMeta.definer, true);
  assert.deepEqual(functionMeta.config, ["search_path=pg_catalog"]);
  assert.match(functionMeta.result, /TABLE\(release_id text, revision_id uuid\)/i);
  assert.match(functionMeta.definition, /on conflict on constraint content_release_entries_pkey do nothing/i);
  assert.doesNotMatch(functionMeta.definition, /on conflict\s*\(\s*release_id\s*,\s*revision_id\s*\)/i);

  const resolverMeta = json([
    "select json_build_object(",
    "'overloads',(select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='study_graph_resolve_objective_instance_archive'),",
    "'definer',p.prosecdef,",
    "'config',array_to_json(p.proconfig),",
    "'result',pg_get_function_result(p.oid),",
    "'definition',pg_get_functiondef(p.oid))",
    "from pg_proc p where p.oid='public.study_graph_resolve_objective_instance_archive(uuid,uuid)'::regprocedure;",
  ].join("\n"));
  assert.equal(resolverMeta.overloads, 1);
  assert.equal(resolverMeta.definer, true);
  assert.deepEqual(resolverMeta.config, ["search_path=pg_catalog"]);
  assert.doesNotMatch(resolverMeta.definition, /\b(insert|update|delete|for\s+update|pg_advisory)\b/i);
  for (const [name, signature] of [
    ["study_graph_register_objective_archive", "text,integer,text,jsonb,text,text,text,integer,text,integer,text,jsonb,text"],
    ["study_graph_resolve_objective_instance_archive", "uuid,uuid"],
  ]) {
    assert.equal(sql(`select count(*) from pg_proc where oid = 'public.${name}(${signature})'::regprocedure;`), "1");
    assert.equal(sql(`select exists(select from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') from pg_proc where oid = 'public.${name}(${signature})'::regprocedure;`), "f");
    assert.equal(sql(`select has_function_privilege('anon', 'public.${name}(${signature})', 'EXECUTE');`), "f");
    assert.equal(sql(`select has_function_privilege('authenticated', 'public.${name}(${signature})', 'EXECUTE');`), "f");
    assert.equal(sql(`select has_function_privilege('service_role', 'public.${name}(${signature})', 'EXECUTE');`), "t");
  }
  console.log("PASS generic registrar/resolver signatures, SECURITY DEFINER, pg_catalog search_path, and service-role ACL");

  const registered = row(archiveCall());
  archiveRevisionId = registered.revision_id;
  assert.equal(registered.release_id, releaseId);
  assert.match(archiveRevisionId, /^[0-9a-f-]{36}$/i);
  const persistedArchive = json([
    "select json_build_object(",
    "'manifest_hash',(select cr.manifest_hash from private.content_releases cr where cr.release_id = " + literal(releaseId) + "),",
    "'manifest',(select cr.manifest from private.content_releases cr where cr.release_id = " + literal(releaseId) + "),",
    "'source_git_sha',(select cr.source_git_sha from private.content_releases cr where cr.release_id = " + literal(releaseId) + "),",
    "'content_hash',er.content_hash,",
    "'canonicalization_version',er.canonicalization_version,",
    "'canonical_payload',er.canonical_payload,",
    "'payload',er.payload,",
    "'objective_id',er.objective_id,",
    "'entry_count',(select count(*) from private.content_release_entries e where e.release_id = " + literal(releaseId) + "))",
    "from private.exercise_revisions er where er.revision_id = " + literal(archiveRevisionId) + "::uuid;",
  ].join("\n"));
  assert.deepEqual(persistedArchive, {
    manifest_hash: releaseId,
    manifest: contentReleaseManifest,
    source_git_sha: philosophyArcheContentRelease.provenance.sourceGitSha,
    content_hash: philosophyArcheRevision.contentHash,
    canonicalization_version: philosophyArcheRevisionPayload.canonicalizationVersion,
    canonical_payload: canonicalPayload,
    payload: philosophyArcheRevisionPayload,
    objective_id: objectiveId,
    entry_count: 1,
  });
  assert.deepEqual(json("select json_build_object('releases',(select count(*) from private.content_releases),'revisions',(select count(*) from private.exercise_revisions),'entries',(select count(*) from private.content_release_entries));"), { releases: 1, revisions: 1, entries: 1 });
  console.log("PASS non-Kuzushiji Philosophy archive registration creates one release, revision, and entry");

  const retry = row(archiveCall());
  assert.deepEqual(retry, registered);
  assert.deepEqual(json("select json_build_object('releases',(select count(*) from private.content_releases),'revisions',(select count(*) from private.exercise_revisions),'entries',(select count(*) from private.content_release_entries));"), { releases: 1, revisions: 1, entries: 1 });
  console.log("PASS generic archive retry is idempotent");

  const conflict = expectedFailure(archiveCall({ manifestValue: JSON.stringify({ changed: true }) }));
  assert.match((conflict.stderr || "") + (conflict.stdout || ""), /archive_conflict/);
  const mismatch = expectedFailure(archiveCall({ payloadValue: JSON.stringify({ ...JSON.parse(payload), projectId: "wrong-project" }) }));
  assert.match((mismatch.stderr || "") + (mismatch.stdout || ""), /revision_payload_identity_mismatch/);
  console.log("PASS generic archive conflict and payload identity mismatch remain bounded");

  const objective = row(objectiveDefinitionCall());
  assert.equal(objective.objective_id, objectiveId);
  const binding = row(objectiveBindingCall());
  assert.equal(binding.revision_id, archiveRevisionId);
  assert.equal(binding.evidence_use, "srs");
  console.log("PASS archive -> generic Objective definition -> Exercise-to-Objective binding");

  const issue = row(issueCall());
  issuedInstanceId = issue.instance_id;
  assert.equal(issue.opportunity_kind, "unseen");
  assert.equal(issue.effective_evidence_use, "srs");
  assert.equal(issue.expected_state_revision, 0);
  assert.equal(issue.reused, false);
  assert.deepEqual(Object.keys(issue).sort(), ["instance_id", "release_id", "revision_id", "opportunity_kind", "effective_evidence_use", "expected_state_revision", "issued_at", "expires_at", "reused"].sort());
  console.log("PASS existing generic v2 issuer accepts Philosophy archive without changing Objective/SRS semantics");

  const beforeCounts = json("select json_build_object('instances',(select count(*) from private.exercise_instances),'bindings',(select count(*) from private.instance_objective_bindings));");
  const resolved = row(`set role service_role; select row_to_json(r) from public.study_graph_resolve_objective_instance_archive(${literal(issuedInstanceId)}::uuid, ${literal(learnerId)}::uuid) r;`);
  assert.equal(resolved.instance_id, issuedInstanceId);
  assert.equal(resolved.learner_id, learnerId);
  assert.equal(resolved.project_id, projectId);
  assert.equal(resolved.exercise_id, exerciseId);
  assert.equal(resolved.exercise_version, 1);
  assert.equal(resolved.revision_id, archiveRevisionId);
  assert.equal(resolved.release_id, releaseId);
  assert.equal(resolved.srs_target, "objective");
  assert.equal(resolved.content_hash, philosophyArcheRevision.contentHash);
  assert.deepEqual(resolved.revision_payload, philosophyArcheRevisionPayload);
  assert.equal(resolved.revision_payload.objectiveId, philosophyArcheRevision.objectiveId);
  assert.deepEqual(resolved.presentation, { source: "generic-archive" });
  const wrongLearner = json(`select coalesce(json_agg(r), '[]'::json) from public.study_graph_resolve_objective_instance_archive(${literal(issuedInstanceId)}::uuid, ${literal(instanceIdWrongLearner)}::uuid) r;`);
  assert.deepEqual(wrongLearner, []);
  const afterCounts = json("select json_build_object('instances',(select count(*) from private.exercise_instances),'bindings',(select count(*) from private.instance_objective_bindings));");
  assert.deepEqual(afterCounts, beforeCounts);
  console.log("PASS generic resolver returns persisted Philosophy authority, enforces learner scope, and performs no mutation");
} finally {
  assert.match(database, /^study_graph_generic_archive_[a-f0-9]{12}$/);
  sql("drop database " + database + ";", "postgres");
}
