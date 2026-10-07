import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import ReviewAvailability from "@/src/components/ReviewAvailability";
import { getActiveStudyProjects } from "@/src/lib/projects/registry";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading"><div><p className="phase5-eyebrow">今日の学習</p><h1 className="phase5-page-title">今日</h1><p className="phase5-context">科目を選んで、ひと区切り。復習と新しい問題をここから始めます。</p></div></section>
      <section className="phase5-section" aria-labelledby="today-review-title">
        <div className="phase5-section-heading"><h2 id="today-review-title">今日取り組む</h2><Link href="/review" prefetch>復習を見る</Link></div>
        <ReviewAvailability />
        <p className="phase5-context">1回の出題予定です。始めるときに、学習範囲と最新の保存結果をもう一度確認します。</p>
      </section>
      <section className="phase5-section" aria-labelledby="continue-learning-title">
        <div className="phase5-section-heading"><h2 id="continue-learning-title">学習を続ける</h2><Link href="/projects" prefetch>すべての学び</Link></div>
        <div className="phase5-row-list">{getActiveStudyProjects().map((project) => (
          <Link className="phase5-row" href={project.href} prefetch key={project.id}><span className="phase5-row-main"><span className="phase5-row-title">{project.title}</span><span className="phase5-row-meta">{project.context}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link>
        ))}</div>
      </section>
      <section className="phase5-section"><div className="phase5-section-heading"><h2>学習の振り返り</h2><Link href="/history">学習履歴を見る</Link></div><p className="phase5-context">保存した回答と自己評価を、科目や単元ごとに見返せます。</p></section>
      <PrimaryNav active="today" />
    </main>
  );
}
