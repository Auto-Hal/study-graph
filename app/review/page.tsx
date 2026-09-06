import Link from "next/link";
import ReviewSession from "@/src/components/ReviewSession";
import { loadReviewProject } from "@/src/lib/review/registry";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const query = await searchParams;
  const data = await loadReviewProject(query.project);
  const practice = data.session.mode === "practice";

  return (
    <main className="review-page-shell review-project-shell">
      <header className="review-page-header">
        <Link className="brand-link" href="/">
          <span className="brand-mark">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>{data.project.shortLabel}・{practice ? "Practice" : "今日の復習"}</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.sourceMode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.sourceMode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <section className="review-project-intro">
        <div>
          <p className="eyebrow">CROSS-PROJECT REVIEW · PHASE 3.0</p>
          <h1>{practice ? "知識を思い出し、復習対象へ育てる。" : "今日の復習を、期限順に進める。"}</h1>
          <p>
            {practice
              ? "Knowledge GraphのNotionノードから問題を作ります。初回Practiceで評価した知識だけがSupabaseの間隔反復へ参加します。"
              : "Notionで管理している弱点候補とSupabaseの次回復習日を照合し、期限が来た項目だけを出題します。"}
          </p>
        </div>
        <div className="review-session-badge">
          <strong>{data.cards.length}</strong>
          <span>{practice ? "今回のPractice" : "期限到来"}</span>
        </div>
      </section>

      <nav className="review-project-selector" aria-label="Reviewプロジェクト選択">
        {data.projects.map((project) => {
          const active = project.id === data.project.id;
          const strategyLabel = project.review.strategy === "graph-practice" ? "Practice" : "Scheduled";
          return (
            <Link
              className={active ? "active" : undefined}
              href={`/review?project=${encodeURIComponent(project.id)}`}
              key={project.id}
              aria-current={active ? "page" : undefined}
            >
              <span>{project.shortLabel}</span>
              <small>{strategyLabel}</small>
            </Link>
          );
        })}
      </nav>

      {data.sourceMode === "demo" && (
        <section className="notice" role="status">
          <strong>Notionを取得できていません。</strong>
          <span> 現在はDemo dataのため、評価は保存しません。</span>
        </section>
      )}

      {data.sourceMode === "notion" && data.persistence === "fallback" && (
        <section className="notice" role="status">
          <strong>復習履歴を取得できていません。</strong>
          <span> 問題には取り組めますが、このセッションの評価は保存しません。</span>
        </section>
      )}

      <ReviewSession cards={data.cards} persistence={data.persistence} session={data.session} />
    </main>
  );
}
