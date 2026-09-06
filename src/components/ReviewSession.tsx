"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  ReviewCard,
  ReviewPersistenceMode,
  ReviewSessionContext,
} from "@/src/lib/review/types";

export type { ReviewCard } from "@/src/lib/review/types";

type Grade = "again" | "hard" | "good" | "easy";

type Result = {
  id: string;
  grade: Grade;
  saved: boolean;
  dueAt: string | null;
};

type SaveResponse = {
  saved?: boolean;
  dueAt?: string;
  intervalDays?: number;
  repetitions?: number;
  error?: string;
};

const gradeOptions: Array<{
  grade: Grade;
  label: string;
  hint: string;
}> = [
  { grade: "again", label: "もう一度", hint: "ほぼ思い出せなかった" },
  { grade: "hard", label: "難しい", hint: "ヒントがあれば分かった" },
  { grade: "good", label: "できた", hint: "自力で思い出せた" },
  { grade: "easy", label: "即答", hint: "迷わず答えられた" },
];

function formatNextDue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ReviewSession({
  cards,
  persistence,
  session,
}: {
  cards: ReviewCard[];
  persistence: ReviewPersistenceMode;
  session: ReviewSessionContext;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const counts: Record<Grade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const result of results) counts[result.grade] += 1;
    return counts;
  }, [results]);

  const nextDue = useMemo(() => {
    const dates = results
      .map((result) => result.dueAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return formatNextDue(dates[0] ?? null);
  }, [results]);

  if (cards.length === 0) {
    const practice = session.mode === "practice";
    return (
      <section className="review-stage empty-stage">
        <p className="eyebrow">{practice ? "PRACTICE" : "REVIEW"}</p>
        <h1>{practice ? "今できるPracticeはありません。" : "今日は復習項目がありません。"}</h1>
        <p>
          {practice
            ? "未追跡の候補を一巡済みか、追跡中の知識はまだ復習期限前です。Knowledge Graphで関係を見直してから、次の期限を待てます。"
            : "次回復習日になった項目や、新しくNotionに追加された弱点がここに自動で出てきます。"}
        </p>
        <div className="result-actions single-action-row">
          {session.historyHref ? (
            <Link className="secondary-action" href={session.historyHref}>次回予定を見る</Link>
          ) : (
            <Link className="secondary-action" href={session.projectHref}>Knowledge Graphを見る</Link>
          )}
          <Link className="secondary-action" href="/">ホームへ戻る</Link>
        </div>
      </section>
    );
  }

  if (finished) {
    const confident = summary.good + summary.easy;
    const needsWork = summary.again + summary.hard;
    const savedCount = results.filter((result) => result.saved).length;
    const fullySaved = savedCount === results.length && results.length > 0;
    const savedLead = session.mode === "practice"
      ? "今回評価した知識を復習スケジュールへ登録しました。次回は期限到来を優先しつつ、未追跡の知識を続けてPracticeできます。"
      : "今回の評価を保存し、次回復習日を更新しました。";

    return (
      <section className="review-stage result-stage" aria-live="polite">
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>{session.projectTitle}の{session.mode === "practice" ? "Practice" : "復習"}は完了です。</h1>
        <p className="result-lead">
          {fullySaved
            ? savedLead
            : "セッションは完了しました。現在は永続保存を使わないfallbackモードです。"}
        </p>

        <div className="result-grid">
          <div><strong>{confident}</strong><span>自力でできた</span></div>
          <div><strong>{needsWork}</strong><span>要再確認</span></div>
          <div><strong>{nextDue ?? "—"}</strong><span>最短の次回復習</span></div>
        </div>

        <div className="grade-summary">
          {gradeOptions.map((option) => (
            <div key={option.grade}>
              <span>{option.label}</span>
              <strong>{summary[option.grade]}</strong>
            </div>
          ))}
        </div>

        <div className="result-actions">
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setIndex(0);
              setRevealed(false);
              setResults([]);
              setFinished(false);
              setSaveError(null);
            }}
          >
            もう一度取り組む
          </button>
          {session.historyHref ? (
            <Link className="secondary-action" href={session.historyHref}>学習記録を見る</Link>
          ) : (
            <Link className="secondary-action" href={session.projectHref}>Knowledge Graphを見る</Link>
          )}
        </div>
      </section>
    );
  }

  const card = cards[index];
  const progress = ((index + 1) / cards.length) * 100;

  function advance(result: Result) {
    const nextResults = [...results, result];
    setResults(nextResults);

    if (index >= cards.length - 1) {
      setFinished(true);
      return;
    }

    setIndex((current) => current + 1);
    setRevealed(false);
  }

  async function gradeCurrent(grade: Grade) {
    if (saving) return;

    setSaveError(null);

    if (persistence === "fallback") {
      advance({ id: card.id, grade, saved: false, dueAt: null });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/review/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: card.id, itemKind: card.kind, grade }),
      });

      const payload = (await response.json()) as SaveResponse;
      if (!response.ok) {
        throw new Error(payload.error || "save_failed");
      }

      advance({
        id: card.id,
        grade,
        saved: payload.saved === true,
        dueAt: typeof payload.dueAt === "string" ? payload.dueAt : null,
      });
    } catch (error) {
      console.error("Study Graph: review save failed", error);
      setSaveError("評価を保存できませんでした。通信状態を確認して、もう一度押してください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="review-stage">
      <div className="review-progress-row">
        <div>
          <p className="eyebrow">{card.eyebrow}</p>
          <span>{index + 1} / {cards.length}</span>
        </div>
        <Link href={session.projectHref}>終了</Link>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-label="復習進捗"
        aria-valuemin={1}
        aria-valuemax={cards.length}
        aria-valuenow={index + 1}
        aria-valuetext={`${index + 1}/${cards.length}`}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      <article className={`study-card ${revealed ? "is-revealed" : ""}`}>
        <div className="study-card-front">
          <span className="review-kind">{card.kindLabel}</span>
          <p className="study-prompt">{card.prompt}</p>
          <div className={card.frontStyle === "glyph" ? "study-glyph" : "study-mistake-title"}>{card.front}</div>
          <p className="study-reason">{card.reason}</p>
        </div>

        {!revealed ? (
          <button className="reveal-button" type="button" onClick={() => setRevealed(true)}>
            答えを表示
          </button>
        ) : (
          <div className="answer-panel">
            <p className="eyebrow">ANSWER</p>
            <div className="answer-list">
              {card.answerRows.map((row) => (
                <div key={`${card.id}-${row.label}`}>
                  <span>{row.label}</span>
                  <strong>{row.value || "未登録"}</strong>
                </div>
              ))}
            </div>
            {card.sourceUrl !== "#" && (
              <a className="notion-source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">
                Notionで元データを確認
              </a>
            )}
          </div>
        )}
      </article>

      {revealed && (
        <div className="grade-area">
          <p>どのくらい思い出せましたか？</p>
          {persistence === "fallback" && (
            <p className="persistence-note" role="status">fallbackモードのため、この評価は保存せずに進みます。</p>
          )}
          {saveError && <p className="save-error" role="alert">{saveError}</p>}
          <div className="grade-buttons">
            {gradeOptions.map((option) => (
              <button
                key={option.grade}
                type="button"
                disabled={saving}
                aria-busy={saving}
                onClick={() => void gradeCurrent(option.grade)}
              >
                <strong>{saving ? "保存中…" : option.label}</strong>
                <span>{option.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
