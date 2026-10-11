"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReviewSession from "./ReviewSession";
import PilotOutboxForegroundSync from "./PilotOutboxForegroundSync";
import type { StudyUnit } from "@/src/lib/review/units/catalog";
import { readUnitRun, writeUnitRun, type UnitRun } from "@/src/lib/review/units/run-store";
import { readUnitAnswerDraft, type UnitAnswerDraft } from "@/src/lib/review/units/draft-store";
import { unitProgressFromOutbox } from "@/src/lib/review/units/progress";
import { listOfflineAttempts } from "@/src/lib/review/offline/attempt-outbox";
import type { PilotSessionResult } from "@/src/lib/review/offline/result-reconciliation";

export default function StudyUnitPractice({ unit, availability }: { unit: StudyUnit; availability: "ready" | "paused" | "scope-unavailable" }) {
  const [stored, setStored] = useState<UnitRun | null>(null);
  const [progress, setProgress] = useState<PilotSessionResult[]>([]);
  const [active, setActive] = useState<{ run: UnitRun; results: PilotSessionResult[]; draft: UnitAnswerDraft | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageReady, setStorageReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operation = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const run = await readUnitRun(unit);
        const results = run ? unitProgressFromOutbox(run.cards, await listOfflineAttempts()) : [];
        if (!cancelled) { setStored(run); setProgress(results); setStorageReady(true); }
      } catch { if (!cancelled) setError("この端末の練習を確認できません。保存領域を利用できる状態にして、ページを開き直してください。"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [unit]);

  async function closePractice() {
    if (!active || operation.current) return;
    operation.current = true; setBusy(true); setError(null);
    try { setProgress(unitProgressFromOutbox(active.run.cards, await listOfflineAttempts())); }
    catch { setError("保存した回答を確認できません。ページを開き直してください。"); }
    finally { setActive(null); operation.current = false; setBusy(false); }
  }

  async function resume() {
    if (!stored || operation.current) return;
    operation.current = true; setBusy(true); setError(null);
    try {
      // Only outbox commitments advance the run. A stale draft for an already
      // committed card must never become an editable answer again.
      const results = unitProgressFromOutbox(stored.cards, await listOfflineAttempts());
      const card = stored.cards[results.length];
      const draft = card ? readUnitAnswerDraft(stored, card) : null;
      setActive({ run: stored, results, draft });
    } catch { setError("保存した回答または下書きを読み出せません。保存領域を利用できる状態にして、ページを開き直してください。下書きは上書きしていません。"); }
    finally { operation.current = false; setBusy(false); }
  }

  async function start() {
    if (operation.current || !storageReady || loading || availability !== "ready") return;
    operation.current = true; setBusy(true); setError(null);
    try {
      if (stored) {
        const previous = unitProgressFromOutbox(stored.cards, await listOfflineAttempts());
        if (previous.length < stored.cards.length || previous.some((result) => result.syncStatus !== "accepted")) {
          setProgress(previous);
          throw new Error("resume_required");
        }
      }
      const response = await fetch("/api/units/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId: unit.id }) });
      if (!response.ok) throw new Error("unit_start_unavailable");
      const data = await response.json();
      const run: UnitRun = { ...data, schemaVersion: 1, runId: crypto.randomUUID(), startedAt: new Date().toISOString() };
      await writeUnitRun(run, unit);
      setStored(run); setProgress([]); setActive({ run, results: [], draft: null });
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "resume_required"
        ? "前の練習を再開して、回答と同期状況を確認してください。"
        : "練習を開始できませんでした。学習範囲と通信を確認し、もう一度お試しください。");
    } finally { operation.current = false; setBusy(false); }
  }

  if (active) return <ReviewSession key={active.run.runId} cards={active.run.cards} persistence="supabase" session={active.run.session} initialResults={active.results} unitDraft={{ scope: active.run, initial: active.draft }} onExit={() => void closePractice()} />;
  const completed = stored && progress.length === stored.cards.length;
  const outstanding = progress.some((result) => result.syncStatus !== "accepted");
  return <>
    <PilotOutboxForegroundSync />
    <section className="unit-overview" aria-label="単元の進め方">
      <p>{unit.goal}</p>
      <ul>{unit.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="persistence-note">回答と自己評価は保存されます。単元練習は次回の復習予定を変更しません。予定に沿った復習は「今日の復習」から進めます。</p>
      <p className="persistence-note">入力中の下書きはこのブラウザに残ります。「途中から再開」で文章と解答表示を戻せます。自己評価を選ぶと回答が確定します。</p>
      {availability !== "ready" && <p role="status">{availability === "paused" ? "この科目の新しい出題は停止中です。" : "この単元の学習範囲を確認できません。通信が戻ってから開き直してください。"}</p>}
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="unit-actions">
        {stored && <button type="button" className="primary-action" disabled={busy || loading} onClick={() => void resume()}>{completed ? "前回の結果を見る" : `途中から再開（${progress.length} / ${unit.questionCount}問）`}</button>}
        {(!stored || completed) && <button type="button" className={stored ? "secondary-action" : "primary-action"} disabled={busy || loading || !storageReady || availability !== "ready"} aria-busy={busy} onClick={() => void start()}>{loading ? "保存した練習を確認中…" : busy ? "問題を準備中…" : stored ? "新しく練習する" : "単元を練習する"}</button>}
        <Link className="secondary-action" href={`/review/session?project=${unit.projectId}`} prefetch={false}>今日の復習へ</Link>
      </div>
      {outstanding && <p role="status">端末保存済みの回答があります。前回の結果で同期状況を確認してください。</p>}
      <details className="unit-sources"><summary>教材と出典</summary><ul>{unit.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>
    </section>
  </>;
}
