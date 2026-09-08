"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ExerciseAsset from "@/src/components/ExerciseAsset";
import type { ReviewCard, ReviewPersistenceMode, ReviewSessionContext } from "@/src/lib/review/types";
import {
  countOfflineAttemptStatuses,
  findOfflineAttemptByInstanceId,
  listOfflineAttempts,
  recoverSendingOfflineAttempts,
} from "@/src/lib/review/offline/attempt-outbox";
import {
  commitPilotOfflineAttempt,
  flushPilotAttemptOutbox,
  sendPilotOutboxAttempt,
} from "@/src/lib/review/offline/pilot-transport";

export type { ReviewCard } from "@/src/lib/review/types";

type Grade = "again" | "hard" | "good" | "easy";
type Result = {
  id: string;
  grade: Grade;
  saved: boolean;
  dueAt: string | null;
  correct: boolean | null;
  srsApplied?: boolean;
  syncStatus?: "accepted" | "pending" | "auth-required" | "blocked";
};
type SaveResponse = {
  saved?: boolean;
  dueAt?: string | null;
  intervalDays?: number;
  repetitions?: number;
  attemptId?: string;
  instanceId?: string;
  gradingStatus?: "graded" | "ungraded";
  isCorrect?: boolean | null;
  effectiveSrsGrade?: Grade | null;
  srsApplied?: boolean;
  srsReason?: string;
  receipt?: Record<string, unknown>;
  error?: string;
};
type PilotSubmission = {
  attemptId: string;
  instanceId: string;
  rawAnswer: string;
  selfEvaluation: Grade;
  responseMs: number;
  usedHint: boolean;
};

const gradeOptions: Array<{ grade: Grade; label: string; hint: string }> = [
  { grade: "again", label: "もう一度", hint: "不正解・ほぼ思い出せなかった" },
  { grade: "hard", label: "難しい", hint: "正解したが迷った" },
  { grade: "good", label: "できた", hint: "自力で正解できた" },
  { grade: "easy", label: "即答", hint: "迷わず正解できた" },
];

function normalizeAnswer(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ja-JP")
    .replace(/[\s　]+/g, "")
    .replace(/[。．.!！?？、,，・「」『』（）()]/g, "");
}

function evaluate(card: ReviewCard, answer: string) {
  if (card.answer.type === "single-choice") return answer === card.answer.correctOptionId;
  const normalized = normalizeAnswer(answer);
  return card.answer.acceptedAnswers.some((candidate) => normalizeAnswer(candidate) === normalized);
}

function suggestedGrade(correct: boolean, responseMs: number): Grade {
  if (!correct) return "again";
  if (responseMs <= 5000) return "easy";
  if (responseMs >= 30000) return "hard";
  return "good";
}

function formatNextDue(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function ReviewSession({ cards, persistence: requestedPersistence, session }: { cards: ReviewCard[]; persistence: ReviewPersistenceMode; session: ReviewSessionContext }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answerValue, setAnswerValue] = useState("");
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [recommended, setRecommended] = useState<Grade | null>(null);
  const [responseMs, setResponseMs] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [outboxCounts, setOutboxCounts] = useState({ pending: 0, authRequired: 0, blocked: 0 });
  const outboxRefreshSequence = useRef(0);
  const startedAt = useRef(Date.now());
  const pilotAttemptId = useRef<string | null>(null);
  const pilotSubmission = useRef<PilotSubmission | null>(null);
  const persistence: ReviewPersistenceMode = cards[index]?.persistenceKind === "versioned-pilot"
    ? "supabase"
    : requestedPersistence;

  async function refreshOutboxCounts(isActive: () => boolean = () => true) {
    const sequence = ++outboxRefreshSequence.current;
    try {
      const records = await listOfflineAttempts();
      const counts = countOfflineAttemptStatuses(records);
      if (isActive() && sequence === outboxRefreshSequence.current) setOutboxCounts(counts);
      return counts;
    } catch (error) {
      console.error("Study Graph: unable to refresh pilot outbox counts", error);
      return null;
    }
  }

  useEffect(() => {
    // The outbox belongs to the versioned Kuzushiji pilot. Keep other Review
    // domains free of pilot transport work while still flushing old pilot
    // records whenever a Kuzushiji session is opened.
    if (session.projectId !== "kuzushiji") return;
    let cancelled = false;
    const refreshOutbox = async () => {
      try {
        await recoverSendingOfflineAttempts();
        await flushPilotAttemptOutbox({ receiptKind: "objective" });
      } catch (error) {
        console.error("Study Graph: pilot outbox sync failed", error);
      }
      await refreshOutboxCounts(() => !cancelled);
    };
    void refreshOutbox();
    const onOnline = () => { void refreshOutbox(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refreshOutbox(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const summary = useMemo(() => {
    const counts: Record<Grade, number> = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const result of results) counts[result.grade] += 1;
    return counts;
  }, [results]);

  const accuracy = useMemo(() => {
    const graded = results.filter((result) => result.correct !== null);
    if (graded.length === 0) return null;
    return Math.round((graded.filter((result) => result.correct).length / graded.length) * 100);
  }, [results]);

  const nextDue = useMemo(() => {
    const dates = results.map((result) => result.dueAt).filter((value): value is string => Boolean(value)).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return formatNextDue(dates[0] ?? null);
  }, [results]);

  if (cards.length === 0) {
    const practice = session.mode === "practice";
    const scopeUnavailable = session.emptyReason === "scope-unavailable";
    return <section className="review-stage empty-stage"><p className="eyebrow">{practice ? "PRACTICE" : "REVIEW"}</p><h1>{scopeUnavailable ? "学習範囲を確認できません。" : practice ? "今できるPracticeはありません。" : "今日は復習項目がありません。"}</h1><p>{scopeUnavailable ? "Notionの学習範囲を確認できるまで、Reviewは開始しません。" : practice ? "Scope内で条件を満たす問題がまだありません。" : "次回復習日になった項目がここに自動で出てきます。"}</p><div className="result-actions single-action-row"><Link className="secondary-action" href={session.historyHref ?? session.projectHref}>{session.historyHref ? "次回予定を見る" : "Knowledge Graphを見る"}</Link><Link className="secondary-action" href="/">ホームへ戻る</Link></div></section>;
  }

  if (finished) {
    const noSrsCount = results.filter((result) => result.syncStatus === "accepted" && result.srsApplied === false).length;
    const displayedPendingCount = outboxCounts.pending;
    const displayedAuthRequiredCount = outboxCounts.authRequired;
    const displayedBlockedCount = outboxCounts.blocked;
    const fullySaved = results.length > 0 && results.every((result) => result.syncStatus === "accepted" || (result.syncStatus === undefined && result.saved));
    const resultLead = displayedPendingCount > 0
      ? "回答は端末に保存されています。未同期 " + displayedPendingCount + "件。"
      : displayedAuthRequiredCount > 0
        ? "回答は端末に保存されています。ログイン後に同期してください（" + displayedAuthRequiredCount + "件）。"
      : displayedBlockedCount > 0
        ? "セッションは完了しました。確認が必要な回答が " + displayedBlockedCount + "件あります。"
        : noSrsCount > 0
          ? "回答を保存しました。復習予定が更新されていない回答が " + noSrsCount + "件あります。"
          : fullySaved
            ? "回答と評価を保存し、次回復習日を更新しました。"
            : "セッションは完了しました。現在は永続保存を使わないfallbackモードです。";
    const accuracyLabel = accuracy === null ? "—" : String(accuracy) + "%";
    const nextDueLabel = nextDue ?? "—";
    return <section className="review-stage result-stage" aria-live="polite"><p className="eyebrow">SESSION COMPLETE</p><h1>{session.projectTitle}の{session.mode === "practice" ? "Practice" : "復習"}は完了です。</h1><p className="result-lead">{resultLead}</p>{displayedPendingCount > 0 && <p className="persistence-note" role="status">端末保存済み・未同期 {displayedPendingCount}件</p>}{displayedAuthRequiredCount > 0 && <p className="persistence-note" role="status">ログイン待ち {displayedAuthRequiredCount}件。<Link href="/login">ログインして再送</Link></p>}{displayedBlockedCount > 0 && <p className="persistence-note" role="status">確認が必要 {displayedBlockedCount}件。自動再送は停止しています。</p>}<div className="result-grid"><div><strong>{accuracyLabel}</strong><span>正答率</span></div><div><strong>{summary.again + summary.hard}</strong><span>要再確認</span></div><div><strong>{nextDueLabel}</strong><span>最短の次回復習</span></div></div><div className="grade-summary">{gradeOptions.map((option) => <div key={option.grade}><span>{option.label}</span><strong>{summary[option.grade]}</strong></div>)}</div><div className="result-actions"><button className="primary-action" type="button" onClick={() => { setIndex(0); setRevealed(false); setAnswerValue(""); setAnswerCorrect(null); setRecommended(null); setResults([]); setFinished(false); setSaveError(null); startedAt.current = Date.now(); }}>もう一度取り組む</button><Link className="secondary-action" href={session.historyHref ?? session.projectHref}>{session.historyHref ? "学習記録を見る" : "Knowledge Graphを見る"}</Link></div></section>;
  }

  const card = cards[index];
  const progress = ((index + 1) / cards.length) * 100;

  function submitAnswer(event?: FormEvent) {
    event?.preventDefault();
    if (revealed || !answerValue.trim()) return;
    const elapsed = Math.max(0, Date.now() - startedAt.current);
    const correct = evaluate(card, answerValue);
    setResponseMs(elapsed);
    setAnswerCorrect(correct);
    setRecommended(suggestedGrade(correct, elapsed));
    setRevealed(true);
  }

  function advance(result: Result) {
    const nextResults = [...results, result];
    setResults(nextResults);
    if (index >= cards.length - 1) { pilotAttemptId.current = null; pilotSubmission.current = null; setFinished(true); return; }
    setIndex((current) => current + 1);
    setRevealed(false);
    setAnswerValue("");
    setAnswerCorrect(null);
    setRecommended(null);
    setResponseMs(0);
    pilotAttemptId.current = null;
    pilotSubmission.current = null;
    startedAt.current = Date.now();
  }

  async function gradeCurrent(grade: Grade) {
    if (saving) return;
    setSaveError(null);
    const isPilot = card.persistenceKind === "versioned-pilot" && Boolean(card.instanceId);
    if (isPilot) {
      setSaving(true);
      try {
        // Reuse a durable record after a retry/re-render; never mint a new
        // attemptId for the same server-issued instance.
        const existing = await findOfflineAttemptByInstanceId(card.instanceId!);
        const durable = existing?.record.submission;
        if (durable && (typeof durable.rawAnswer !== "string" || durable.selfEvaluation === null)) {
          throw new Error("stored_submission_incomplete");
        }
        const submission: PilotSubmission = durable ? {
          attemptId: durable.attemptId,
          instanceId: durable.instanceId,
          rawAnswer: durable.rawAnswer as string,
          selfEvaluation: durable.selfEvaluation as Grade,
          responseMs: durable.responseMs ?? 0,
          usedHint: durable.usedHint,
        } : pilotSubmission.current ?? {
          attemptId: pilotAttemptId.current ?? crypto.randomUUID(),
          instanceId: card.instanceId!,
          rawAnswer: answerValue,
          selfEvaluation: grade,
          responseMs,
          usedHint: false,
        };
        pilotSubmission.current = submission;
        pilotAttemptId.current = submission.attemptId;
        const committed = existing
          ? { record: existing, reused: true }
          : await commitPilotOfflineAttempt(submission);
        const outcome = await sendPilotOutboxAttempt(committed.record.attemptId, { receiptKind: "objective" });
        if (!outcome) throw new Error("pilot_outbox_record_missing");
        await refreshOutboxCounts();
        if (outcome.kind === "accepted") {
          advance({
            id: card.id,
            grade: submission.selfEvaluation,
            saved: true,
            syncStatus: "accepted",
            dueAt: outcome.result.dueAt,
            correct: outcome.result.isCorrect,
            srsApplied: outcome.result.srsApplied,
          });
        } else if (outcome.kind === "pending") {
          // Durable local commit succeeded, so the session may continue while
          // server acceptance remains pending.
          advance({ id: card.id, grade: submission.selfEvaluation, saved: false, syncStatus: "pending", dueAt: null, correct: answerCorrect });
        } else if (outcome.kind === "auth-required") {
          advance({ id: card.id, grade: submission.selfEvaluation, saved: false, syncStatus: "auth-required", dueAt: null, correct: answerCorrect });
        } else if (outcome.kind === "blocked") {
          advance({ id: card.id, grade: submission.selfEvaluation, saved: false, syncStatus: "blocked", dueAt: null, correct: answerCorrect });
        } else if (outcome.record.record.status === "accepted-applied" || outcome.record.record.status === "accepted-no-srs") {
          const result = outcome.result ?? null;
          if (!result) throw new Error("stored_receipt_incomplete");
          advance({ id: card.id, grade: submission.selfEvaluation, saved: true, syncStatus: "accepted", dueAt: result.dueAt, correct: result.isCorrect, srsApplied: result.srsApplied });
        } else if (outcome.record.record.status === "blocked") {
          advance({ id: card.id, grade: submission.selfEvaluation, saved: false, syncStatus: "blocked", dueAt: null, correct: answerCorrect });
        } else if (outcome.record.record.status === "auth-required") {
          advance({ id: card.id, grade: submission.selfEvaluation, saved: false, syncStatus: "auth-required", dueAt: null, correct: answerCorrect });
        } else {
          setSaveError("この回答を同期できませんでした。端末保存は維持されています。");
        }
      } catch (error) {
        console.error("Study Graph: Kuzushiji pilot save failed", error);
        if (error instanceof Error && (error.message === "IndexedDB is unavailable" || error.message.includes("IndexedDB"))) {
          setSaveError("回答を端末に保存できませんでした。空き容量などを確認してください。");
        } else {
          setSaveError("回答を保存できませんでした。端末保存を確認して、もう一度押してください。");
        }
      } finally { setSaving(false); }
      return;
    }
    if (persistence === "fallback") { advance({ id: card.id, grade, saved: false, dueAt: null, correct: answerCorrect }); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/review/attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: card.id, itemKind: card.kind, grade, exerciseId: card.exerciseId, answerType: card.answer.type, answerText: answerValue, isCorrect: answerCorrect, responseMs, usedHint: false }) });
      const payload = (await response.json()) as SaveResponse;
      if (!response.ok) throw new Error(payload.error || "save_failed");
      advance({ id: card.id, grade, saved: payload.saved === true, dueAt: typeof payload.dueAt === "string" ? payload.dueAt : null, correct: answerCorrect });
    } catch (error) {
      console.error("Study Graph: review save failed", error);
      setSaveError("回答を保存できませんでした。通信状態を確認して、もう一度押してください。");
    } finally { setSaving(false); }
  }

  return <section className="review-stage"><div className="review-progress-row"><div><p className="eyebrow">{card.eyebrow}</p><span>{index + 1} / {cards.length}</span>{outboxCounts.pending > 0 && <small role="status">端末保存済み・未同期 {outboxCounts.pending}件</small>}{outboxCounts.authRequired > 0 && <small role="status">ログイン待ち {outboxCounts.authRequired}件。<Link href="/login">ログインして再送</Link></small>}{outboxCounts.blocked > 0 && <small role="status">確認が必要 {outboxCounts.blocked}件</small>}</div><Link href={session.projectHref}>終了</Link></div><div className="progress-track" role="progressbar" aria-label="復習進捗" aria-valuemin={1} aria-valuemax={cards.length} aria-valuenow={index + 1}><span style={{ width: `${progress}%` }} /></div><article className={`study-card ${revealed ? "is-revealed" : ""}`}><div className="study-card-front"><span className="review-kind">{card.kindLabel}</span><p className="study-prompt">{card.prompt}</p>{card.asset && <ExerciseAsset asset={card.asset} />}<div className={card.frontStyle === "glyph" ? "study-glyph" : "study-mistake-title"}>{card.front}</div><p className="study-reason">{card.reason}</p></div>{!revealed ? <form className="answer-entry" onSubmit={submitAnswer}>{card.answer.type === "text" ? <input autoFocus value={answerValue} onChange={(event) => setAnswerValue(event.target.value)} placeholder={card.answer.placeholder ?? "回答を入力"} aria-label="回答" /> : <div className="choice-list">{card.answer.options.map((option) => <label key={option.id} className={answerValue === option.id ? "selected" : ""}><input type="radio" name={`answer-${card.exerciseId}`} value={option.id} checked={answerValue === option.id} onChange={() => setAnswerValue(option.id)} /><span>{option.label}</span></label>)}</div>}<button className="reveal-button" type="submit" disabled={!answerValue.trim()}>回答する</button></form> : <div className="answer-panel"><p className={`answer-verdict ${answerCorrect ? "correct" : "incorrect"}`}>{answerCorrect ? "正解" : "不正解"}</p><p className="your-answer">あなたの回答：{card.answer.type === "single-choice" ? card.answer.options.find((option) => option.id === answerValue)?.label ?? answerValue : answerValue}</p><div className="answer-list">{card.answerRows.map((row) => <div key={`${card.exerciseId}-${row.label}`}><span>{row.label}</span><strong>{row.value || "未登録"}</strong></div>)}</div>{card.sourceUrl !== "#" && <a className="notion-source-link" href={card.sourceUrl} target="_blank" rel="noreferrer">Notionで元データを確認</a>}</div>}</article>{revealed && <div className="grade-area"><p>結果を踏まえた推奨評価：<strong>{gradeOptions.find((option) => option.grade === recommended)?.label ?? "—"}</strong></p>{persistence === "fallback" && <p className="persistence-note" role="status">fallbackモードのため、この回答は保存せずに進みます。</p>}{saveError && <p className="save-error" role="alert">{saveError}</p>}<div className="grade-buttons">{gradeOptions.map((option) => <button className={option.grade === recommended ? "recommended-grade" : ""} key={option.grade} type="button" disabled={saving} aria-busy={saving} onClick={() => void gradeCurrent(option.grade)}><strong>{saving ? "保存中…" : option.label}</strong><span>{option.hint}</span></button>)}</div></div>}</section>;
}
