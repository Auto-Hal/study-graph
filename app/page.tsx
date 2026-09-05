import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const reviewQueue = scheduledReview.items;
  const completedLectures = data.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = data.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = data.mistakes.filter((mistake) => !mistake.resolved).length;
  const recentLectures = [...data.lectures].sort((a, b) => b.sequence - a.sequence).slice(0, 3);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">STUDY GRAPH</p>
          <h1>今日の学習を、迷わず始める。</h1>
          <p className="lead">Notionに蓄積した知識を、復習できる形に変える学習フロントエンド。</p>
        </div>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      {data.mode === "demo" && (
        <section className="notice" role="status">
          <strong>Notion接続を確認できません。</strong>
          <span> Demo dataで表示しています。Settingsから接続状態を確認できます。</span>
        </section>
      )}

      {scheduledReview.persistence === "fallback" && (
        <section className="notice" role="status">
          <strong>復習スケジュールを取得できません。</strong>
          <span> Notion由来の候補を表示しています。Settingsから接続状態を確認できます。</span>
        </section>
      )}

      <section className="hero-grid">
        <article className="review-card primary-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2>今日の復習</h2>
            </div>
            <span className="count-badge" aria-label={`${reviewQueue.length}問`}>{reviewQueue.length}</span>
          </div>

          <div className="review-list">
            {reviewQueue.length === 0 ? (
              <p className="empty">現在、期限が来ている復習項目はありません。</p>
            ) : (
              reviewQueue.slice(0, 5).map((item) => (
                <div className="review-row" key={`${item.kind}-${item.id}`}>
                  <span className="kind">{item.kind === "mistake" ? "誤読" : "文字"}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.reason}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {reviewQueue.length > 0 ? (
            <Link className="start-button" href="/review">
              復習を開始 <span>{reviewQueue.length}問</span>
            </Link>
          ) : (
            <Link className="start-button is-disabled" href="/projects/kuzushiji/progress">
              次回予定を見る <span>0問</span>
            </Link>
          )}
        </article>

        <Link className="project-card" href="/projects/kuzushiji">
          <p className="eyebrow">PROJECT</p>
          <div className="project-title">
            <span className="project-icon" aria-hidden="true">く</span>
            <div>
              <h2>くずし字</h2>
              <p>博物館・文書館の実物資料を自力で読む</p>
            </div>
          </div>

          <div className="stats-grid">
            <div><strong>{completedLectures}</strong><span>完了講義</span></div>
            <div><strong>{weakCharacters}</strong><span>要定着文字</span></div>
            <div><strong>{openMistakes}</strong><span>未克服誤読</span></div>
          </div>
        </Link>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">LECTURES</p>
              <h2>最近の講義</h2>
            </div>
            <Link href="/projects/kuzushiji/lectures">{data.lectures.length} lessons</Link>
          </div>

          <div className="lecture-list">
            {recentLectures.length === 0 ? (
              <p className="empty empty-panel">講義がまだ登録されていません。</p>
            ) : recentLectures.map((lecture) => (
              <Link className="lecture-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}>
                <span className="lecture-number">{String(lecture.sequence).padStart(2, "0")}</span>
                <div className="lecture-copy">
                  <strong>{lecture.title}</strong>
                  <p>{lecture.theme || "学習テーマ未設定"}</p>
                </div>
                <span className="status">{lecture.status || "未設定"}</span>
              </Link>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">FOCUS</p>
              <h2>定着状況</h2>
            </div>
            <Link href="/projects/kuzushiji/characters">すべて見る</Link>
          </div>

          <div className="character-grid">
            {data.characters.length === 0 ? (
              <p className="empty empty-panel">文字がまだ登録されていません。</p>
            ) : data.characters.slice(0, 8).map((character) => (
              <Link className="character-card" href={`/projects/kuzushiji/characters/${character.id}`} key={character.id}>
                <strong>{character.glyph || "?"}</strong>
                <span>{character.mastery || "未設定"}</span>
                <small>誤読 {character.errorCount}回</small>
              </Link>
            ))}
          </div>
        </article>
      </section>

      <PrimaryNav active="home" variant="home" />
    </main>
  );
}
