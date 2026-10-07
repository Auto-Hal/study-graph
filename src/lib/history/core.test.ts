import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeHistoryRecord, evaluationLabel, historyDateRange, historyHref, parseHistoryQuery, scheduleLabel } from './core.ts';

const id = '12345678-1234-4234-8234-123456789abc';
const row = () => ({ record_id:id, project_id:'philosophy', unit_id:'philosophy-arche-1', submitted_at:'2026-10-07T15:00:00.123456+00:00', front:'根源とは何か', prompt:'自分の言葉で説明してください', evaluation_kind:'explanation', grading_status:'ungraded', is_correct:null, self_evaluation:'hard', srs_applied:false, srs_reason:'practice-only', due_at:null, current_due_at:'2026-10-10T01:00:00+00:00', source_url:'https://www.notion.so/example', detail:null });
test('history filters reject impossible days, mismatched units, repeated values, and incomplete cursor pairs', () => {
  for (const input of [{date:'2026-02-30'}, {project:'philosophy',unit:'art-prehistory-1'}, {project:['philosophy','kuzushiji']}, {before:'2026-10-08T01:00:00Z'}, {before:'wrong',beforeId:id}, {recheck:'yes'}]) assert.equal(parseHistoryQuery(input),null);
  assert.ok(parseHistoryQuery({date:'2024-02-29',project:'philosophy',unit:'philosophy-arche-1'}));
});
test('history day uses Japan time and pagination preserves exact microseconds and filters', () => {
  assert.deepEqual(historyDateRange('2026-10-08'),{start:'2026-10-08T00:00:00+09:00',end:'2026-10-08T15:00:00.000Z'});
  const query = parseHistoryQuery({project:'philosophy',recheck:'1',date:'2026-10-08',before:'2026-10-07T15:00:00.123456+00:00',beforeId:id})!;
  assert.deepEqual(parseHistoryQuery(Object.fromEntries(new URL(historyHref(query),'https://example.test').searchParams)),query);
});
test('explanations preserve paraphrase bytes and remain self-evaluation without automatic correctness', () => {
  const raw = '  万物に通じる出発点。\n水だけとは限らない。  ';
  const r = row();
  const record = decodeHistoryRecord({...r,detail:{rawAnswer:{type:'text',value:raw},revision:{projectId:r.project_id,front:r.front,prompt:r.prompt,answerSpec:{acceptedAnswers:['example']},explanation:{summary:'問いの意味',rubric:{modelAnswer:'ひとつの例',requiredPoints:['共通の原理'],allowedParaphrases:['出発点'],majorMisconceptions:['単なる物質の名前']}}}}});
  assert.equal(record.detail?.rawAnswer,raw); assert.equal(record.correct,null); assert.equal(record.detail?.answer,null);
  assert.equal(record.needsReview,true); assert.equal(evaluationLabel(record),'説明・自己評価');
  assert.match(scheduleLabel(record),/追加練習/);
  assert.throws(() => decodeHistoryRecord({...r,grading_status:'graded',is_correct:true}));
});
test('incorrect short answer is recheck even when self-rating is good; ungraded is not an incorrect answer', () => {
  const r = row();
  assert.equal(decodeHistoryRecord({...r,evaluation_kind:'short-answer',grading_status:'graded',is_correct:false,self_evaluation:'good'}).needsReview,true);
  const explanation = decodeHistoryRecord({...r,self_evaluation:'good'}); assert.equal(explanation.needsReview,false); assert.equal(explanation.correct,null);
});
test('legacy IDs retain bigint precision; absent originals and unsafe reference URLs remain absent', () => {
  const r = row(); const record = decodeHistoryRecord({...r,record_id:'legacy-9007199254740993',project_id:'unknown',unit_id:null,prompt:null,evaluation_kind:'legacy',source_url:'javascript:alert(1)',detail:{rawAnswer:null,revision:null}});
  assert.equal(record.id,'legacy-9007199254740993'); assert.equal(record.detail?.rawAnswer,null); assert.equal(record.sourceUrl,null);
});
test('archived detail identity mismatch fails closed instead of showing another question', () => {
  const r = row(); assert.throws(() => decodeHistoryRecord({...r,detail:{rawAnswer:'自分の回答',revision:{projectId:'kuzushiji',front:r.front,prompt:r.prompt}}}));
});
