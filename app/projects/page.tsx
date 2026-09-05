import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const completedLectures = data.lectures.filter((lecture) => lecture.status === "完了").length;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>学習プロジェクト</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <section className="learn-hero">
        <p className="eyebrow">PROJECTS</p>
        <h1>学習を、プロジェクト単位で辿る。</h1>
        <p className="learn-hero-copy">
          Notionを知識の正本にしたまま、Study Graphでは講義・文字・誤読記録を学習しやすい形で横断します。
        </p>
      </section>

      <section className="project-list" aria-label="学習プロジェクト一覧">
        <Link className="project-entry" href="/projects/kuzushiji">
          <span className="project-entry-icon" aria-hidden="true">く</span>
          <div>
            <p className="eyebrow">ACTIVE PROJECT</p>
            <h2>くずし字</h2>
            <p>博物館・文書館の実物資料を、訳文なしで自力読解できる状態を目指す。</p>
          </div>
          <div className="project-entry-meta">
            <span className="mini-pill">講義 {data.lectures.length}</span>
            <span className="mini-pill">完了 {completedLectures}</span>
            <span className="mini-pill">今日 {scheduledReview.items.length}問</span>
          </div>
        </Link>
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
