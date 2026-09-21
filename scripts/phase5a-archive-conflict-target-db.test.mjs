import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, "1", "explicit isolated DB opt-in required");
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres");
assert.ok(["postgresql:", "postgres:"].includes(admin.protocol));
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(admin.hostname), "remote databases forbidden");
assert.equal(admin.pathname, "/postgres", "connect to isolated administrative database only");
assert.equal(admin.search, "");

const database = "study_graph_archive_fix_" + randomBytes(6).toString("hex");
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
  return spawnSync(
    psql,
    ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"],
    { input: text, encoding: "utf8", env, timeout: 60_000 },
  );
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
  return JSON.parse(sql(text, db));
}
function row(text) {
  const value = sql(text);
  assert.notEqual(value, "", "expected one RPC result row");
  return JSON.parse(value.split(/\r?\n/)[0]);
}
function literal(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

const archiveRelease = "a".repeat(64);
const archiveContent = "b".repeat(64);
const objectiveContent = "c".repeat(64);
const presentationHash = "d".repeat(64);
const exerciseId = "kuzushiji.visual-reading.eitaigura-u3042-00032-1";
const objectiveId = "kuzushiji.a.eitaigura-u3042-00032-1.read";
const manifest = JSON.stringify({ fixture: "phase5a-archive-conflict-target" });
const payload = JSON.stringify({
  projectId: "kuzushiji",
  exerciseId,
  exerciseVersion: 1,
  objectiveId,
  status: "approved",
});
const objectivePayload = JSON.stringify({
  projectId: "kuzushiji",
  objectiveId,
  objectiveVersion: 1,
});
const learner = "22222222-2222-4222-8222-222222222222";
const practiceLearner = "33333333-3333-4333-8333-333333333333";
const dueLearner = "44444444-4444-4444-8444-444444444444";
const notDueLearner = "55555555-5555-4555-8555-555555555555";
const expiredLearner = "66666666-6666-4666-8666-666666666666";
const staleLearner = "77777777-7777-4777-8777-777777777777";
const expiredInstance = "88888888-8888-4888-8888-888888888888";

function archiveCall(manifestValue = manifest) {
  return [
    "\\set VERBOSITY verbose",
    "set plpgsql.variable_conflict = error;",
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_kuzushiji_pilot_archive(",
    [
      literal(archiveRelease),
      "1",
      literal(archiveRelease),
      literal(manifestValue) + "::jsonb",
      literal("phase5a-archive-fix-test"),
      literal("kuzushiji"),
      literal(exerciseId),
      "1",
      literal(archiveContent),
      "1",
      literal("fixture-canonical-payload"),
      literal(payload) + "::jsonb",
      literal(objectiveId),
    ].join(","),
    ") r;",
  ].join("\n");
}

function objectiveDefinitionCall() {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_objective_definition(",
    [
      literal("kuzushiji"),
      literal(objectiveId),
      "1",
      "1",
      literal("fixture-objective-canonical"),
      literal(objectiveContent),
      literal(objectivePayload) + "::jsonb",
    ].join(","),
    ") r;",
  ].join("\n");
}

function objectiveBindingCall() {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_register_exercise_objective_binding(",
    [
      literal(archiveContent),
      literal("kuzushiji"),
      literal(objectiveId),
      "1",
      literal("srs"),
    ].join(","),
    ") r;",
  ].join("\n");
}

function issueCall(learnerId, epoch, intent = "scheduled") {
  return [
    "set role service_role;",
    "select row_to_json(r) from public.study_graph_issue_objective_instance_v2(",
    [
      literal(learnerId),
      literal(archiveRelease),
      literal(archiveRevisionId),
      literal(JSON.stringify({ source: "archive-registrar" })) + "::jsonb",
      literal(presentationHash),
      "null",
      "null",
      literal("ja-JP"),
      literal(JSON.stringify({ source: "isolated-test" })) + "::jsonb",
      "null",
      literal("item"),
      literal("character"),
      literal("pilot"),
      String(epoch),
      literal(intent),
    ].join(","),
    ") r;",
  ].join("\n");
}

function stateInsert(learnerId, revision, dueExpression) {
  return [
    "insert into private.objective_review_state",
    "(learner_id, project_id, objective_id, srs_epoch, last_grade, repetitions, interval_days, last_reviewed_at, due_at, scheduler_version, state_revision)",
    "values (",
    [
      literal(learnerId),
      literal("kuzushiji"),
      literal(objectiveId),
      "1",
      literal("good"),
      "1",
      "2",
      "now() - interval '3 days'",
      dueExpression,
      literal("objective-four-grade-v1"),
      String(revision),
    ].join(","),
    ");",
  ].join(" ");
}

let archiveRevisionId;
let firstIssue;
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

  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migration20 = "20260921100000_fix_pilot_archive_conflict_target.sql";
  assert.equal(files.at(-1), migration20);
  assert.equal(files.length, 20);
  const firstNineteen = files.slice(0, 19);
  assert.equal(firstNineteen.length, 19);
  for (const file of firstNineteen) {
    sql(readFileSync(new URL("../supabase/migrations/" + file, import.meta.url), "utf8"));
  }
  assert.equal(sql("show server_version;").split(".")[0], "17");
  console.log("PASS exact migrations 1-19 applied in isolated PostgreSQL");

  const preFix = expectedFailure(archiveCall());
  const preFixText = (preFix.stderr || "") + (preFix.stdout || "");
  assert.match(preFixText, /42702/);
  assert.match(preFixText, /ambiguous/i);
  assert.match(preFixText, /release_id/);
  assert.match(preFixText, /study_graph_register_kuzushiji_pilot_archive/);
  console.log("PASS pre-fix registrar reproduces SQLSTATE 42702 release_id ambiguity");

  sql(readFileSync(new URL("../supabase/migrations/" + migration20, import.meta.url), "utf8"));
  const registrarMeta = json([
    "select json_build_object(",
    "'overloads',(select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'study_graph_register_kuzushiji_pilot_archive'),",
    "'definer',p.prosecdef,",
    "'config',p.proconfig,",
    "'result',pg_get_function_result(p.oid),",
    "'definition',pg_get_functiondef(p.oid))",
    "from pg_proc p where p.oid = 'public.study_graph_register_kuzushiji_pilot_archive(text,integer,text,jsonb,text,text,text,integer,text,integer,text,jsonb,text)'::regprocedure;",
  ].join("\n"));
  assert.equal(registrarMeta.overloads, 1);
  assert.equal(registrarMeta.definer, true);
  assert.deepEqual(registrarMeta.config, ["search_path=pg_catalog"]);
  assert.match(registrarMeta.result, /TABLE\(release_id text, revision_id uuid\)/i);
  assert.match(registrarMeta.definition, /on conflict on constraint content_release_entries_pkey/i);
  assert.doesNotMatch(registrarMeta.definition, /on conflict\s*\(\s*release_id\s*,\s*revision_id\s*\)/i);
  assert.equal(sql("select exists(select from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') from pg_proc where oid = 'public.study_graph_register_kuzushiji_pilot_archive(text,integer,text,jsonb,text,text,text,integer,text,integer,text,jsonb,text)'::regprocedure;"), "f");
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(sql("select has_function_privilege(" + literal(role) + ", 'public.study_graph_register_kuzushiji_pilot_archive(text,integer,text,jsonb,text,text,text,integer,text,integer,text,jsonb,text)', 'EXECUTE');"), role === "service_role" ? "t" : "f");
  }
  console.log("PASS registrar signature, SECURITY DEFINER, pg_catalog search_path, and service-role-only ACL");
  const registered = row(archiveCall());
  archiveRevisionId = registered.revision_id;
  assert.equal(registered.release_id, archiveRelease);
  assert.match(archiveRevisionId, /^[0-9a-f-]{36}$/i);
  const countsAfterInsert = json([
    "select json_build_object(",
    "'releases',(select count(*) from private.content_releases),",
    "'revisions',(select count(*) from private.exercise_revisions),",
    "'entries',(select count(*) from private.content_release_entries))",
  ].join("\n") + ";");
  assert.deepEqual(countsAfterInsert, { releases: 1, revisions: 1, entries: 1 });
  console.log("PASS migration 20 fresh archive registration and one release/revision/entry");

  const retry = row(archiveCall());
  assert.deepEqual(retry, registered);
  const countsAfterRetry = json([
    "select json_build_object(",
    "'releases',(select count(*) from private.content_releases),",
    "'revisions',(select count(*) from private.exercise_revisions),",
    "'entries',(select count(*) from private.content_release_entries))",
  ].join("\n") + ";");
  assert.deepEqual(countsAfterRetry, countsAfterInsert);
  console.log("PASS idempotent archive retry preserves attribution and counts");

  const conflict = expectedFailure(archiveCall(JSON.stringify({ fixture: "changed" })));
  assert.match((conflict.stderr || "") + (conflict.stdout || ""), /archive_conflict/);
  assert.doesNotMatch((conflict.stderr || "") + (conflict.stdout || ""), /42702/);
  console.log("PASS existing archive conflict behavior remains bounded");

  const objective = row(objectiveDefinitionCall());
  assert.equal(objective.objective_id, objectiveId);
  const binding = row(objectiveBindingCall());
  assert.equal(binding.revision_id, archiveRevisionId);
  assert.equal(binding.evidence_use, "srs");
  console.log("PASS archive -> Objective definition -> immutable binding registration");

  firstIssue = row(issueCall(learner, 1));
  assert.equal(firstIssue.opportunity_kind, "unseen");
  assert.equal(firstIssue.effective_evidence_use, "srs");
  assert.equal(firstIssue.expected_state_revision, 0);
  assert.equal(firstIssue.reused, false);
  assert.equal((Date.parse(firstIssue.expires_at) - Date.parse(firstIssue.issued_at)) / 1000, 604800);
  assert.deepEqual(
    Object.keys(firstIssue).sort(),
    ["instance_id", "release_id", "revision_id", "opportunity_kind", "effective_evidence_use", "expected_state_revision", "issued_at", "expires_at", "reused"].sort(),
  );
  console.log("PASS real archive registration -> Objective binding -> v2 unseen issuance and exact return shape/TTL");

  const reused = row(issueCall(learner, 1));
  assert.equal(reused.reused, true);
  assert.equal(reused.instance_id, firstIssue.instance_id);
  assert.equal(reused.release_id, archiveRelease);
  assert.equal(reused.revision_id, archiveRevisionId);
  console.log("PASS active opportunity reuse");

  const practice = row(issueCall(practiceLearner, 1, "practice"));
  assert.equal(practice.opportunity_kind, "practice");
  assert.equal(practice.effective_evidence_use, "practice-only");
  assert.equal(practice.expected_state_revision, null);
  assert.equal(practice.expires_at, null);
  assert.equal(sql("select count(*) from private.objective_srs_opportunities where learner_id = " + literal(practiceLearner) + ";"), "0");
  console.log("PASS practice remains outside active SRS opportunity slot");

  sql(stateInsert(dueLearner, 7, "now() - interval '1 day'"));
  const due = row(issueCall(dueLearner, 1));
  assert.equal(due.opportunity_kind, "due");
  assert.equal(due.expected_state_revision, 7);
  assert.equal(due.effective_evidence_use, "srs");
  console.log("PASS due issuance pins exact positive Objective state revision");

  sql(stateInsert(notDueLearner, 8, "now() + interval '1 day'"));
  const notDue = expectedFailure(issueCall(notDueLearner, 1));
  assert.match((notDue.stderr || "") + (notDue.stdout || ""), /objective_not_due/);
  console.log("PASS not-due rejection remains bounded");

  sql([
    "insert into private.exercise_instances (instance_id, learner_id, release_id, revision_id, presentation, presentation_hash, locale, scope_evidence, legacy_item_id, legacy_item_kind, legacy_exercise_id, srs_target, srs_epoch, issued_at)",
    "values (",
    [literal(expiredInstance), literal(expiredLearner), literal(archiveRelease), literal(archiveRevisionId), literal("{}") + "::jsonb", literal("e".repeat(64)), literal("ja-JP"), literal("{}") + "::jsonb", literal("item"), literal("character"), literal("pilot"), literal("objective"), "1", "now() - interval '8 days'"].join(","),
    ");",
    "insert into private.instance_objective_bindings (instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use, scheduling_context_version, opportunity_kind, expected_state_revision, grade_policy_version, activation_policy_version, issued_at, expires_at, due_at_observed)",
    "values (",
    [literal(expiredInstance), literal("kuzushiji"), literal(objectiveId), "1", "1", literal("srs"), "1", literal("unseen"), "0", literal("deterministic-correctness-cap-v1"), literal("on-publication-v1"), "now() - interval '8 days'", "now() - interval '1 second'", "null"].join(","),
    ");",
    "insert into private.objective_srs_opportunities (instance_id, learner_id, project_id, objective_id, objective_version, srs_epoch, evidence_use, status, created_at)",
    "values (",
    [literal(expiredInstance), literal(expiredLearner), literal("kuzushiji"), literal(objectiveId), "1", "1", literal("srs"), literal("active"), "now() - interval '8 days'"].join(","),
    ");",
  ].join("\n"));
  const expiredFirst = { instance_id: expiredInstance };
  const expiredReplacement = row(issueCall(expiredLearner, 1));
  assert.notEqual(expiredReplacement.instance_id, expiredFirst.instance_id);
  assert.equal(sql("select status from private.objective_srs_opportunities where instance_id = " + literal(expiredFirst.instance_id) + "::uuid;"), "terminal");
  assert.equal(sql("select terminal_reason from private.objective_srs_opportunities where instance_id = " + literal(expiredFirst.instance_id) + "::uuid;"), "expired");
  assert.equal(sql("select count(*) from private.objective_srs_opportunities where learner_id = " + literal(expiredLearner) + " and status = 'active';"), "1");
  console.log("PASS expired active opportunity terminalizes and replacement is issued");

  const staleFirst = row(issueCall(staleLearner, 1));
  sql(stateInsert(staleLearner, 9, "now() - interval '1 day'"));
  const staleReplacement = row(issueCall(staleLearner, 1));
  assert.notEqual(staleReplacement.instance_id, staleFirst.instance_id);
  assert.equal(staleReplacement.opportunity_kind, "due");
  assert.equal(staleReplacement.expected_state_revision, 9);
  assert.equal(sql("select status from private.objective_srs_opportunities where instance_id = " + literal(staleFirst.instance_id) + "::uuid;"), "terminal");
  assert.equal(sql("select terminal_reason from private.objective_srs_opportunities where instance_id = " + literal(staleFirst.instance_id) + "::uuid;"), "stale");
  assert.equal(sql("select count(*) from private.objective_srs_opportunities where learner_id = " + literal(staleLearner) + " and status = 'active';"), "1");
  console.log("PASS stale active opportunity terminalizes and replacement pins current revision");
} finally {
  assert.match(database, /^study_graph_archive_fix_[a-f0-9]{12}$/);
  sql("drop database " + database + ";", "postgres");
}
