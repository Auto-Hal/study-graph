import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getKuzushijiReferenceData } from "@/src/lib/notion/kuzushiji-reference";
import {
  getDueReviewItems,
  getReviewHistory,
  getReviewStates,
  isReviewPersistenceConfigured,
} from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function progressSummary() {
  if (!isReviewPersistenceConfigured()) return { attempts: 0, nextDue: null as string | null };
  try {
    const [history, states] = await Promise.all([getReviewHistory(100), getReviewStates()]);
    const now = Date.now();
    const nextDue = states
      .map((state) => state.due_at)
      .filter((value) => new Date(value).getTime() > now)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
    return { attempts: history.length, nextDue };
  } catch {
    return { attempts: 0, nextDue: null as string | null };
  }
}

export default async function KuzushijiProjectPage() {
  const [data, reference] = await Promise.all([getKuzushijiDashboard(), getKuzushijiReferenceData()]);
  const [scheduledReview, progress] = await Promise.all([
    getDueReviewItems(data.reviewQueue),
    progressSummary(),
  ]);
  const completedLectures = data.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = data.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = data.mistakes.filter((mistake) => !mistake.resolved).length;
  const latestLecture = [...data.lectures].sort((a, b) => b.sequence - a.sequence)[0];

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字</small>
          </span>
        </Link>
        <div className={`sync-pill ${data.mode === "notion" && reference.mode === "notion" ? "online" : "demo"}`}>
          <span className="dot" />
          {data.mode === "notion" && reference.mode === "notion" ? "Notion 接続中" : "Demo data"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト">
        <Link href="/projects">Projects</Link>
        <span>くずし字</span>
      </nav>

      <section className="learn-hero">
        <p className="eyebrow">KUZUSHIJI</p>
        <h1>実物資料を、その場で読めるようになる。</h1>
        <p className="learn-hero-copy">
          講義で得た読み方、覚えるべき文字、実際に起こした誤読、参照資料と頻出表現を一つの学習面にまとめます。Notionは引き続き知識の正本です。
        </p>
      </section>

      <section className="entity-type-grid" aria-label="くずし字エンティティ">
        <Link className="entity-type-card" href="/projects/kuzushiji/lectures">
          <p className="eyebrow">LECTURES</p><h2>講義</h2><p>実施済み・学習中の講義と、そのテーマや成績を確認。</p>
          <span className="entity-count">{data.lectures.length}</span><span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/characters">
          <p className="eyebrow">CHARACTERS</p><h2>文字</h2><p>読み・字母・習得状態・重要度・誤読回数を確認。</p>
          <span className="entity-count">{data.characters.length}</span><span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/mistakes">
          <p className="eyebrow">MISTAKES</p><h2>誤読記録</h2><p>誤った判断、正解、原因、克服状況を振り返る。</p>
          <span className="entity-count">{data.mistakes.length}</span><span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/sources">
          <p className="eyebrow">SOURCES</p><h2>資料</h2><p>講義で使った原資料・教材、難易度や所蔵情報を確認。</p>
          <span className="entity-count">{reference.sources.length}</span><span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/expressions">
          <p className="eyebrow">EXPRESSIONS</p><h2>頻出表現</h2><p>読み・意味・用例と、候文などの重要表現を確認。</p>
          <span className="entity-count">{reference.expressions.length}</span><span className="entity-link-label">一覧を見る →</span>
        </Link>
        <Link className="entity-type-card graph-entry-card" href="/graph">
          <p className="eyebrow">KNOWLEDGE GRAPH</p><h2>関係を見る</h2><p>講義・文字・誤読・資料・表現をRelationで横断する。</p>
          <span className="entity-count">↗</span><span className="entity-link-label">Graphを開く →</span>
        </Link>
      </section>

      <section className="project-overview-grid">
        <article className="learn-panel">
          <div className="learn-panel-header"><h2>現在地</h2><span>Notion + Supabase</span></div>
          <div className="learn-stats">
            <div><strong>{completedLectures}</strong><span>完了講義</span></div>
            <div><strong>{weakCharacters}</strong><span>要定着文字</span></div>
            <div><strong>{openMistakes}</strong><span>未克服誤読</span></div>
          </div>
          {latestLecture ? (
            <div className="entity-list">
              <Link className="entity-row" href={`/projects/kuzushiji/lectures/${latestLecture.id}`}>
                <span className="entity-row-leading">{String(latestLecture.sequence).padStart(2, "0")}</span>
                <div><strong>{latestLecture.title}</strong><p>{latestLecture.theme || "学習テーマ未設定"}</p></div>
                <span className="entity-row-status">{latestLecture.status || "未設定"}</span>
              </Link>
            </div>
          ) : <p className="empty empty-panel">講義がまだ登録されていません。</p>}
        </article>

        <aside className="learn-panel">
          <div className="learn-panel-header"><h2>今日の復習</h2><span>{scheduledReview.items.length}問</span></div>
          {scheduledReview.items.length > 0
            ? <Link className="quick-action" href="/review">復習を開始する</Link>
            : <Link className="quick-action is-muted" href="/projects/kuzushiji/progress">次の復習予定を見る</Link>}
          <Link className="progress-link-card" href="/projects/kuzushiji/progress">
            <strong>学習記録を見る →</strong><span>保存済み {progress.attempts}回・次回 {formatDateTime(progress.nextDue)}</span>
          </Link>
        </aside>
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
