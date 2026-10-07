import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { capture, withDisposableDatabase } from './backups/restore.mjs';

const owner = '22222222-2222-4222-8222-222222222222', other = '99999999-9999-4999-8999-999999999999';
const token = 'history-test-token-only';
const signature = 'public.study_graph_learning_history(uuid,text,text,text,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone,text,text,integer)';
await withDisposableDatabase(async (client) => {
  await client.query("insert into private.study_graph_config(key,value) values ('app_token_sha256',$1)",[createHash('sha256').update(token).digest('hex')]);
  const hash = 'a'.repeat(64), release = 'history-test';
  await client.query("insert into private.content_releases(release_id,manifest_schema_version,manifest_hash,manifest,source_git_sha) values ($1,1,$2,'{}','history-test')",[release,hash]);
  const ids = [], instances = [];
  // Seed immutable dependencies first; never bypass archive guards for fixtures.
  await client.query(`insert into public.review_attempts(id,item_id,item_kind,grade,previous_interval_days,interval_days,reviewed_at,due_at,answer_text) values (9007199254740994,'item','character','good',0,1,'2026-10-07T14:59:59.999999Z','2026-10-09','答え')`);
  await client.query(`insert into private.objective_definitions(project_id,objective_id,objective_version,canonicalization_version,canonical_payload,content_hash,payload) values ('kuzushiji','objective',1,1,'{}',$1,'{}')`,[hash]);
  for (const [index,project] of ['kuzushiji','western-art-history','philosophy','philosophy'].entries()) {
    const rev=randomUUID(),instance=randomUUID(),attempt=randomUUID(); ids.push(attempt); instances.push(instance);
    const explained=index===2, learner=index===3?other:owner;
    const payload={projectId:project,exerciseId:'history-'+index,front:'当時の問題'+index,prompt:'保存版の問い',gradingSpec:{strategyId:explained?'rubric-self-evaluation-v1':'legacy-text-v1'},answerSpec:{acceptedAnswers:['答え']},explanation:{summary:'保存版の解説'}};
    await client.query(`insert into private.exercise_revisions(revision_id,project_id,exercise_id,exercise_version,content_hash,canonicalization_version,canonical_payload,payload,objective_id) values ($1,$2,$3,1,$4,1,'{}',$5,'objective')`,[rev,project,payload.exerciseId,hash,payload]);
    await client.query('insert into private.content_release_entries values ($1,$2)',[release,rev]);
    await client.query(`insert into private.exercise_instances(instance_id,learner_id,release_id,revision_id,presentation,presentation_hash,locale,scope_evidence,legacy_item_id,legacy_item_kind,legacy_exercise_id,srs_target,srs_epoch) values ($1,$2,$3,$4,$5,$6,'ja-JP','{}','item','character',$7,$8,$9)`,[instance,learner,release,rev,{unitId:project==='philosophy'?'philosophy-arche-1':null},hash,payload.exerciseId,index===0?'objective':'legacy-item',index===0?7:null]);
    await client.query(`insert into private.exercise_attempts(attempt_id,instance_id,learner_id,request_hash,raw_answer,grading_status,grading_authority,grading_strategy_id,grading_strategy_version,normalizer_version,is_correct,self_evaluation,scope_accepted,srs_applied,srs_reason,receipt,submitted_at,legacy_review_attempt_id) values ($1,$2,$3,$4,$5,$6,'server','test',1,'test',$7,$8,true,false,'grader-unavailable',$9,$10,$11)`,[attempt,instance,learner,hash,JSON.stringify(explained?'  自分の説明\n言い換え。  ':'答え'),explained?'ungraded':'graded',explained?null:index===0?false:true,index===1?'hard':'good',{reason:'practice-only',dueAt:null},index===0?'2026-10-07T14:59:59.999999Z':'2026-10-07T15:00:00.000001Z',index===0?'9007199254740994':null]);
  }
  await client.query(`insert into public.review_attempts(id,item_id,item_kind,grade,previous_interval_days,interval_days,reviewed_at,due_at,answer_text) values (9007199254740993,'unknown-node','knowledge','again',0,1,'2026-10-07T15:00:00.000001Z','2026-10-09','以前の回答')`);
  // A compatibility row linked to a modern attempt must not appear twice.
  await client.query(`insert into private.instance_objective_bindings(instance_id,project_id,objective_id,objective_version,srs_epoch,evidence_use) values ($1,'kuzushiji','objective',1,7,'srs')`,[instances[0]]);
  await client.query(`insert into private.objective_review_state(learner_id,project_id,objective_id,srs_epoch,last_grade,repetitions,interval_days,last_reviewed_at,due_at,scheduler_version,state_revision) values ($1,'kuzushiji','objective',7,'good',1,2,'2026-10-07','2026-10-10T00:00:00Z','objective-four-grade-v1',1),($2,'kuzushiji','objective',7,'good',1,2,'2026-10-07','2026-10-20T00:00:00Z','objective-four-grade-v1',1)`,[owner,other]);
  const meta=(await client.query('select prosecdef,provolatile,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(meta.prosecdef,true);assert.equal(meta.provolatile,'s');assert.deepEqual(meta.proconfig,['search_path=pg_catalog']);
  for(const role of ['anon','authenticated','service_role']) {
    const grant=(await client.query('select has_function_privilege($1,$2,\'EXECUTE\') as allowed',[role,signature])).rows[0].allowed;
    assert.equal(grant,role==='service_role');
    assert.equal((await client.query("select has_table_privilege($1,'private.exercise_attempts','SELECT') as allowed",[role])).rows[0].allowed,false);
    if(role!=='service_role') {
      await client.query('begin read only');await client.query('set local role '+role);
      await assert.rejects(client.query('select * from public.study_graph_learning_history($1)',[owner]),/permission denied/);
      await client.query('rollback');
    }
  }
  const before = JSON.stringify((await capture(client)).tables);
  async function read(options={}) {
    const args={p_learner_id:owner,p_legacy_token:token,p_limit:31,...options};
    const keys=Object.keys(args);assert.ok(keys.every(k=>/^p_[a-z_]+$/.test(k)));
    await client.query('begin read only'); await client.query('set local role service_role');
    try { const rows=(await client.query('select * from public.study_graph_learning_history('+keys.map((k,i)=>k+' => $'+(i+1)).join(',')+')',Object.values(args))).rows;await client.query('commit');return rows; }
    catch(error){await client.query('rollback');throw error;}
  }
  const all=await read();assert.equal(all.length,4);assert.ok(!all.some(r=>r.record_id===ids[3]));
  assert.ok(!all.some(r=>r.record_id==='legacy-9007199254740994'));
  const scheduled=all.find(r=>r.record_id===ids[0]);assert.equal(scheduled.due_at,null);assert.equal(scheduled.current_due_at.toISOString(),'2026-10-10T00:00:00.000Z');
  assert.equal(all[0].record_id,'legacy-9007199254740993');assert.ok(all.every(r=>r.detail===null));
  const page=await read({p_limit:2});const last=page.at(-1);
  // PostgreSQL JS Date loses microseconds: get the transport timestamp from SQL JSON instead.
  const exact=(await client.query('select submitted_at::text as at from private.exercise_attempts where attempt_id=$1',[last.record_id])).rows[0].at;
  const rest=await read({p_before_at:exact,p_before_id:last.record_id,p_limit:2});assert.equal(new Set([...page,...rest].map(r=>r.record_id)).size,4);
  assert.equal((await read({p_project_id:'philosophy'})).length,1);
  assert.equal((await read({p_unit_id:'philosophy-arche-1'})).length,1);
  assert.equal((await read({p_start_at:'2026-10-08T00:00:00+09:00',p_end_at:'2026-10-09T00:00:00+09:00'})).length,3);
  assert.equal((await read({p_recheck_only:true})).length,3);
  const detail=(await read({p_record_id:ids[2]}))[0];assert.equal(detail.is_correct,null);assert.equal(detail.srs_reason,'practice-only');assert.equal(detail.detail.rawAnswer,'  自分の説明\n言い換え。  ');
  assert.equal((await read({p_record_id:ids[3]})).length,0);
  assert.equal((await read({p_legacy_token:null})).length,3);
  await assert.rejects(read({p_legacy_token:'wrong'}),/unauthorized/);
  await assert.rejects(read({p_before_id:ids[0]}),/invalid_history_query/);
  await assert.rejects(read({p_limit:52}),/invalid_history_query/);
  assert.equal(JSON.stringify((await capture(client)).tables),before);
  // Identify old knowledge only from published snapshots, never an unpublished newer archive.
  for(const [project,generation,label] of [['western-art-history',1,'公開中の作品'],['western-art-history',2,'未公開の名称'],['philosophy',1,'哲学の共有項目']]) {
    const snapshot=randomUUID();
    const projection={terms:[{id:'shared-node',title:label},...(project==='western-art-history'?[{id:'art-node',title:label}]:[])]};
    await client.query(`insert into private.scope_knowledge_snapshots(snapshot_id,project_id,generation,schema_version,source_read_started_at,source_read_completed_at,published_at,valid_until,scope_policy_version,knowledge_projection_version,source_evidence,scope_decisions,knowledge_projection,content_hash) values ($1,$2,$3,1,now(),now(),now(),now()+interval '1 day','fixture','fixture','{}','[]',$4,$5)`,[snapshot,project,generation,projection,hash]);
    if(generation===1) await client.query(`insert into private.project_snapshot_sync_state(project_id,current_snapshot_id,current_generation,next_generation) values ($1,$2,1,3)`,[project,snapshot]);
  }
  await client.query(`insert into public.review_attempts(id,item_id,item_kind,grade,previous_interval_days,interval_days,reviewed_at,due_at,answer_text) values (9007199254740995,'art-node','knowledge','good',0,1,'2026-10-08','2026-10-09','原文'),(9007199254740996,'shared-node','knowledge','good',0,1,'2026-10-08','2026-10-09','原文')`);
  const classificationBefore=JSON.stringify((await capture(client)).tables);
  const known=(await read({p_record_id:'legacy-9007199254740995'}))[0];assert.equal(known.project_id,'western-art-history');assert.equal(known.front,'公開中の作品');
  assert.equal((await read({p_record_id:'legacy-9007199254740996'}))[0].project_id,'unknown');
  assert.equal(JSON.stringify((await capture(client)).tables),classificationBefore);
  console.log('PASS learning history: three subjects, learner/schedule separation, Japan-day boundaries, tied-time pagination, legacy bigint/deduplication, paraphrases, receipt reason, service-only ACL/denials, read-only/no learning writes');
});
