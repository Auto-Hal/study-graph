// Real PostgreSQL, disposable database only. Never reads application .env files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { decodeObjectiveInstanceRouting } from "../src/lib/review/objective-runtime-core.ts";

assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, "1", "explicit isolated DB opt-in required");
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres");
assert.ok(["postgresql:", "postgres:"].includes(admin.protocol));
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(admin.hostname), "remote databases forbidden");
assert.equal(admin.pathname, "/postgres", "connect to isolated administrative database only");
assert.equal(admin.search, "");
const database = `study_graph_5a2a_${randomBytes(6).toString("hex")}`;
const psql = process.env.STUDY_GRAPH_TEST_PSQL ?? "psql";
function sql(text, db = database, expectSuccess = true) {
  const env = { ...process.env, PGHOST: admin.hostname, PGPORT: admin.port || "5432", PGUSER: decodeURIComponent(admin.username),
    PGPASSWORD: decodeURIComponent(admin.password), PGDATABASE: db, PGCONNECT_TIMEOUT: "5", PGCLIENTENCODING: "UTF8" };
  delete env.PGSERVICE; delete env.PGSERVICEFILE; delete env.PGOPTIONS;
  const result = spawnSync(psql, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { input: text, encoding: "utf8", env, timeout: 30_000 });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr || String(result.error));
  else assert.notEqual(result.status, 0, "expected database privilege denial");
  return result.stdout.trim();
}
const json = (query) => JSON.parse(sql(query));
const learner = "22222222-2222-4222-8222-222222222222";
const wrongLearner = "99999999-9999-4999-8999-999999999999";
const revision = "33333333-3333-4333-8333-333333333333";
const historical = "55555555-5555-4555-8555-555555555555";
const unbound = "66666666-6666-4666-8666-666666666666";
const rpc = "public.study_graph_resolve_objective_instance_routing";
const signature = `${rpc}(uuid,uuid)`;
function resolve(id, owner = learner, role = "service_role") {
  return json(`begin read only; set local role ${role}; select coalesce(json_agg(r),'[]'::json) from ${rpc}('${id}','${owner}') r; commit;`);
}
function snapshot() {
  const tables = json("select json_agg(format('%I.%I',schemaname,tablename) order by schemaname,tablename) from pg_tables where schemaname in ('private','public');");
  return tables.map((table) => sql(`select md5(coalesce(string_agg(row_to_json(r)::text, '' order by row_to_json(r)::text),'')) from ${table} r;`));
}
sql(`create database ${database};`, "postgres");
try {
  sql(`do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema extensions;`);
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) sql(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  console.log(`PASS full migration chain (${files.length} files), PostgreSQL ${sql("show server_version;")}`);
  const meta = json(`select json_build_object('definer',prosecdef,'config',proconfig,'volatility',provolatile,'definition',pg_get_functiondef(oid),
    'publicExecute',exists(select from aclexplode(proacl) a where a.grantee=0 and a.privilege_type='EXECUTE')) from pg_proc where oid='${signature}'::regprocedure;`);
  assert.equal(meta.definer, true); assert.deepEqual(meta.config, ["search_path=pg_catalog"]); assert.equal(meta.volatility, "s");
  assert.equal(meta.publicExecute, false);
  assert.doesNotMatch(meta.definition, /\b(insert|update|delete)\b|pg_advisory|for\s+update/i);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(sql(`select has_function_privilege('${role}','${signature}','EXECUTE');`), role === "service_role" ? "t" : "f");
    assert.equal(sql(`select has_table_privilege('${role}','private.instance_objective_bindings','SELECT');`), "f");
    sql(`set role ${role}; select * from private.instance_objective_bindings;`, database, false);
    if (role !== "service_role") sql(`set role ${role}; select * from ${rpc}('${historical}','${learner}');`, database, false);
  }
  assert.equal(sql("select relrowsecurity from pg_class where oid='private.instance_objective_bindings'::regclass;"), "t");
  console.log("PASS SECURITY DEFINER, pg_catalog, PUBLIC/anon/authenticated revoked, service-role RPC only, RLS/private table denied");

  // Minimal immutable archive fixture. The actual v2 issuer creates all v2 context.
  sql(`insert into private.content_releases values ('release',1,repeat('a',64),'{}','fixture',now());
    insert into private.exercise_revisions (revision_id,project_id,exercise_id,exercise_version,content_hash,canonicalization_version,canonical_payload,payload)
      values ('${revision}','kuzushiji','fixture',1,repeat('b',64),1,'{}','{"status":"approved","gradingSpec":{"strategyId":"legacy-text-v1","strategyVersion":1,"normalization":"review-session-ja-v1"}}');
    insert into private.content_release_entries values ('release','${revision}');
    insert into private.objective_definitions (project_id,objective_id,objective_version,canonicalization_version,canonical_payload,content_hash,payload)
      values ('kuzushiji','objective',1,1,'{}',repeat('c',64),'{}');
    insert into private.exercise_objective_bindings (revision_id,project_id,objective_id,objective_version,evidence_use)
      values ('${revision}','kuzushiji','objective',1,'srs');
    insert into private.exercise_instances (instance_id,learner_id,release_id,revision_id,presentation,presentation_hash,locale,scope_evidence,legacy_item_id,legacy_item_kind,legacy_exercise_id,srs_target,srs_epoch)
      select id,'${learner}','release','${revision}','{}',repeat('d',64),'ja-JP','{}','item','knowledge','fixture','objective','1'
      from (values ('${historical}'::uuid),('${unbound}'::uuid)) ids(id);
    insert into private.instance_objective_bindings (instance_id,project_id,objective_id,objective_version,srs_epoch,evidence_use)
      values ('${historical}','kuzushiji','objective',1,1,'srs');`);
  function issue(epoch, intent = "scheduled") {
    return json(`set role service_role; select row_to_json(r) from public.study_graph_issue_objective_instance_v2(
      '${learner}','release','${revision}','{}',repeat('d',64),null,null,'ja-JP','{}',null,'item','knowledge','fixture',${epoch},'${intent}') r;`);
  }
  const unseen = issue(1);
  sql(`insert into private.objective_review_state (learner_id,project_id,objective_id,srs_epoch,last_grade,repetitions,interval_days,last_reviewed_at,due_at,scheduler_version,state_revision)
    values ('${learner}','kuzushiji','objective',2,'good',1,2,now()-interval '3 days',now()-interval '1 day','objective-four-grade-v1',7);`);
  const due = issue(2);
  const practice = issue(1, "practice");
  const before = snapshot();
  const h = resolve(historical);
  assert.equal(decodeObjectiveInstanceRouting(h, historical).acceptanceVersion, "v1");
  for (const key of ["scheduling_context_version", "opportunity_kind", "expected_state_revision", "grade_policy_version", "activation_policy_version", "issued_at", "expires_at", "due_at_observed"]) assert.equal(h[0][key], null);
  for (const [issued, kind, expected] of [[unseen,"unseen",0],[due,"due",7],[practice,"practice",null]]) {
    const rows = resolve(issued.instance_id);
    const row = rows[0];
    assert.equal(Object.keys(row).length, 14);
    assert.equal(row.opportunity_kind, kind); assert.equal(row.expected_state_revision, expected);
    assert.equal(row.evidence_use, kind === "practice" ? "practice-only" : "srs");
    assert.equal(row.issued_at, issued.issued_at); assert.equal(row.expires_at, issued.expires_at);
    assert.equal(row.grade_policy_version, "deterministic-correctness-cap-v1");
    assert.equal(row.activation_policy_version, "on-publication-v1");
    assert.equal(decodeObjectiveInstanceRouting(rows, issued.instance_id).acceptanceVersion, "v2");
    if (kind !== "practice") assert.equal((Date.parse(row.expires_at)-Date.parse(row.issued_at))/1000,604800);
  }
  for (const rows of [resolve(unseen.instance_id,wrongLearner),resolve(unbound),resolve(wrongLearner)]) {
    assert.deepEqual(rows, []);
    assert.throws(() => decodeObjectiveInstanceRouting(rows, unseen.instance_id), { code: "instance_unavailable" });
  }
  assert.deepEqual(snapshot(), before);
  console.log("PASS ownership/missing binding, historical null context, exact unseen/due/practice facts, real SQL -> TS routing, no mutation");
} finally {
  // Only the random database created by this test can be removed.
  assert.match(database, /^study_graph_5a2a_[a-f0-9]{12}$/);
  sql(`drop database ${database};`, "postgres");
}
