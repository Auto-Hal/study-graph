import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";
import { getActiveStudyProjects } from "@/src/lib/projects/registry";

export const dynamic = "force-dynamic";

/** Review landing only. The focused ReviewSession lives at /review/session. */
export default async function ReviewLandingPage() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const projects = getActiveStudyProjects();
  const dataAvailable = data.mode === "notion";
  const scheduleAvailable = dataAvailable && scheduledReview.persistence === "supabase";
  const count = scheduleAvailable ? scheduledReview.items.length : null;

  const reviewTitle = !dataAvailable
    ? "復習データを取得できません"
    : !scheduleAvailable
      ? "復習予定を確認できません"
      : count !== null && count > 0
        ? "期限の来た項目があります"
        : "今日は予定がありません";

  const reviewDescription = !dataAvailable
    ? "通信が戻ったら、もう一度確認してください。"
    : !scheduleAvailable
      ? "学習候補はありますが、期限はサーバーで確認できていません。"
      : count !== null && count > 0
        ? "短いセッションで、ひとつずつ思い出します。"
        : "学習を続けるか、別のプロジェクトを選べます。";

  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading">
        <div><p className="phase5-eyebrow">復習</p><h1 className="phase5-page-title">復習</h1><p className="phase5-context">思い出す時間を、ここから始めます</p></div>
      </section>

      <section className="phase5-review-options" aria-label="復習を選ぶ">
        <div>
          <article className="phase5-review-focus">
            <p className="phase5-eyebrow">今日の復習</p>
            <h2>{reviewTitle}</h2>
            <span className="phase5-review-count">{count ?? "—"}</span>
            <span className="phase5-review-label">{count === null ? "予定" : "問題"}</span>
            <p>{reviewDescription}</p>
            {count !== null && count > 0
              ? <Link className="phase5-action" href="/review/session?project=kuzushiji">今日の復習を始める <span aria-hidden="true">→</span></Link>
              : <Link className="phase5-secondary-action" href="/projects">学ぶプロジェクトを見る <span aria-hidden="true">→</span></Link>}
          </article>
          <div className="phase5-project-switcher" aria-label="プロジェクト別復習">
            {projects.map((project) => <Link href={`/review/session?project=${encodeURIComponent(project.id)}`} key={project.id}>{project.shortLabel}</Link>)}
          </div>
        </div>
        <aside className="phase5-review-side">
          <p className="phase5-eyebrow">オフライン</p>
          <h2>オフライン復習</h2>
          <p>準備済みの問題がある端末で、通信なしで回答できます。</p>
          <Link className="phase5-secondary-action" href="/review/offline">準備を確認する <span aria-hidden="true">→</span></Link>
        </aside>
      </section>

      <section className="phase5-section" aria-labelledby="supported-review-title">
        <div className="phase5-section-heading"><h2 id="supported-review-title">プロジェクトから選ぶ</h2><Link href="/projects">学ぶ</Link></div>
        <div className="phase5-row-list">
          {projects.map((project) => {
            const meta = project.review.strategy === "notion-queue"
              ? (scheduleAvailable ? "今日の復習" : "復習を確認")
              : "Practice";
            return <Link className="phase5-row" href={`/review/session?project=${encodeURIComponent(project.id)}`} key={project.id}><span className="phase5-row-main"><span className="phase5-row-title">{project.title}</span><span className="phase5-row-meta">{meta}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link>;
          })}
        </div>
      </section>
      <PrimaryNav active="review" />
    </main>
  );
}
