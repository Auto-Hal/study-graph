import AppHeader from '@/src/components/AppHeader';
import PrimaryNav from '@/src/components/PrimaryNav';
export default function HistoryLoading() {
  return <main className="phase5-shell" aria-busy="true">
    <AppHeader context="学習履歴" backHref="/review" backLabel="復習" />
    <section className="phase5-page-heading"><div><p className="phase5-eyebrow">振り返り</p><h1 className="phase5-page-title">学習履歴</h1><p role="status">保存した回答を読み込んでいます…</p></div></section>
    <PrimaryNav active="review" />
  </main>;
}
