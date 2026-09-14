import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import ProjectSnapshotRefreshCoordinator from "@/src/components/ProjectSnapshotRefresh";
import {
  isKuzushijiV2ProjectReadState,
  loadProjectReadState,
} from "@/src/lib/projects/read-runtime";
import {
  filterDueReviewItems,
  loadReviewScheduleState,
} from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function Home() {
  // These are independent display observations. Starting them together keeps
  // the main tab from serializing snapshot rendering behind the schedule RPC.
  const [snapshotState, scheduleState] = await Promise.all([
    loadProjectReadState("kuzushiji"),
    loadReviewScheduleState(),
  ]);
  const displayState = isKuzushijiV2ProjectReadState(snapshotState) ? snapshotState : null;
  const projection = displayState?.data.projection;
  const scheduleAvailable = displayState !== null && scheduleState.persistence === "supabase";
  const reviewQueue = scheduleAvailable && projection
    ? filterDueReviewItems(projection.reviewQueue, scheduleState)
    : [];
  const completedLectures = projection?.lectures.filter((lecture) => lecture.status === "完了").length ?? 0;
  const weakCharacters = projection?.characters.filter((character) => character.mastery !== "即読").length ?? 0;
  const openMistakes = projection?.mistakes.filter((mistake) => !mistake.resolved).length ?? 0;
  const recentLectures = projection
    ? [...projection.lectures].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0)).slice(0, 3)
    : [];

  const focus = reviewQueue.length > 0
    ? {
        title: "今日の復習",
        detail: `${reviewQueue.length}問 · 約${Math.max(2, Math.ceil(reviewQueue.length * 0.7))}分`,
        description: "期限が来た項目を、思い出せるところから始めます。",
        href: "/review/session?project=kuzushiji",
        label: "始める",
      }
    : displayState && scheduleAvailable
      ? {
          title: "くずし字",
          detail: completedLectures > 0 ? `完了講義 ${completedLectures}件` : "学習を始める",
          description: "現在位置を確認して、次に取り組む講義を選びます。",
          href: "/projects/kuzushiji",
          label: "現在位置を見る",
        }
      : displayState
        ? {
            title: "くずし字",
            detail: "復習予定を確認できません",
            description: "学習内容は表示できます。復習予定はサーバーで確認でき次第表示します。",
            href: "/projects/kuzushiji",
            label: "学習を続ける",
          }
        : {
            title: "学習を選ぶ",
            detail: "学習データを確認できません",
            description: "学習プロジェクトを選び、利用できる内容から始めます。",
            href: "/projects",
            label: "学ぶ",
          };

  return (
    <main className="phase5-shell">
      <AppHeader />
      <section className="phase5-page-heading">
        <div><p className="phase5-eyebrow">今日のフォーカス</p><h1 className="phase5-page-title">今日</h1></div>
      </section>

      <section className="phase5-focus" aria-labelledby="today-focus-title">
        <p className="phase5-eyebrow">次の一歩</p>
        <h2 id="today-focus-title">{focus.title}</h2>
        <p>{focus.description}</p>
        <div className="phase5-focus-meta">
          <span>{focus.detail}</span>
          {displayState?.kind === "stale" && <span>内容を更新しています</span>}
          {displayState && !scheduleAvailable && <span>復習予定を確認できません</span>}
          {!displayState && <span>学習データを確認できません</span>}
        </div>
        <Link className="phase5-action" href={focus.href} prefetch={!focus.href.startsWith("/review/session")}>{focus.label} <span aria-hidden="true">→</span></Link>
      </section>

      {reviewQueue.length > 0 && (
        <section className="phase5-section" aria-labelledby="today-review-title">
          <div className="phase5-section-heading"><h2 id="today-review-title">今日の復習</h2><Link href="/review" prefetch>すべて見る</Link></div>
          <div className="phase5-row-list">
            {reviewQueue.slice(0, 4).map((item) => (
              <Link className="phase5-row" href="/review" prefetch key={`${item.kind}-${item.id}`}>
                <span className="phase5-row-main"><span className="phase5-row-title">{item.label}</span><span className="phase5-row-meta">{item.reason}</span></span>
                <span className="phase5-row-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="phase5-section" aria-labelledby="continue-learning-title">
        <div className="phase5-section-heading"><h2 id="continue-learning-title">学習を続ける</h2><Link href="/projects" prefetch>すべての学び</Link></div>
        <div className="phase5-row-list">
          <Link className="phase5-row" href="/projects/kuzushiji" prefetch>
            <span className="phase5-row-main"><span className="phase5-row-title">くずし字</span><span className="phase5-row-meta">{displayState ? (completedLectures > 0 ? `完了講義 ${completedLectures}件` : "講義を確認する") : "学習内容を確認する"}</span></span>
            <span className="phase5-row-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="phase5-section" aria-labelledby="recent-title">
        <div className="phase5-section-heading"><h2 id="recent-title">最近</h2><Link href="/projects/kuzushiji/progress" prefetch>学習記録</Link></div>
        <div className="phase5-row-list">
          {displayState
            ? (recentLectures.length > 0 ? recentLectures.map((lecture) => (
                <Link className="phase5-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} prefetch key={lecture.id}>
                  <span className="phase5-row-main"><span className="phase5-row-title">{lecture.title || "講義"}</span><span className="phase5-row-meta">{lecture.status || "学習項目"}</span></span>
                  <span className="phase5-row-status">{lecture.sequence ?? ""}</span>
                </Link>
              )) : <p className="phase5-empty">まだ学習履歴がありません。</p>)
            : <p className="phase5-empty">学習データは現在表示できません。</p>}
        </div>
      </section>

      {displayState && <p className="phase5-context phase5-summary-line">完了講義 {completedLectures} · 要定着文字 {weakCharacters} · 未克服の誤読 {openMistakes}</p>}
      <ProjectSnapshotRefreshCoordinator projectId="kuzushiji" />
      <PrimaryNav active="today" />
    </main>
  );
}
