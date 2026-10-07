import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppHeader from '@/src/components/AppHeader';
import PrimaryNav from '@/src/components/PrimaryNav';
import ExerciseAsset from '@/src/components/ExerciseAsset';
import ExplanationRubricPanel from '@/src/components/ExplanationRubricPanel';
import HistoryRefreshButton from '@/src/components/HistoryRefreshButton';
import { evaluationLabel, gradeLabels, historyHref, historyProjects, historyRecordIdValid, parseHistoryQuery, scheduleLabel } from '@/src/lib/history/core';
import { loadLearningHistory } from '@/src/lib/history/runtime';
import { getStudyUnit } from '@/src/lib/review/units/catalog';

export const dynamic = 'force-dynamic';
const format = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
export default async function HistoryDetailPage({ params, searchParams }: { params: Promise<{recordId:string}>; searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const { recordId } = await params;
  if (!historyRecordIdValid(recordId)) notFound();
  const query = parseHistoryQuery(await searchParams);
  const emptyQuery = {project:'',unit:'',date:'',recheck:false,beforeAt:'',beforeId:''};
  const backHref = historyHref(query ?? emptyQuery);
  const state = await loadLearningHistory(emptyQuery,recordId);
  if (state.status === 'ready' && !state.records.length) notFound();
  const record = state.status === 'ready' ? state.records[0] : null;
  if (record && !record.detail) throw new Error('History detail is missing');
  const unit = record?.unitId ? getStudyUnit(record.unitId) : null;
  return <main className="phase5-shell" data-history-state={state.status} data-history-detail={record?.id}>
    <AppHeader context="回答の振り返り" backHref={backHref} backLabel="学習履歴" />
    <section className="phase5-page-heading"><div><p className="phase5-eyebrow">{historyProjects.find(p => p.id === record?.projectId)?.title ?? '学習履歴'}</p><h1 className="phase5-page-title">回答の振り返り</h1>{record && <p className="phase5-context"><time dateTime={record.acceptedAt}>{format.format(new Date(record.acceptedAt))}</time> · {unit?.title ?? (record.evaluationKind === 'legacy' ? '以前の形式の記録' : record.unitId ? '以前の単元練習' : '日々の復習・練習')}</p>}</div></section>
    {!record ? <section className="history-empty" role="status"><h2>回答を取得できません</h2><p>保存済みの回答はそのまま残っています。通信が戻ってから、もう一度お試しください。</p><HistoryRefreshButton /></section> : <>
      <section className="history-detail-section" aria-labelledby="history-question"><h2 id="history-question">{record.evaluationKind === 'legacy' ? '学習項目' : '回答した問題'}</h2>
        <p className="history-prompt">{record.prompt}</p><strong className="history-front">{record.front}</strong>
        {record.detail?.asset && <ExerciseAsset asset={record.detail.asset} />}
        <p className="history-note">{record.evaluationKind === 'legacy' ? '以前の形式では、当時の問題本文や解説は保存されていません。学習項目名は現在の教材から確認できる名称です。' : '回答した当時の問題・解説の保存版です。現在の教材に合わせた再採点は行っていません。'}</p>
      </section>
      <section className="history-detail-section" aria-labelledby="history-answer"><h2 id="history-answer">あなたの回答</h2><p className="history-raw-answer" data-history-raw-answer>{record.detail?.rawAnswer ?? '回答原文は保存されていません。'}</p>
        <dl className="history-facts"><div><dt>{record.evaluationKind === 'legacy' ? '当時の判定' : '評価方法・結果'}</dt><dd>{evaluationLabel(record)}</dd></div><div><dt>自己評価</dt><dd>{record.selfEvaluation ? gradeLabels[record.selfEvaluation] : '記録なし'}</dd></div>{record.needsReview && <div><dt>振り返り</dt><dd>要再確認</dd></div>}</dl>
        {record.evaluationKind === 'explanation' && <p className="history-note">自分の言葉で書いた説明と自己評価を保存しています。正答・誤答の自動判定はしていません。</p>}
      </section>
      {(record.detail?.rubric || record.detail?.answer || record.detail?.explanation) && <section className="history-detail-section" aria-labelledby="history-explanation"><h2 id="history-explanation">答えと解説を振り返る</h2>
        {record.detail.rubric ? <ExplanationRubricPanel rubric={record.detail.rubric} /> : <>{record.detail.answer && <p><strong>正答：</strong>{record.detail.answer}</p>}<p className="history-copy">{record.detail.explanation}</p></>}
      </section>}
      <section className="history-detail-section" aria-labelledby="history-saving"><h2 id="history-saving">保存と復習予定</h2><dl className="history-facts"><div><dt>回答の保存</dt><dd>サーバー保存済み</dd></div><div><dt>この回答の反映</dt><dd>{scheduleLabel(record)}</dd></div>{record.srsApplied && record.dueAt && <div><dt>回答当時の次回予定</dt><dd>{format.format(new Date(record.dueAt))}</dd></div>}<div><dt>この学習項目の保存済み予定</dt><dd>{record.currentDueAt ? format.format(new Date(record.currentDueAt)) : '保存済みの予定はありません'}</dd></div></dl><p className="history-note">保存済みの予定は、ほかの回答で変わる場合があります。現在取り組める内容は「今日の復習予定」で確認できます。</p></section>
      <nav className="history-learning-links" aria-label="この回答から学び直す">
        {unit && <Link className="phase5-secondary-action" href={'/units/' + unit.id}>同じ単元を練習する</Link>}
        {record.projectId !== 'unknown' && <Link className="phase5-secondary-action" href={'/projects/' + record.projectId}>この科目の教材を見る</Link>}
        {record.sourceUrl && <a className="phase5-secondary-action" href={record.sourceUrl} target="_blank" rel="noreferrer">元教材をNotionで開く ↗</a>}
        <Link className="phase5-secondary-action" href="/review">今日の復習予定</Link><Link href={backHref}>学習履歴へ戻る</Link>
      </nav>
    </>}
    <PrimaryNav active="review" />
  </main>;
}
