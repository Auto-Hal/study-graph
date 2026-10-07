// Runs on newly created localhost databases only. No .env, hosted credentials, or browser writes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { capture, restore, withDisposableDatabase } from './backups/restore.mjs';
import { packCapture, summarizeCapture } from './backups/core.mjs';
import { kuzushijiPilotRevisionV2 as revision, kuzushijiPilotRevisionV2Payload as payload,
  kuzushijiPilotContentReleaseV2 as release } from '../src/lib/review/exercises/kuzushiji-revision.ts';
import { canonicalizeExerciseRevision } from '../src/lib/review/exercises/revision.ts';
import { canonicalizeObjectiveDefinition, hashObjectiveDefinition } from '../src/lib/review/objectives.ts';
import { kuzushijiPilotObjectiveDefinition as objective } from '../src/lib/review/exercises/kuzushiji-objective.ts';
import { createPilotPresentation, hashPilotPresentation } from '../src/lib/review/exercises/attempt.ts';
import { KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID as subject, KUZUSHIJI_PILOT_EXERCISE_ID as exercise } from '../src/lib/review/exercises/kuzushiji-pilot.ts';

await withDisposableDatabase(async (source) => {
  const learner=randomUUID(), other=randomUUID(), rev=randomUUID(), snapshot=randomUUID(), attempt=randomUUID();
  const presentation=createPilotPresentation(payload);
  const hash=hashPilotPresentation(presentation);
  const scope={authority:'server-issuance',snapshotId:snapshot,complete:true,status:'eligible',
    sourceReadStartedAt:'2026-10-07T00:00:00Z',sourceReadCompletedAt:'2026-10-07T00:00:01Z',reasonCodes:[]};
  await source.query(`insert into private.study_graph_config(key,value) values ('app_token','CREDENTIAL_SENTINEL');
    insert into public.review_attempts(id,item_id,item_kind,grade,due_at,answer_text) values (9007199254740993,'legacy','character','good',now()+interval '1 day','line one\n言い換え '' quote');
    insert into public.review_state(item_id,item_kind,last_grade,last_reviewed_at,due_at) values ('legacy','character','good',now(),now()+interval '1 day');`);
  await source.query(`insert into private.content_releases(release_id,manifest_schema_version,manifest_hash,manifest,source_git_sha) values ($1,1,$1,$2,'backup-test')`,[release.manifestHash,release.manifest]);
  await source.query(`insert into private.exercise_revisions(revision_id,project_id,exercise_id,exercise_version,content_hash,canonicalization_version,canonical_payload,payload,objective_id)
    values ($1,'kuzushiji',$2,2,$3,1,$4,$5,$6)`,[rev,exercise,revision.contentHash,canonicalizeExerciseRevision(payload),payload,objective.objectiveId]);
  await source.query(`insert into private.content_release_entries values ($1,$2)`,[release.manifestHash,rev]);
  await source.query(`insert into private.objective_definitions(project_id,objective_id,objective_version,canonicalization_version,canonical_payload,content_hash,payload)
    values ('kuzushiji',$1,1,1,$2,$3,$4)`,[objective.objectiveId,canonicalizeObjectiveDefinition(objective),hashObjectiveDefinition(objective),objective]);
  await source.query(`insert into private.exercise_objective_bindings(revision_id,project_id,objective_id,objective_version,evidence_use) values ($1,'kuzushiji',$2,1,'srs')`,[rev,objective.objectiveId]);
  await source.query(`insert into private.scope_knowledge_snapshots(snapshot_id,project_id,generation,schema_version,source_read_started_at,source_read_completed_at,published_at,valid_until,
    scope_policy_version,knowledge_projection_version,source_evidence,scope_decisions,knowledge_projection,content_hash)
    values ($1,'kuzushiji',1,1,now()-interval '2 minutes',now()-interval '1 minute',now()-interval '1 minute',now()+interval '1 day','policy','projection',
    '{"paginationComplete":true,"relationCompleteness":true}',$2,'{}',repeat('a',64))`,[snapshot,JSON.stringify([{subjectId:subject,status:'eligible'}])]);
  const activeRun=randomUUID();
  await source.query(`insert into private.project_snapshot_sync_state(project_id,current_snapshot_id,current_generation,next_generation,active_run_id,active_generation,
    active_started_at,active_lease_until,last_error_code,last_error_detail) values ('kuzushiji',$1,1,3,$2,2,now(),now()+interval '1 hour','test','ERROR_DETAIL_SENTINEL')`,[snapshot,activeRun]);
  const issueArgs=[learner,release.manifestHash,rev,presentation,hash,scope,subject,exercise];
  const issueSql=`select * from public.study_graph_issue_objective_instance_v2($1,$2,$3,$4::jsonb,$5,null,null,'ja-JP',$6::jsonb,null,$7,'character',$8,1,'scheduled')`;
  const instance=(await source.query(issueSql,issueArgs)).rows[0].instance_id;
  const recordSql=`select * from public.study_graph_record_objective_attempt_v2($1,$2,$3,$4,$5::jsonb,$6::jsonb,'graded','server',$7,$8,$9,true,'good',321,false,true,true)`;
  const recordArgs=[attempt,instance,learner,'f'.repeat(64),JSON.stringify('あ'),JSON.stringify('あ'),payload.gradingSpec.strategyId,payload.gradingSpec.strategyVersion,payload.gradingSpec.normalization];
  const receipt=(await source.query(recordSql,recordArgs)).rows[0].receipt;
  assert.equal((await source.query('select srs_applied from private.exercise_attempts where attempt_id=$1',[attempt])).rows[0].srs_applied,true);
  const request=randomUUID(), device=randomUUID();
  const prefetchSql=`select * from public.study_graph_prefetch_kuzushiji_objective_instance_v2($1,$2,'kuzushiji',$3,$4,$4,$5,$6,$7,1,$8::jsonb,$9,$10::jsonb,$11,$12,1)`;
  const prefetchArgs=[request,other,device,true,release.manifestHash,rev,snapshot,presentation,hash,scope,subject,exercise];
  const envelope=(await source.query(prefetchSql,prefetchArgs)).rows[0];
  const raw=await capture(source), backup=packCapture(raw);
  assert.ok(!JSON.stringify(raw).includes('CREDENTIAL_SENTINEL'));
  assert.ok(!JSON.stringify(raw).includes('ERROR_DETAIL_SENTINEL'));
  assert.ok(Object.values(raw.tables).every((rows)=>rows.length>0),'Every dependency must be exercised');
  assert.equal(raw.tables['public.review_attempts'][0].id,'9007199254740993');
  assert.equal((await source.query('select active_run_id from private.project_snapshot_sync_state')).rows[0].active_run_id,activeRun);
  console.log('PASS read-only capture of all 16 nonempty tables; credential and active lease excluded; bigint and answer text preserved');

  await withDisposableDatabase(async (target) => {
    const restored=await restore(target,backup);
    assert.deepEqual(summarizeCapture(restored),summarizeCapture(raw));
    assert.equal((await target.query('select count(*)::int as n from private.study_graph_config')).rows[0].n,0);
    await target.query('begin read only; set local role service_role');
    const saved=(await target.query('select * from public.study_graph_get_kuzushiji_pilot_attempt_receipt($1,$2)',[instance,learner])).rows[0];
    assert.deepEqual(saved.receipt,receipt);
    assert.equal((await target.query('select * from public.study_graph_objective_review_schedule($1)',[learner])).rows.length,1);
    await target.query('commit');
    const before=summarizeCapture(await capture(target));
    assert.deepEqual((await target.query(recordSql,recordArgs)).rows[0].receipt,receipt);
    assert.deepEqual((await target.query(prefetchSql,prefetchArgs.map((value,i)=>i===3?false:value))).rows[0],envelope);
    assert.deepEqual(summarizeCapture(await capture(target)),before,'Retry must not duplicate SRS, history or request mappings');
    assert.equal((await target.query("select nextval(pg_get_serial_sequence('public.review_attempts','id'))::text as n")).rows[0].n,'9007199254740994');
    await assert.rejects(()=>restore(target,backup),/destination must be empty/);
    assert.deepEqual(summarizeCapture(await capture(target)),before);
    console.log('PASS restore with FK/immutable guards active, stored receipt and due schedule, exact attempt/offline retry, next identity and nonempty refusal');
  });
  await withDisposableDatabase(async (target) => {
    const broken=structuredClone(raw);broken.tables['private.content_release_entries']=[];
    await assert.rejects(()=>restore(target,packCapture(broken)),{code:'23503'});
    assert.ok(Object.values((await capture(target)).tables).every((rows)=>rows.length===0));
    console.log('PASS missing FK dependency aborts the whole restore; target retains zero learning rows');
  });
});
console.log('PASS all disposable backup databases removed');
