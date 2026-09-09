import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
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
      detail: character ? [character.reading, character.mother ? `字母 ${character.mother}` : ""].filter(Boolean).join("・") : "学習項目",
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
    return { history: [] as KuzushijiReviewAttempt[], connected: false };
  }

  try {
    const history = await getReviewHistory(100);
    return { history: history.filter(isKuzushijiAttempt), connected: true };
  } catch (error) {
    console.error("Study Graph: progress history fetch failed", error);
    return { history: [] as KuzushijiReviewAttempt[], connected: false };
  }
}

async function objectiveReviewData(): Promise<{ state: PilotObjectiveReviewState | null; connected: boolean }> {
  if (!getPilotRuntimeConfig()) return { state: null, connected: false };
  try {
    return { state: await getKuzushijiPilotObjectiveState(), connected: true };
  } catch (error) {
    console.error("Study Graph: current review schedule fetch failed", error);
    return { state: null, connected: false };
  }
}

export default async function KuzushijiProgressPage() {
  const [data, review, objective] = await Promise.all([
    getKuzushijiDashboard(),
    reviewData(),
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
  const objectiveNextLabel = objectiveState ? formatDateTime(objectiveState.due_at) : objective.connected ? "初回待ち" : "—";

  return (
    <main className="phase5-shell phase5-deep-shell">
      <AppHeader context="くずし字 · 学習記録" backHref="/projects/kuzushiji" backLabel="くずし字" />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects/kuzushiji">くずし字</Link>
        <span aria-hidden="true">›</span>
        <span>学習記録</span>
      </div>

      <section className="phase5-page-heading phase5-deep-heading">
        <div>
          <p className="phase5-eyebrow">くずし字</p>
          <h1 className="phase5-page-title">学習記録</h1>
          <p className="phase5-context">次の復習と、これまでの歩み</p>
        </div>
      </section>

      {!objective.connected && (
        <p className="phase5-deep-notice" role="status">
          次の復習予定を取得できませんでした。時間をおいてもう一度確認してください。
        </p>
      )}

      {!review.connected && (
        <p className="phase5-deep-notice" role="status">
          過去の復習記録を取得できませんでした。時間をおいてもう一度確認してください。
        </p>
      )}

      <section className="phase5-progress-focus" aria-labelledby="next-review-title">
        <div>
          <p className="phase5-eyebrow">次の復習</p>
          <h2 id="next-review-title">{objectiveState ? (objectiveDueNow ? "今、復習できます" : objectiveNextLabel) : objective.connected ? "はじめての復習" : "予定を確認できません"}</h2>
          <p>{objectiveState ? `前回は「${gradeLabels[objectiveState.last_grade]}」でした。` : objective.connected ? "最初の回答を保存すると、次の予定がここに表示されます。" : "接続が戻ると次の予定を表示します。"}</p>
        </div>
        {objectiveState && (
          <Link className="phase5-action" href="/review/session?project=kuzushiji">
            復習を始める <span aria-hidden="true">→</span>
          </Link>
        )}
      </section>

      <section className="phase5-progress-section" aria-labelledby="history-title">
        <div className="phase5-section-heading">
          <h2 id="history-title">これまでの復習</h2>
          <span>{review.history.length}件</span>
        </div>
        {review.history.length > 0 ? (
          <div className="phase5-progress-list">
            {review.history.slice(0, 20).map((attempt) => {
              const meta = itemMeta(attempt.item_id, attempt.item_kind, data);
              return (
                <Link className="phase5-progress-row" href={meta.href} key={attempt.id}>
                  <span className="phase5-progress-time">{formatDateTime(attempt.reviewed_at)}</span>
                  <span className="phase5-progress-copy">
                    <strong>{meta.label}</strong>
                    <span>{meta.detail}・当時の次回 {formatDateTime(attempt.due_at)}</span>
                  </span>
                  <span className="phase5-progress-grade">{gradeLabels[attempt.grade]}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="phase5-deep-empty">表示できる復習記録はありません。</p>
        )}
      </section>

      <section className="phase5-progress-section" aria-labelledby="confidence-title">
        <div className="phase5-section-heading">
          <h2 id="confidence-title">これまでの自己評価</h2>
          <span>{confidentRate}%が「できた」以上</span>
        </div>
        <div className="phase5-grade-distribution">
          {(Object.keys(gradeLabels) as ReviewGrade[]).map((grade) => {
            const percent = review.history.length > 0 ? Math.round((counts[grade] / review.history.length) * 100) : 0;
            return (
              <div className="phase5-grade-row" key={grade}>
                <span>{gradeLabels[grade]}</span>
                <div className="phase5-grade-track" aria-label={`${gradeLabels[grade]} ${percent}%`}><i style={{ width: `${percent}%` }} /></div>
                <strong>{counts[grade]}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <section className="phase5-progress-section" aria-labelledby="current-review-title">
        <div className="phase5-section-heading">
          <h2 id="current-review-title">現在の復習</h2>
          <span>次の予定</span>
        </div>
        {objectiveState ? (
          <Link className="phase5-progress-next" href="/review/session?project=kuzushiji">
            <span>
              <strong>日本永代蔵「あ」字形の単字読解</strong>
              <span>{objectiveDueNow ? "今取り組めます" : `次回 ${objectiveNextLabel}`}・前回 {gradeLabels[objectiveState.last_grade]}</span>
            </span>
            <b>{objectiveState.interval_days === 0 ? "10分" : `${objectiveState.interval_days}日`}</b>
          </Link>
        ) : objective.connected ? (
          <p className="phase5-deep-empty">最初の復習を保存すると、次の予定がここに表示されます。</p>
        ) : (
          <p className="phase5-deep-empty">次の復習予定を表示できません。</p>
        )}
      </section>

      <div className="phase5-link-strip">
        <Link href="/projects/kuzushiji">くずし字へ戻る</Link>
        <Link href="/review">復習を開く</Link>
      </div>

      <PrimaryNav active="learn" />
    </main>
  );
}
