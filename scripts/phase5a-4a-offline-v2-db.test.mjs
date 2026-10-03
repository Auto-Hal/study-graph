// Disposable localhost PostgreSQL only. Never reads application credentials.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { canonicalizeExerciseRevision } from "../src/lib/review/exercises/revision.ts";
import { canonicalizeObjectiveDefinition, hashObjectiveDefinition } from "../src/lib/review/objectives.ts";
import { createPilotPresentation, hashPilotPresentation } from "../src/lib/review/exercises/attempt.ts";
import { kuzushijiPilotRevision, kuzushijiPilotRevisionPayload, kuzushijiPilotContentRelease, kuzushijiPilotRevisionV2, kuzushijiPilotRevisionV2Payload, kuzushijiPilotContentReleaseV2 } from "../src/lib/review/exercises/kuzushiji-revision.ts";
import { kuzushijiPilotObjectiveDefinition } from "../src/lib/review/exercises/kuzushiji-objective.ts";
import { KUZUSHIJI_PILOT_EXERCISE_ID, KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID } from "../src/lib/review/exercises/kuzushiji-pilot.ts";
import { createOfflineAssetDescriptor, createOfflinePilotFeedbackBundle } from "../src/lib/review/offline/model-core.ts";

assert.equal(process.env.STUDY_GRAPH_ISOLATED_DB, "1", "isolated DB opt-in required");
const admin = new URL(process.env.STUDY_GRAPH_TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/postgres");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(admin.hostname));
assert.equal(admin.pathname, "/postgres");
assert.equal(admin.search, "");
const database = `study_graph_5a4a_${randomBytes(6).toString("hex")}`;
const psql = process.env.STUDY_GRAPH_TEST_PSQL ?? "psql";
const learner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const device1 = "33333333-3333-4333-8333-333333333333";
const device2 = "44444444-4444-4444-8444-444444444444";
const snapshotId = "55555555-5555-4555-8555-555555555555";
const objective = kuzushijiPilotObjectiveDefinition.objectiveId;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value))}::jsonb`;
const env = (db = database) => ({ ...process.env, PGHOST: admin.hostname, PGPORT: admin.port || "5432", PGUSER: decodeURIComponent(admin.username), PGPASSWORD: decodeURIComponent(admin.password), PGDATABASE: db, PGCONNECT_TIMEOUT: "5", PGCLIENTENCODING: "UTF8" });
function run(query, db = database) {
  const r = spawnSync(psql, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", env: env(db), timeout: 120_000 });
  return r;
}
function sql(query, db) { const r = run(query, db); assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout.trim(); }
function fail(query, code) { const r = run(query); assert.notEqual(r.status, 0, "expected failure"); assert.match(r.stderr, new RegExp(code)); return r; }
function row(query) { return JSON.parse(sql(query).split(/\r?\n/).at(-1)); }
function asyncSql(query) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], { env: env() });
    let out = "", err = "";
    child.stdout.setEncoding("utf8").on("data", (s) => out += s);
    child.stderr.setEncoding("utf8").on("data", (s) => err += s);
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(JSON.parse(out.trim().split(/\r?\n/).at(-1))) : reject(new Error(err)));
    child.stdin.end(query);
  });
}
const release1 = kuzushijiPilotContentRelease.manifestHash;
const release2 = kuzushijiPilotContentReleaseV2.manifestHash;
const rev1 = "66666666-6666-4666-8666-666666666661";
const rev2 = "66666666-6666-4666-8666-666666666662";
const scope = { authority: "server-issuance", snapshotId, complete: true, status: "eligible", sourceReadStartedAt: "2026-09-25T00:00:00Z", sourceReadCompletedAt: "2026-09-25T00:00:01Z", reasonCodes: [] };
function presentation(version) { const value = createPilotPresentation(version === 1 ? kuzushijiPilotRevisionPayload : kuzushijiPilotRevisionV2Payload); return [j(value), q(hashPilotPresentation(value))]; }
function issue(learnerId = learner, version = 2) {
  const [p, hash] = presentation(version);
  return `set role service_role; select row_to_json(r) from public.study_graph_issue_objective_instance_v2(${q(learnerId)},${q(version === 1 ? release1 : release2)},${q(version === 1 ? rev1 : rev2)},${p},${hash},null,null,'ja-JP',${j(scope)},null,${q(KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID)},'character',${q(KUZUSHIJI_PILOT_EXERCISE_ID)},1,'scheduled') r;`;
}
function prefetch(requestId, deviceId = device1, learnerId = learner, create = true, version = 2, corrupt = false, snapshot = snapshotId, generation = 1) {
  const [basePresentation, hash] = presentation(version);
  const p = corrupt ? j({ ...createPilotPresentation(kuzushijiPilotRevisionV2Payload), front: "bad" }) : basePresentation;
  return `set role service_role; select row_to_json(r) from public.study_graph_prefetch_kuzushiji_objective_instance_v2(${q(requestId)},${q(learnerId)},'kuzushiji',${q(deviceId)},${create},${create},${q(version === 1 ? release1 : release2)},${q(version === 1 ? rev1 : rev2)},${q(snapshot)},${generation},${p},${hash},${j({ ...scope, snapshotId: snapshot })},${q(KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID)},${q(KUZUSHIJI_PILOT_EXERCISE_ID)},1) r;`;
}
function count(table, where = "true") { return Number(sql(`select count(*) from ${table} where ${where};`)); }
function archive(version, id) {
  const release = version === 1 ? kuzushijiPilotContentRelease : kuzushijiPilotContentReleaseV2;
  const rev = version === 1 ? kuzushijiPilotRevision : kuzushijiPilotRevisionV2;
  const payload = version === 1 ? kuzushijiPilotRevisionPayload : kuzushijiPilotRevisionV2Payload;
  return `insert into private.content_releases(release_id,manifest_schema_version,manifest_hash,manifest,source_git_sha) values (${q(release.manifestHash)},1,${q(release.manifestHash)},${j(release.manifest)},'isolated-test');
    insert into private.exercise_revisions(revision_id,project_id,exercise_id,exercise_version,content_hash,canonicalization_version,canonical_payload,payload,objective_id) values (${q(id)},'kuzushiji',${q(KUZUSHIJI_PILOT_EXERCISE_ID)},${version},${q(rev.contentHash)},1,${q(canonicalizeExerciseRevision(payload))},${j(payload)},${q(objective)});
    insert into private.content_release_entries(release_id,revision_id) values (${q(release.manifestHash)},${q(id)});
    insert into private.exercise_objective_bindings(revision_id,project_id,objective_id,objective_version,evidence_use) values (${q(id)},'kuzushiji',${q(objective)},1,'srs');`;
}
sql(`create database ${database};`, "postgres");
try {
  sql(`do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$; create schema extensions;`);
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((x) => x.endsWith(".sql")).sort();
  assert.equal(files.length, 22);
  for (const file of files) sql(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  assert.equal(sql("show server_version;").split(".")[0], "17");
  console.log("PASS migration 1-22 on isolated PostgreSQL 17");
  sql(`insert into private.objective_definitions(project_id,objective_id,objective_version,canonicalization_version,canonical_payload,content_hash,payload) values ('kuzushiji',${q(objective)},1,1,${q(canonicalizeObjectiveDefinition(kuzushijiPilotObjectiveDefinition))},${q(hashObjectiveDefinition(kuzushijiPilotObjectiveDefinition))},${j(kuzushijiPilotObjectiveDefinition)});`);
  sql(archive(1, rev1) + archive(2, rev2));
  sql(`insert into private.scope_knowledge_snapshots(snapshot_id,project_id,generation,schema_version,source_read_started_at,source_read_completed_at,published_at,valid_until,scope_policy_version,knowledge_projection_version,source_evidence,scope_decisions,knowledge_projection,content_hash) values (${q(snapshotId)},'kuzushiji',1,1,now()-interval '2 minutes',now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 day','policy','projection','{"paginationComplete":true,"relationCompleteness":true}',${j([{subjectId:KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,status:"eligible"}])},'{}',repeat('a',64)); insert into private.project_snapshot_sync_state(project_id,current_snapshot_id,current_generation,next_generation) values ('kuzushiji',${q(snapshotId)},1,2);`);
  const signature = "public.study_graph_prefetch_kuzushiji_objective_instance_v2(uuid,uuid,text,uuid,boolean,boolean,text,uuid,uuid,bigint,jsonb,text,jsonb,text,text,integer)";
  assert.equal(sql(`select prosecdef from pg_proc where oid=${q(signature)}::regprocedure;`), "t");
  assert.equal(sql(`select proconfig::text from pg_proc where oid=${q(signature)}::regprocedure;`), "{search_path=pg_catalog}");
  assert.equal(sql(`select exists(select from aclexplode(proacl) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc where oid=${q(signature)}::regprocedure;`), "f");
  for (const role of ["anon", "authenticated", "service_role"]) assert.equal(sql(`select has_function_privilege(${q(role)},${q(signature)},'EXECUTE');`), role === "service_role" ? "t" : "f");
  console.log("PASS service-role-only SECURITY DEFINER and fixed search_path");
  const v1 = row(issue(learner, 1));
  const request1 = "77777777-7777-4777-8777-777777777771";
  fail(prefetch(request1), "offline_asset_integrity_unavailable");
  assert.equal(row(issue(learner, 2)).instance_id, v1.instance_id);
  assert.equal(count("private.exercise_instances", `learner_id=${q(learner)}`), 1);
  assert.equal(count("private.offline_instance_issuance_requests"), 0);
  assert.equal(count("private.objective_srs_opportunities", `learner_id=${q(learner)} and status='active'`), 1);
  console.log("PASS active checksum-null v1 reuse, bounded offline failure, no mapping or duplicate");
  // Simulate accepted historical v1 lifecycle to test future-due gating and
  // subsequent candidate promotion without altering its immutable archive.
  sql(`update private.objective_srs_opportunities set status='terminal',terminal_reason='accepted',terminalized_at=now() where instance_id=${q(v1.instance_id)};
    insert into private.objective_review_state(learner_id,project_id,objective_id,srs_epoch,last_grade,repetitions,interval_days,last_reviewed_at,due_at,scheduler_version,state_revision) values (${q(learner)},'kuzushiji',${q(objective)},1,'good',1,2,now(),now()+interval '2 days','objective-four-grade-v1',1);`);
  fail(issue(learner, 2), "objective_not_due");
  assert.equal(count("private.exercise_instances", `learner_id=${q(learner)}`), 1);
  sql(`update private.objective_review_state set due_at=now()-interval '1 minute' where learner_id=${q(learner)} and objective_id=${q(objective)};`);
  const promoted = row(issue(learner, 2));
  assert.equal(promoted.revision_id, rev2);
  assert.notEqual(promoted.instance_id, v1.instance_id);
  assert.equal(count("private.objective_srs_opportunities", `learner_id=${q(learner)} and status='active'`), 1);
  assert.equal(sql(`select content_hash from private.exercise_revisions where revision_id=${q(rev1)};`), kuzushijiPilotRevision.contentHash);
  console.log("PASS historical v1 terminal state remains immutable; future due blocks, later due creates revision v2");
  // New learner starts with checksum-pinned v2; recovery is immutable and flag-independent.
  const request2 = "77777777-7777-4777-8777-777777777772";
  const a = row(prefetch(request2, device1, other));
  assert.equal(a.revision_id, rev2);
  assert.equal(a.assets[0].checksum, kuzushijiPilotRevisionV2Payload.visualAssets[0].checksum);
  assert.equal(a.assets[0].offlineReady, false);
  const selectedAsset = kuzushijiPilotRevisionV2Payload.visualAssets[0];
  assert.deepEqual(a.assets[0], createOfflineAssetDescriptor({
    assetId: selectedAsset.assetId, assetVersion: selectedAsset.assetVersion,
    src: selectedAsset.src, checksum: selectedAsset.checksum,
    revisionContentHash: kuzushijiPilotRevisionV2.contentHash,
    mediaType: selectedAsset.mediaType, width: selectedAsset.width,
    height: selectedAsset.height, source: selectedAsset.source, offlineReady: false,
  }));
  assert.deepEqual(a.feedback, createOfflinePilotFeedbackBundle({
    revisionContentHash: kuzushijiPilotRevisionV2.contentHash,
    acceptedAnswers: kuzushijiPilotRevisionV2Payload.answerSpec.acceptedAnswers,
    answerRows: [
      { label: "正解", value: kuzushijiPilotRevisionV2Payload.answerSpec.acceptedAnswers[0] },
      { label: "字母", value: kuzushijiPilotRevisionV2Payload.pilotMetadata.motherCharacter.value },
      { label: "学習ポイント", value: kuzushijiPilotRevisionV2Payload.explanation.summary },
    ],
  }));
  assert.equal(row(issue(other)).instance_id, a.instance_id);
  const recovered = row(prefetch(request2, device1, other, false));
  assert.deepEqual(recovered, a);
  fail(prefetch(request2, device2, other, false), "offline_prefetch_request_conflict");
  fail(prefetch(request2, device1, learner, false), "offline_prefetch_request_conflict");
  const b = row(prefetch("77777777-7777-4777-8777-777777777773", device2, other));
  assert.equal(b.instance_id, a.instance_id);
  assert.equal(b.snapshot_id, a.snapshot_id);
  assert.deepEqual(b.assets, a.assets);
  assert.deepEqual(b.feedback, a.feedback);
  console.log("PASS new offline v2, online reuse, exact recovery, conflicts, second-device pinned envelope");
  const third = "99999999-9999-4999-8999-999999999999";
  const requests = ["88888888-8888-4888-8888-888888888881", "88888888-8888-4888-8888-888888888882"];
  const raced = await Promise.all(requests.map((id, index) => asyncSql(prefetch(id, index ? device2 : device1, third))));
  assert.equal(raced[0].instance_id, raced[1].instance_id);
  assert.equal(count("private.objective_srs_opportunities", `learner_id=${q(third)} and status='active'`), 1);
  assert.equal(count("private.offline_instance_issuance_requests", `learner_id=${q(third)}`), 2);
  console.log("PASS real concurrent offline devices converge on one active opportunity");
  const raceLearner = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const [onlineRace, offlineRace] = await Promise.all([
    asyncSql(issue(raceLearner)),
    asyncSql(prefetch("88888888-8888-4888-8888-888888888883", device1, raceLearner)),
  ]);
  assert.equal(onlineRace.instance_id, offlineRace.instance_id);
  assert.equal(count("private.objective_srs_opportunities", `learner_id=${q(raceLearner)} and status='active'`), 1);
  console.log("PASS concurrent online/offline issuance converges on one active opportunity");
  const sameLearner = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sameId = "88888888-8888-4888-8888-888888888884";
  const sameRace = await Promise.all([asyncSql(prefetch(sameId, device1, sameLearner)), asyncSql(prefetch(sameId, device1, sameLearner))]);
  assert.deepEqual(sameRace[0], sameRace[1]);
  assert.equal(count("private.offline_instance_issuance_requests", `request_id=${q(sameId)}`), 1);
  console.log("PASS concurrent same request recovers exact committed mapping");
  const futureLearner = "aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const futureId = "88888888-8888-4888-8888-888888888885";
  sql(`insert into private.objective_review_state(learner_id,project_id,objective_id,srs_epoch,last_grade,repetitions,interval_days,last_reviewed_at,due_at,scheduler_version,state_revision) values (${q(futureLearner)},'kuzushiji',${q(objective)},1,'good',1,2,now()-interval '1 day',now()+interval '1 day','objective-four-grade-v1',7);`);
  fail(prefetch(futureId, device1, futureLearner), "objective_not_due");
  assert.equal(count("private.offline_instance_issuance_requests", `request_id=${q(futureId)}`), 0);
  assert.equal(count("private.exercise_instances", `learner_id=${q(futureLearner)}`), 0);
  sql(`update private.objective_review_state set due_at=now()-interval '1 minute' where learner_id=${q(futureLearner)} and objective_id=${q(objective)};`);
  const due = row(prefetch(futureId, device1, futureLearner));
  assert.equal(row(`select row_to_json(t) from (select opportunity_kind,expected_state_revision from private.instance_objective_bindings where instance_id=${q(due.instance_id)}) t;`).opportunity_kind, "due");
  assert.equal(Number(sql(`select expected_state_revision from private.instance_objective_bindings where instance_id=${q(due.instance_id)};`)), 7);
  assert.deepEqual(row(prefetch(futureId, device1, futureLearner, false)), due);
  console.log("PASS future due rejects without mapping; later due accepts same uncommitted request at exact revision 7");
  const failureLearner = "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const failureId = "88888888-8888-4888-8888-888888888886";
  fail(prefetch(failureId, device1, failureLearner, true, 2, true), "offline_persisted_content_mismatch");
  for (const table of ["private.offline_instance_issuance_requests", "private.exercise_instances", "private.objective_srs_opportunities"]) {
    assert.equal(count(table, `learner_id=${q(failureLearner)}`), 0);
  }
  assert.equal(row(prefetch(failureId, device1, failureLearner)).revision_id, rev2);
  console.log("PASS post-issuer descriptor failure rolls back instance, opportunity and mapping; uncommitted request may retry");
  const oldMissing = "88888888-8888-4888-8888-888888888887";
  fail(`set role service_role; select * from public.study_graph_prefetch_kuzushiji_objective_instance(${q(oldMissing)},${q(learner)},'kuzushiji',${q(device1)},null,null,null,null,null,null,null,null,null,null,null,1,true);`, "offline_prefetch_v1_issuance_closed");
  assert.equal(count("private.offline_instance_issuance_requests", `request_id=${q(oldMissing)}`), 0);
  const historicalLearner = "aaaaaaa5-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const historicalInstance = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const historicalRequest = "88888888-8888-4888-8888-888888888888";
  const [historicalPresentation, historicalHash] = presentation(1);
  sql(`insert into private.exercise_instances(instance_id,learner_id,release_id,revision_id,presentation,presentation_hash,locale,scope_evidence,legacy_item_id,legacy_item_kind,legacy_exercise_id,srs_target,srs_epoch) values (${q(historicalInstance)},${q(historicalLearner)},${q(release1)},${q(rev1)},${historicalPresentation},${historicalHash},'ja-JP','{}',${q(KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID)},'character',${q(KUZUSHIJI_PILOT_EXERCISE_ID)},'objective',1);
    insert into private.instance_objective_bindings(instance_id,project_id,objective_id,objective_version,srs_epoch,evidence_use) values (${q(historicalInstance)},'kuzushiji',${q(objective)},1,1,'srs');
    insert into private.offline_instance_issuance_requests(request_id,learner_id,project_id,device_id,instance_id,snapshot_id,snapshot_generation,assets,feedback) values (${q(historicalRequest)},${q(historicalLearner)},'kuzushiji',${q(device1)},${q(historicalInstance)},${q(snapshotId)},1,'[]','{}');`);
  const recoveredHistorical = row(prefetch(historicalRequest, device1, historicalLearner, false));
  assert.equal(recoveredHistorical.instance_id, historicalInstance);
  assert.equal(recoveredHistorical.revision_id, rev1);
  assert.equal(recoveredHistorical.revision_payload.visualAssets[0].checksum, null);
  assert.equal(sql(`select scheduling_context_version is null from private.instance_objective_bindings where instance_id=${q(historicalInstance)};`), "t");
  assert.equal(count("private.offline_instance_issuance_requests", `request_id=${q(historicalRequest)}`), 1);
  console.log("PASS old RPC recovery-only; historical checksum-null request recovers without context fabrication");
  const newerSnapshot = "55555555-5555-4555-8555-555555555556";
  sql(`insert into private.scope_knowledge_snapshots(snapshot_id,project_id,generation,schema_version,source_read_started_at,source_read_completed_at,published_at,valid_until,scope_policy_version,knowledge_projection_version,source_evidence,scope_decisions,knowledge_projection,content_hash) values (${q(newerSnapshot)},'kuzushiji',2,1,now()-interval '2 minutes',now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 day','policy','projection','{"paginationComplete":true,"relationCompleteness":true}',${j([{subjectId:KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,status:"eligible"}])},'{}',repeat('b',64));
    update private.project_snapshot_sync_state set current_snapshot_id=${q(newerSnapshot)},current_generation=2,next_generation=3 where project_id='kuzushiji';`);
  const laterDevice = row(prefetch("88888888-8888-4888-8888-888888888889", device1, other, true, 2, false, newerSnapshot, 2));
  assert.equal(laterDevice.instance_id, a.instance_id);
  assert.equal(laterDevice.snapshot_id, a.snapshot_id);
  assert.equal(laterDevice.snapshot_generation, a.snapshot_generation);
  assert.deepEqual(laterDevice.assets, a.assets);
  assert.deepEqual(laterDevice.feedback, a.feedback);
  console.log("PASS changed current snapshot does not change pinned envelope for reused instance");
} finally {
  assert.match(database, /^study_graph_5a4a_[a-f0-9]{12}$/);
  sql(`drop database ${database} with (force);`, "postgres");
}
