import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import ReviewAvailability from "@/src/components/ReviewAvailability";

export const dynamic = "force-dynamic";

/** Read-only entry; ReviewSession creates exercises only after a deliberate click. */
export default function ReviewLandingPage() {
  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading"><div><p className="phase5-eyebrow">復習</p><h1 className="phase5-page-title">復習</h1><p className="phase5-context">期限の来た復習と、まだ答えていない問題を科目ごとに選べます。</p></div></section>
      <section className="phase5-section" aria-labelledby="supported-review-title">
        <div className="phase5-section-heading"><h2 id="supported-review-title">科目から選ぶ</h2><Link href="/projects" prefetch>学ぶ</Link></div>
        <ReviewAvailability />
        <p className="phase5-context">1回の出題予定です。別の端末で回答した場合や教材が更新された場合は、開始時に確認した内容を出題します。</p>
      </section>
      <section className="phase5-section" aria-labelledby="unit-practice-title">
        <div className="phase5-section-heading"><h2 id="unit-practice-title">単元練習</h2></div>
        <p className="phase5-context">3科目の最初の単元を、5〜15分で練習できます。短答と説明を振り返り、回答を保存します。</p>
        <Link className="phase5-secondary-action" href="/units">単元を選ぶ <span aria-hidden="true">→</span></Link>
      </section>
      <section className="phase5-section" aria-labelledby="offline-review-title">
        <div className="phase5-section-heading"><h2 id="offline-review-title">オフライン復習</h2></div>
        <p className="phase5-context">準備済みの問題がある端末で、通信なしで回答できます。</p>
        <Link className="phase5-secondary-action" href="/review/offline" prefetch>準備を確認する <span aria-hidden="true">→</span></Link>
      </section>
      <section className="phase5-section"><div className="phase5-section-heading"><h2>学習の振り返り</h2><Link href="/history">学習履歴を見る</Link></div><p className="phase5-context">過去の回答・自己評価を見て、もう一度確認する問題を選べます。</p></section>
      <PrimaryNav active="review" />
    </main>
  );
}
