import { Suspense } from "react";
import Link from "next/link";
import ReviewStartLink from "./ReviewStartLink";
import { getActiveStudyProjects, type StudyProjectDefinition } from "@/src/lib/projects/registry";
import { loadReviewAvailability } from "@/src/lib/review/availability";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

async function ProjectReviewAvailability({ project }: { project: StudyProjectDefinition }) {
  const state = await loadReviewAvailability(project);
  const count = (state.due ?? 0) + (state.new ?? 0) + state.practice;
  return (
    <article className="phase5-review-entry" data-review-project={project.id} data-review-status={state.status} aria-labelledby={`review-${project.id}`}>
      <h3 id={`review-${project.id}`}>{project.title}</h3>
      {state.status === "unavailable"
        ? <p className="phase5-context">復習予定を確認できません。時間を置いて、もう一度確認してください。</p>
        : state.status === "paused"
          ? <p className="phase5-context">新しい出題は現在準備中です。</p>
          : <p className="phase5-review-entry-counts"><span>復習 {state.due}問</span><span>未学習 {state.new}問</span></p>}
      {state.practice > 0 && <p className="phase5-context">練習 {state.practice}問 · 保存先を確認できていません</p>}
      {state.status === "ready" && count === 0 && <p className="phase5-context">今取り組める問題はありません。</p>}
      {state.nextDueAt && <p className="phase5-context">次回の復習 {dateFormat.format(new Date(state.nextDueAt))}</p>}
      {state.pausedObjectives && state.status !== "paused" && <p className="phase5-context">一部の出題は準備中です。</p>}
      <div className="phase5-review-entry-actions">
        {count > 0 || state.status === "unavailable"
          ? <ReviewStartLink href={`/review/session?project=${project.id}`} label={count > 0 ? "取り組む" : "出題を確認する"} />
          : null}
        <Link className="phase5-secondary-action" href={project.href} prefetch>教材を見る <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}

function PendingProject({ project }: { project: StudyProjectDefinition }) {
  return <article className="phase5-review-entry" aria-busy="true"><h3>{project.title}</h3><p className="phase5-context" role="status">復習予定を確認しています…</p><Link className="phase5-secondary-action" href={project.href} prefetch>教材を見る <span aria-hidden="true">→</span></Link></article>;
}

export default function ReviewAvailability() {
  return <div className="phase5-review-entry-list">{getActiveStudyProjects().map((project) => (
    <Suspense key={project.id} fallback={<PendingProject project={project} />}><ProjectReviewAvailability project={project} /></Suspense>
  ))}</div>;
}
