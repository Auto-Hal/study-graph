import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import {
  getKuzushijiPilotObjectiveState,
  getPilotRuntimeConfig,
  type PilotObjectiveReviewState,
} from "@/src/lib/supabase/pilot";
import {
  getReviewHistory,
  isReviewPersistenceConfigured,
  type ReviewAttempt,
  type ReviewGrade,
} from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

type KuzushijiReviewKind = "character" | "mistake";
type KuzushijiReviewAttempt = ReviewAttempt & { item_kind: KuzushijiReviewKind };

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

async function legacyReviewData() {
  if (!isReviewPersistenceConfigured()) {
    return { history: [] as KuzushijiReviewAttempt[], connected: false };
  }

  try {
    const history = await getReviewHistory(100);
    return { history: history.filter(isKuzushijiAttempt), connected: true };
  } catch (error) {
    console.error("Study Graph: legacy progress history fetch failed", error);
    return { history: [] as KuzushijiReviewAttempt[], connected: false };
  }
}

async function objectiveReviewData(): Promise<{ state: PilotObjectiveReviewState | null; connected: boolean }> {
  if (!getPilotRuntimeConfig()) return { state: null, connected: false };
  try {
    return { state: await getKuzushijiPilotObjectiveState(), connected: true };
  } catch (error) {
    console.error("Study Graph: Objective progress state fetch failed", error);
    return { state: null, connected: false };
  }
}

export default async function KuzushijiProgressPage() {
  const [data, review, objective] = await Promise.all([
    getKuzushijiDashboard(),
    legacyReviewData(),
    objectiveReviewData(),
  ]);
  const counts: Record<ReviewGrade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const attempt of review.history) counts[attempt.grade] += 1;

  const confident = counts.good + counts.easy;
  const confidentRate = review.history.length > 0 ? Math.round((confident / review.history.length) * 100) : 0;
  const objectiveState = objective.state;
  const objectiveDueNow = objective.connected && (
    !objectiveState || new Date(objectiveState.due_at).getTime() <= Date.now()
  );
  const objectiveStateLabel = objectiveState ? `R${objectiveState.state_revision}` : objective.connected ? "NEW" : "—";
  const objectiveNextLabel = objectiveState ? formatDateTime(objectiveState.due_at) : objective.connected ? "初回待ち" : "—";

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
        <div className={`sync-pill ${objective.connected ? "online" : "demo"}`}>
          <span className="dot" />
          {objective.connected ? "Objective SRS 接続中" : "Objective SRS 未接続"}
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
          現在のObjective SRSによる次回予定と、移行前を含むLegacy履歴を分けて表示します。Notionの知識データには書き戻しません。
        </p>
      </section>

      {!objective.connected && (
        <section className="settings-warning" role="status">
          <strong>現行Objective SRSへ接続できていません。</strong>
          <p>次回復習日は表示できません。Reviewの保存系設定とSupabase接続を確認してください。</p>
        </section>
      )}

      {!review.connected && (
        <section className="settings-warning" role="status">
          <strong>Legacy履歴へ接続できていません。</strong>
          <p>現行Objective SRSとは別の、移行前を含む過去履歴だけが表示できない状態です。</p>
        </section>
      )}

      <section className="progress-summary-grid" aria-label="復習サマリー">
        <article className="progress-summary-card">
          <span>LEGACY ATTEMPTS</span>
          <strong>{review.history.length}</strong>
          <small>移行前を含む保存履歴</small>
        </article>
        <article className="progress-summary-card">
          <span>LEGACY CONFIDENT</span>
          <strong>{confidentRate}%</strong>
          <small>過去履歴の「できた」「即答」</small>
        </article>
        <article className="progress-summary-card">
          <span>OBJECTIVE STATE</span>
          <strong>{objectiveStateLabel}</strong>
          <small>{objectiveState ? `前回 ${gradeLabels[objectiveState.last_grade]}` : objective.connected ? "epoch 1・未初期化" : "状態を取得できません"}</small>
        </article>
        <article className="progress-summary-card">
          <span>NEXT REVIEW</span>
          <strong>{objectiveNextLabel}</strong>
          <small>{objectiveDueNow ? "現在Review対象" : objectiveState ? "Objective SRSの次回予定" : "Objective SRS未接続"}</small>
        </article>
      </section>

      <section className="progress-layout">
        <div>
          <article className="progress-panel">
            <div className="progress-panel-header">
              <h2>Legacy復習履歴</h2>
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
                        <p>{meta.detail}・当時の次回 {formatDateTime(attempt.due_at)}</p>
                      </div>
                      <span className="activity-grade">{gradeLabels[attempt.grade]}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="progress-empty">表示できるLegacy復習履歴はありません。</p>
            )}
          </article>
        </div>

        <div>
          <article className="progress-panel">
            <div className="progress-panel-header">
              <h2>Legacy自己評価の内訳</h2>
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
              <h2>現行Objective SRS</h2>
              <span>epoch 1</span>
            </div>
            {objectiveState ? (
              <div className="upcoming-list">
                <Link className="upcoming-row" href="/review?project=kuzushiji">
                  <span className="upcoming-time">{formatDateTime(objectiveState.due_at)}</span>
                  <div className="upcoming-copy">
                    <strong>日本永代蔵「あ」字形の単字読解</strong>
                    <p>前回 {gradeLabels[objectiveState.last_grade]}・state revision {objectiveState.state_revision}</p>
                  </div>
                  <span className="activity-grade">{objectiveState.interval_days === 0 ? "10分" : `${objectiveState.interval_days}日`}</span>
                </Link>
              </div>
            ) : objective.connected ? (
              <p className="progress-empty">Objective epoch 1はまだ未初期化です。次の対象Reviewを保存すると、ここに初回の次回予定が作成されます。</p>
            ) : (
              <p className="progress-empty">Objective SRSへ接続できないため、現行の次回予定を表示できません。</p>
            )}
          </article>
        </div>
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
