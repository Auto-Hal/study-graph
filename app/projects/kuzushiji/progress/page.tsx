import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import {
  getReviewHistory,
  getReviewStates,
  isReviewPersistenceConfigured,
  type ReviewAttempt,
  type ReviewGrade,
  type ReviewState,
} from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

type KuzushijiReviewKind = "character" | "mistake";
type KuzushijiReviewAttempt = ReviewAttempt & { item_kind: KuzushijiReviewKind };
type KuzushijiReviewState = ReviewState & { item_kind: KuzushijiReviewKind };

const gradeLabels: Record<ReviewGrade, string> = {
  again: "もう一度",
  hard: "難しい",
  good: "できた",
  easy: "即答",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isKuzushijiAttempt(attempt: ReviewAttempt): attempt is KuzushijiReviewAttempt {
  return attempt.item_kind === "character" || attempt.item_kind === "mistake";
}

function isKuzushijiState(state: ReviewState): state is KuzushijiReviewState {
  return state.item_kind === "character" || state.item_kind === "mistake";
}

function itemMeta(
  id: string,
  kind: KuzushijiReviewKind,
  data: Awaited<ReturnType<typeof getKuzushijiDashboard>>,
) {
  if (kind === "character") {
    const character = data.characters.find((item) => item.id === id);
    return {
      label: character?.glyph || "未登録の文字",
      detail: character ? [character.reading, character.mother ? `字母 ${character.mother}` : ""].filter(Boolean).join("・") : "Notion項目",
      href: `/projects/kuzushiji/characters/${id}`,
    };
  }

  const mistake = data.mistakes.find((item) => item.id === id);
  return {
    label: mistake?.title || "誤読記録",
    detail: mistake?.cause || "原因未設定",
    href: `/projects/kuzushiji/mistakes/${id}`,
  };
}

async function reviewData() {
  if (!isReviewPersistenceConfigured()) {
    return {
      history: [] as KuzushijiReviewAttempt[],
      states: [] as KuzushijiReviewState[],
      connected: false,
    };
  }

  try {
    const [history, states] = await Promise.all([getReviewHistory(100), getReviewStates()]);
    return {
      history: history.filter(isKuzushijiAttempt),
      states: states.filter(isKuzushijiState),
      connected: true,
    };
  } catch (error) {
    console.error("Study Graph: progress data fetch failed", error);
    return {
      history: [] as KuzushijiReviewAttempt[],
      states: [] as KuzushijiReviewState[],
      connected: false,
    };
  }
}

export default async function KuzushijiProgressPage() {
  const [data, review] = await Promise.all([getKuzushijiDashboard(), reviewData()]);
  const counts: Record<ReviewGrade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const attempt of review.history) counts[attempt.grade] += 1;

  const confident = counts.good + counts.easy;
  const confidentRate = review.history.length > 0 ? Math.round((confident / review.history.length) * 100) : 0;
  const now = Date.now();
  const upcoming = [...review.states]
    .filter((state) => new Date(state.due_at).getTime() > now)
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const dueNow = review.states.filter((state) => new Date(state.due_at).getTime() <= now).length;
  const nextDue = upcoming[0]?.due_at ?? null;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/">
          <span className="learn-brand-mark" aria-hidden="true">SG</span>
          <span>
            <strong>Study Graph</strong>
            <small>くずし字・学習記録</small>
          </span>
        </Link>
        <div className={`sync-pill ${review.connected ? "online" : "demo"}`}>
          <span className="dot" />
          {review.connected ? "履歴 接続中" : "履歴 未接続"}
        </div>
      </header>

      <nav className="breadcrumbs" aria-label="パンくずリスト">
        <Link href="/projects">Projects</Link>
        <span><Link href="/projects/kuzushiji">くずし字</Link></span>
        <span>学習記録</span>
      </nav>

      <section className="learn-hero">
        <p className="eyebrow">PROGRESS</p>
        <h1>復習した事実を、次の学習につなげる。</h1>
        <p className="learn-hero-copy">
          Supabaseに残した自己評価を、履歴・評価傾向・次回予定として見返します。Notionの知識データには書き戻しません。
        </p>
      </section>

      {!review.connected && (
        <section className="settings-warning" role="status">
          <strong>復習履歴へ接続できていません。</strong>
          <p>Review自体はNotion由来のキューへフォールバックできます。Settingsで保存系の接続状態を確認してください。</p>
        </section>
      )}

      <section className="progress-summary-grid" aria-label="復習サマリー">
        <article className="progress-summary-card">
          <span>REVIEW ATTEMPTS</span>
          <strong>{review.history.length}</strong>
          <small>保存済みの復習回数</small>
        </article>
        <article className="progress-summary-card">
          <span>CONFIDENT</span>
          <strong>{confidentRate}%</strong>
          <small>「できた」「即答」の割合</small>
        </article>
        <article className="progress-summary-card">
          <span>TRACKED ITEMS</span>
          <strong>{review.states.length}</strong>
          <small>復習スケジュール管理中</small>
        </article>
        <article className="progress-summary-card">
          <span>NEXT REVIEW</span>
          <strong>{nextDue ? formatDateTime(nextDue) : "—"}</strong>
          <small>{dueNow > 0 ? `現在 ${dueNow}件が期限到来` : "次に期限が来る時刻"}</small>
        </article>
      </section>

      <section className="progress-layout">
        <div>
          <article className="progress-panel">
            <div className="progress-panel-header">
              <h2>最近の復習</h2>
              <span>{review.history.length} attempts</span>
            </div>
            {review.history.length > 0 ? (
              <div className="activity-list">
                {review.history.slice(0, 20).map((attempt) => {
                  const meta = itemMeta(attempt.item_id, attempt.item_kind, data);
                  return (
                    <Link className="activity-row" href={meta.href} key={attempt.id}>
                      <span className="activity-time">{formatDateTime(attempt.reviewed_at)}</span>
                      <div className="activity-copy">
                        <strong>{meta.label}</strong>
                        <p>{meta.detail}・次回 {formatDateTime(attempt.due_at)}</p>
                      </div>
                      <span className="activity-grade">{gradeLabels[attempt.grade]}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="progress-empty">まだ保存された復習履歴がありません。最初の復習を完了すると、ここに時系列で表示されます。</p>
            )}
          </article>
        </div>

        <div>
          <article className="progress-panel">
            <div className="progress-panel-header">
              <h2>自己評価の内訳</h2>
              <span>{review.history.length} answers</span>
            </div>
            <div className="grade-distribution">
              {(Object.keys(gradeLabels) as ReviewGrade[]).map((grade) => {
                const percent = review.history.length > 0 ? Math.round((counts[grade] / review.history.length) * 100) : 0;
                return (
                  <div className="grade-meter-row" key={grade}>
                    <span>{gradeLabels[grade]}</span>
                    <div className="grade-meter-track" aria-label={`${gradeLabels[grade]} ${percent}%`}>
                      <i style={{ width: `${percent}%` }} />
                    </div>
                    <strong>{counts[grade]}</strong>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="progress-panel">
            <div className="progress-panel-header">
              <h2>次回の復習予定</h2>
              <span>{upcoming.length} scheduled</span>
            </div>
            {upcoming.length > 0 ? (
              <div className="upcoming-list">
                {upcoming.slice(0, 12).map((state) => {
                  const meta = itemMeta(state.item_id, state.item_kind, data);
                  return (
                    <Link className="upcoming-row" href={meta.href} key={state.item_id}>
                      <span className="upcoming-time">{formatDateTime(state.due_at)}</span>
                      <div className="upcoming-copy">
                        <strong>{meta.label}</strong>
                        <p>{meta.detail}・前回 {gradeLabels[state.last_grade]}</p>
                      </div>
                      <span className="activity-grade">{state.interval_days === 0 ? "10分" : `${state.interval_days}日`}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="progress-empty">現在、未来に予約された復習はありません。</p>
            )}
          </article>
        </div>
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
