import Link from 'next/link';
import AppHeader from '@/src/components/AppHeader';
import PrimaryNav from '@/src/components/PrimaryNav';
import HistoryFilters from '@/src/components/HistoryFilters';
import HistoryRefreshButton from '@/src/components/HistoryRefreshButton';
import { evaluationLabel, gradeLabels, historyHref, historyProjects, parseHistoryQuery, type HistoryQuery } from '@/src/lib/history/core';
import { loadLearningHistory } from '@/src/lib/history/runtime';
import { getStudyUnit } from '@/src/lib/review/units/catalog';

export const dynamic = 'force-dynamic';
const format = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string,string | string[] | undefined>> }) {
  const query = parseHistoryQuery(await searchParams);
  const emptyQuery: HistoryQuery = { project:'', unit:'', date:'', recheck:false, beforeAt:'', beforeId:'' };
  const state = query ? await loadLearningHistory(query) : null;
  const back = query ? historyHref(query).slice('/history'.length) : '';
  return <main className="phase5-shell" data-history-state={state?.status ?? 'invalid-query'}>
    <AppHeader context="学習履歴" backHref="/review" backLabel="復習" />
    <section className="phase5-page-heading"><div><p className="phase5-eyebrow">振り返り</p><h1 className="phase5-page-title">学習履歴</h1><p className="phase5-context">答えた内容と自己評価を見返し、もう一度学ぶところを選びます。</p></div></section>
    <HistoryFilters key={historyHref(query ?? emptyQuery)} query={query ?? emptyQuery} />
    <p className="history-note">サーバーへの保存が完了した回答です。要再確認は、不正解または自己評価が「もう一度・難しい」の回答です。説明問題の正誤は自動判定していません。</p>
    {!query ? <section role="alert" className="history-empty"><h2>絞り込み条件を確認してください</h2><p>科目・単元・日付の組み合わせを選び直してください。</p><Link href="/history">条件を解除する</Link></section>
      : state?.status === 'unavailable' ? <section className="history-empty" role="status"><h2>学習履歴を取得できません</h2><p>保存済みの回答がなくなったという意味ではありません。通信が戻ってから、もう一度お試しください。</p><HistoryRefreshButton /></section>
      : state?.status === 'ready' ? <>
        {!state.legacyIncluded && <p className="history-note" role="status">以前の形式の記録は現在取得できません。保存版のある回答を表示しています。</p>}
        <div className="history-list" aria-label="保存済みの回答">
          {state.records.length ? state.records.map(record => <Link className="history-row" key={record.id} href={'/history/' + record.id + back} data-history-record={record.id} data-evaluation-kind={record.evaluationKind}>
            <span className="history-row-meta"><time dateTime={record.acceptedAt}>{format.format(new Date(record.acceptedAt))}</time><span>{historyProjects.find(p => p.id === record.projectId)?.title}</span></span>
            <strong>{record.front}</strong>
            {record.prompt && <span className="history-row-question">{record.prompt}</span>}
            <span className="history-row-unit">{record.unitId ? getStudyUnit(record.unitId)?.title ?? '以前の単元練習' : record.evaluationKind === 'legacy' ? '以前の形式の記録' : '日々の復習・練習'}</span>
            <span className="history-row-badges"><span>{evaluationLabel(record)}</span>{record.selfEvaluation && <span>自己評価：{gradeLabels[record.selfEvaluation]}</span>}{record.needsReview && <span className="history-needs-review">要再確認</span>}<span>保存済み</span></span>
            <span className="history-row-arrow" aria-hidden="true">→</span>
          </Link>) : <section className="history-empty" role="status"><h2>{query.project || query.unit || query.date || query.recheck || query.beforeAt ? 'この条件の履歴はありません' : '保存済みの回答はまだありません'}</h2><p>単元練習や日々の復習で、回答と自己評価の保存が完了するとここに表示されます。</p><Link href="/units">単元を選ぶ</Link></section>}
        </div>
        <nav className="history-pagination" aria-label="履歴のページ"><HistoryRefreshButton />{query.beforeAt && <Link href={historyHref({...query,beforeAt:'',beforeId:''})}>新しい履歴へ</Link>}{state.hasMore && <Link className="phase5-secondary-action" href={historyHref({...query,beforeAt:state.records.at(-1)!.acceptedAt,beforeId:state.records.at(-1)!.id})}>以前の履歴を見る</Link>}</nav>
      </> : null}
    <PrimaryNav active="review" />
  </main>;
}
