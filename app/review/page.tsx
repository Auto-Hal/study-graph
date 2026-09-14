import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import ProjectSnapshotRefreshCoordinator from "@/src/components/ProjectSnapshotRefresh";
import { isKuzushijiV2ProjectReadState, loadProjectReadState } from "@/src/lib/projects/read-runtime";
import { filterDueReviewItems, loadReviewScheduleState } from "@/src/lib/supabase/review";
import { getActiveStudyProjects } from "@/src/lib/projects/registry";

export const dynamic = "force-dynamic";

/** Review landing only. The focused ReviewSession lives at /review/session. */
export default async function ReviewLandingPage() {
  // Candidate knowledge and authoritative schedule are independent reads.
  const [snapshotState, scheduleState] = await Promise.all([
    loadProjectReadState("kuzushiji"),
    loadReviewScheduleState(),
  ]);
  const displayState = isKuzushijiV2ProjectReadState(snapshotState) ? snapshotState : null;
  const candidates = displayState?.data.projection.reviewQueue ?? [];
  const scheduleAvailable = displayState !== null && scheduleState.persistence === "supabase";
  const dueItems = scheduleAvailable ? filterDueReviewItems(candidates, scheduleState) : [];
  const projects = getActiveStudyProjects();
  const count = scheduleAvailable ? dueItems.length : null;

  const reviewTitle = !displayState
    ? "復習候補を取得できません"
    : !scheduleAvailable
      ? "復習予定を確認できません"
      : count !== null && count > 0
        ? "期限の来た項目があります"
        : "今日は予定がありません";

  const reviewDescription = !displayState
    ? "学習プロジェクトから、利用できる内容を選べます。"
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
            {displayState?.kind === "stale" && <p className="phase5-freshness">現在の内容を表示しています。更新後に新しい内容を確認できます。</p>}
            {count !== null && count > 0
              ? <Link className="phase5-action" href="/review/session?project=kuzushiji" prefetch={false}>今日の復習を始める <span aria-hidden="true">→</span></Link>
              : <Link className="phase5-secondary-action" href="/projects" prefetch>学ぶプロジェクトを見る <span aria-hidden="true">→</span></Link>}
          </article>
          <div className="phase5-project-switcher" aria-label="プロジェクト別復習">
            {projects.map((project) => <Link href={`/review/session?project=${encodeURIComponent(project.id)}`} prefetch={false} key={project.id}>{project.shortLabel}</Link>)}
          </div>
        </div>
        <aside className="phase5-review-side">
          <p className="phase5-eyebrow">オフライン</p>
          <h2>オフライン復習</h2>
          <p>準備済みの問題がある端末で、通信なしで回答できます。</p>
          <Link className="phase5-secondary-action" href="/review/offline" prefetch>準備を確認する <span aria-hidden="true">→</span></Link>
        </aside>
      </section>

      <section className="phase5-section" aria-labelledby="supported-review-title">
        <div className="phase5-section-heading"><h2 id="supported-review-title">プロジェクトから選ぶ</h2><Link href="/projects" prefetch>学ぶ</Link></div>
        <div className="phase5-row-list">
          {projects.map((project) => {
            const meta = project.review.strategy === "notion-queue"
              ? (scheduleAvailable ? "今日の復習" : "復習を確認")
              : "Practice";
            return <Link className="phase5-row" href={`/review/session?project=${encodeURIComponent(project.id)}`} prefetch={false} key={project.id}><span className="phase5-row-main"><span className="phase5-row-title">{project.title}</span><span className="phase5-row-meta">{meta}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link>;
          })}
        </div>
      </section>
      <ProjectSnapshotRefreshCoordinator projectId="kuzushiji" />
      <PrimaryNav active="review" />
    </main>
  );
}
