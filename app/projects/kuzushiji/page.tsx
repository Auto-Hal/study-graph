import Link from "next/link";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function KuzushijiProjectPage() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const completedLectures = data.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = data.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = data.mistakes.filter((mistake) => !mistake.resolved).length;
  const latestLecture = [...data.lectures].sort((a, b) => b.sequence - a.sequence)[0];

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/projects">Projects</Link>
        <span>くずし字</span>
      </nav>

      <section className="learn-hero">
        <p className="eyebrow">KUZUSHIJI</p>
        <h1>実物資料を、その場で読めるようになる。</h1>
        <p className="learn-hero-copy">
          講義で得た読み方、覚えるべき文字、実際に起こした誤読を一つの学習面にまとめます。Notionは引き続き知識の正本です。
        </p>
      </section>

      <section className="entity-type-grid" aria-label="くずし字エンティティ">
        <Link className="entity-type-card" href="/projects/kuzushiji/lectures">
          <p className="eyebrow">LECTURES</p>
          <h2>講義</h2>
          <p>実施済み・学習中の講義と、そのテーマや成績を確認。</p>
          <span className="entity-count">{data.lectures.length}</span>
          <span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/characters">
          <p className="eyebrow">CHARACTERS</p>
          <h2>文字</h2>
          <p>読み・字母・習得状態・重要度・誤読回数を確認。</p>
          <span className="entity-count">{data.characters.length}</span>
          <span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/mistakes">
          <p className="eyebrow">MISTAKES</p>
          <h2>誤読記録</h2>
          <p>誤った判断、正解、原因、克服状況を振り返る。</p>
          <span className="entity-count">{data.mistakes.length}</span>
          <span className="entity-link-label">一覧を見る →</span>
        </Link>
      </section>

      <section className="project-overview-grid">
        <article className="learn-panel">
          <div className="learn-panel-header">
            <h2>現在地</h2>
            <span>Notion + Supabase</span>
          </div>
          <div className="learn-stats">
            <div><strong>{completedLectures}</strong><span>完了講義</span></div>
            <div><strong>{weakCharacters}</strong><span>要定着文字</span></div>
            <div><strong>{openMistakes}</strong><span>未克服誤読</span></div>
          </div>
          {latestLecture && (
            <div className="entity-list">
              <Link className="entity-row" href={`/projects/kuzushiji/lectures/${latestLecture.id}`}>
                <span className="entity-row-leading">{String(latestLecture.sequence).padStart(2, "0")}</span>
                <div>
                  <strong>{latestLecture.title}</strong>
                  <p>{latestLecture.theme || "学習テーマ未設定"}</p>
                </div>
                <span className="entity-row-status">{latestLecture.status || "未設定"}</span>
              </Link>
            </div>
          )}
        </article>

        <aside className="learn-panel">
          <div className="learn-panel-header">
            <h2>今日の復習</h2>
            <span>{scheduledReview.items.length}問</span>
          </div>
          {scheduledReview.items.length > 0 ? (
            <Link className="quick-action" href="/review">復習を開始する</Link>
          ) : (
            <span className="quick-action is-muted">次の復習まで待機</span>
          )}
        </aside>
      </section>

      <footer className="learn-bottom-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link className="active" href="/projects">Learn</Link>
        <Link href="/review">Review</Link>
        <span>Graph</span>
        <span>Settings</span>
      </footer>
    </main>
  );
}
