import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";

export default async function Home() {
  const data = await getKuzushijiDashboard();
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
        <section className="notice">
          <strong>まずは画面を確認できます。</strong>
          <span> `.env.local` に Notion integration token を設定すると、実データへ切り替わります。</span>
        </section>
      )}

      <section className="hero-grid">
        <article className="review-card primary-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2>今日の復習</h2>
            </div>
            <span className="count-badge">{data.reviewQueue.length}</span>
          </div>

          <div className="review-list">
            {data.reviewQueue.length === 0 ? (
              <p className="empty">現在、優先して復習する項目はありません。</p>
            ) : (
              data.reviewQueue.slice(0, 5).map((item) => (
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

          <button className="start-button" type="button" disabled>
            復習を開始 <span>Phase 1.1</span>
          </button>
        </article>

        <aside className="project-card">
          <p className="eyebrow">PROJECT</p>
          <div className="project-title">
            <span className="project-icon">く</span>
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
        </aside>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">LECTURES</p>
              <h2>最近の講義</h2>
            </div>
            <span>{data.lectures.length} lessons</span>
          </div>

          <div className="lecture-list">
            {recentLectures.map((lecture) => (
              <a className="lecture-row" href={lecture.url} target="_blank" rel="noreferrer" key={lecture.id}>
                <span className="lecture-number">{String(lecture.sequence).padStart(2, "0")}</span>
                <div className="lecture-copy">
                  <strong>{lecture.title}</strong>
                  <p>{lecture.theme || "学習テーマ未設定"}</p>
                </div>
                <span className="status">{lecture.status || "未設定"}</span>
              </a>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">FOCUS</p>
              <h2>定着状況</h2>
            </div>
          </div>

          <div className="character-grid">
            {data.characters.slice(0, 8).map((character) => (
              <a className="character-card" href={character.url} target="_blank" rel="noreferrer" key={character.id}>
                <strong>{character.glyph || "?"}</strong>
                <span>{character.mastery || "未設定"}</span>
                <small>誤読 {character.errorCount}回</small>
              </a>
            ))}
          </div>
        </article>
      </section>

      <footer className="bottom-nav" aria-label="Primary navigation">
        <span className="active">Home</span>
        <span>Learn</span>
        <span>Review</span>
        <span>Graph</span>
        <span>Settings</span>
      </footer>
    </main>
  );
}
