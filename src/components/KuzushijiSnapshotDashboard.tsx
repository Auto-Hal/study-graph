"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "./AppHeader";
import PrimaryNav from "./PrimaryNav";
import ObjectiveStateMirrorSync from "./ObjectiveStateMirrorSync";
import { getStudyProject } from "@/src/lib/projects/registry";
import { cacheScopeKnowledgeSnapshot, getCachedCurrentScopeKnowledgeSnapshot } from "@/src/lib/review/offline/snapshot-cache";
import { isScopeKnowledgeSnapshotHashValidBrowser } from "@/src/lib/review/offline/snapshot-browser";
import type { ScopeKnowledgeSnapshot } from "@/src/lib/review/offline/snapshot-content";
import { dashboardFromScopeKnowledgeSnapshot, selectSnapshotForDisplay, type KuzushijiSnapshotDashboard as SnapshotDashboard } from "@/src/lib/review/snapshot-sync/dashboard";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; dashboard: SnapshotDashboard; cached: boolean }
  | { kind: "bootstrap"; message?: string }
  | { kind: "unavailable"; message: string };

type SnapshotState = PageState["kind"];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function asSnapshot(value: unknown): ScopeKnowledgeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = (value as { snapshot?: unknown }).snapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as ScopeKnowledgeSnapshot : null;
}

async function fetchCurrentSnapshot(): Promise<{ kind: "snapshot"; snapshot: ScopeKnowledgeSnapshot } | { kind: "missing" } | { kind: "failed" }> {
  try {
    const response = await fetch("/api/snapshots/kuzushiji/current", { method: "GET", credentials: "same-origin", cache: "no-store" });
    // Native snapshot access is no-login. Treat an unexpected legacy 401 as a
    // normal unavailable response rather than sending learners to /login.
    if (response.status === 401) return { kind: "failed" };
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "failed" };
    const snapshot = asSnapshot(await response.json());
    if (!snapshot || !(await isScopeKnowledgeSnapshotHashValidBrowser(snapshot))) return { kind: "failed" };
    return { kind: "snapshot", snapshot };
  } catch {
    return { kind: "failed" };
  }
}

export default function KuzushijiSnapshotDashboard() {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const useCachedSnapshot = useCallback(async (missingMessage?: string): Promise<boolean> => {
    try {
      const cached = await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji");
      if (cached) {
        setState({ kind: "ready", dashboard: dashboardFromScopeKnowledgeSnapshot(cached), cached: true });
        return true;
      }
    } catch {
      // Local replica unavailable; keep the server authority path unchanged.
    }
    setState(missingMessage ? { kind: "bootstrap", message: missingMessage } : { kind: "unavailable", message: "学習状況を現在取得できません。" });
    return false;
  }, []);

  const loadCurrent = useCallback(async () => {
    setSyncError(null);
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const result = await fetchCurrentSnapshot();
    if (result.kind === "snapshot") {
      try {
        const cacheResult = await cacheScopeKnowledgeSnapshot(result.snapshot);
        if (cacheResult.kind === "conflict") {
          if (await useCachedSnapshot()) return;
          setState({ kind: "unavailable", message: "学習状況を現在取得できません。" });
          return;
        }
        if (cacheResult.kind === "rejected") throw new Error("snapshot cache rejected candidate");
        const cached = await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji").catch(() => null);
        const displayed = selectSnapshotForDisplay(result.snapshot, cached);
        setState({ kind: "ready", dashboard: dashboardFromScopeKnowledgeSnapshot(displayed.snapshot), cached: displayed.source === "cache" });
        return;
      } catch {
        try {
          setState({ kind: "ready", dashboard: dashboardFromScopeKnowledgeSnapshot(result.snapshot), cached: false });
          return;
        } catch {
          setState({ kind: "unavailable", message: "学習状況を現在取得できません。" });
          return;
        }
      }
    }
    if (result.kind === "missing") {
      await useCachedSnapshot("学習状況はまだ準備されていません。");
      return;
    }
    await useCachedSnapshot();
  }, [useCachedSnapshot]);

  useEffect(() => { void loadCurrent(); }, [loadCurrent]);

  const manualSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    const keepWorkspace = (message: string) => {
      setSyncError(message);
      setState((current) => current.kind === "ready" ? current : { kind: "unavailable", message: "学習状況を現在取得できません。" });
    };
    try {
      const response = await fetch("/api/snapshots/kuzushiji/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (response.status === 401) { keepWorkspace("同期できませんでした。"); return; }
      if (response.status === 403) { keepWorkspace("この操作は同じサイトから実行してください。"); return; }
      if (!response.ok) { keepWorkspace("同期できませんでした。"); return; }
      await loadCurrent();
    } catch {
      keepWorkspace("同期できませんでした。");
    } finally {
      setSyncing(false);
    }
  }, [loadCurrent]);

  if (state.kind === "ready") {
    return <DashboardView dashboard={state.dashboard} cached={state.cached} snapshotState="ready" syncing={syncing} syncError={syncError} onSync={manualSync} />;
  }
  return <DashboardView dashboard={null} snapshotState={state.kind} syncing={syncing} syncError={syncError} onSync={manualSync} />;
}

function DashboardView({ dashboard, cached, snapshotState, syncing, syncError, onSync }: { dashboard: SnapshotDashboard | null; cached?: boolean; snapshotState: SnapshotState; syncing: boolean; syncError: string | null; onSync: () => Promise<void> }) {
  const completedLectures = dashboard?.lectures.filter((lecture) => lecture.status === "完了").length ?? 0;
  const weakCharacters = dashboard?.characters.filter((character) => character.mastery !== "即読").length ?? 0;
  const openMistakes = dashboard?.mistakes.filter((mistake) => !mistake.resolved).length ?? 0;
  const latestCompletedLecture = useMemo(() => dashboard ? [...dashboard.lectures].filter((lecture) => lecture.status === "完了").sort((a, b) => b.sequence - a.sequence || b.id.localeCompare(a.id))[0] ?? null : null, [dashboard]);
  const stale = dashboard ? Date.parse(dashboard.validUntil) <= Date.now() : false;
  const workspaceContext = getStudyProject("kuzushiji")?.context ?? "講義と文字を読む";

  return (
    <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
      <ObjectiveStateMirrorSync />
      <AppHeader context="くずし字 · 学ぶ" backHref="/projects" backLabel="学ぶ" />
      <div className="phase5-context-nav" aria-label="現在地"><Link href="/projects">学ぶ</Link><span aria-hidden="true">›</span><span>くずし字</span></div>

      <section className="phase5-page-heading phase5-workspace-overview">
        <div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">くずし字</h1><p className="phase5-context">{workspaceContext}</p></div>
      </section>

      <section className="phase5-workspace-section" aria-labelledby="kuzushiji-learning-title">
        <div className="phase5-section-heading"><h2 id="kuzushiji-learning-title">学習</h2></div>
        <div className="phase5-workspace-links">
          <Link className="phase5-workspace-entry" href="/projects/kuzushiji/lectures">
            <span className="phase5-workspace-entry-main"><strong>講義</strong><span>講義を見る</span></span>
            <span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section className="phase5-workspace-section" aria-labelledby="kuzushiji-knowledge-title">
        <div className="phase5-section-heading"><h2 id="kuzushiji-knowledge-title">知識</h2></div>
        <div className="phase5-workspace-links">
          <Link className="phase5-workspace-entry" href="/projects/kuzushiji/characters"><span className="phase5-workspace-entry-main"><strong>文字</strong><span>文字の形と読みを確認する</span></span><span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span></Link>
          <Link className="phase5-workspace-entry" href="/projects/kuzushiji/mistakes"><span className="phase5-workspace-entry-main"><strong>誤読記録</strong><span>読み違いを振り返る</span></span><span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span></Link>
          <Link className="phase5-workspace-entry" href="/projects/kuzushiji/sources"><span className="phase5-workspace-entry-main"><strong>資料</strong><span>学習に使う資料を見る</span></span><span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span></Link>
          <Link className="phase5-workspace-entry" href="/projects/kuzushiji/expressions"><span className="phase5-workspace-entry-main"><strong>頻出表現</strong><span>表現のつながりを確認する</span></span><span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span></Link>
        </div>
      </section>

      <details className="phase5-workspace-section phase5-workspace-graph">
        <summary className="phase5-workspace-graph-summary"><span className="phase5-workspace-graph-summary-main"><strong>知識のつながり</strong><small>文字・講義・資料の関係を見る</small></span><span className="phase5-workspace-graph-toggle" aria-hidden="true">＋</span></summary>
        <div className="phase5-workspace-graph-content"><p>学んだ内容の関係を、ひとつの地図として眺められます。</p><Link className="phase5-workspace-graph-link" href="/graph?project=kuzushiji"><span>つながりを見る</span><span aria-hidden="true">→</span></Link></div>
      </details>

      <details className="phase5-workspace-section phase5-workspace-secondary">
        <summary className="phase5-workspace-secondary-summary"><span><strong>学習状況</strong><small>現在位置や復習の状態を見る</small></span><span className="phase5-workspace-secondary-toggle" aria-hidden="true">＋</span></summary>
        <div className="phase5-workspace-secondary-content">
          {dashboard ? (
            <>
              <section className="phase5-focus"><p className="phase5-eyebrow">現在位置</p><h2>{latestCompletedLecture ? latestCompletedLecture.title : "講義を選ぶ"}</h2><p>{latestCompletedLecture ? "ここまでの学習を確認し、次に取り組む講義を選びます。" : "講義と文字を、自分のペースで読み進めます。"}</p><div className="phase5-focus-meta"><span>完了講義 {completedLectures}件</span><span>復習候補 {dashboard.reviewQueue.length}問</span></div><Link className="phase5-action" href="/projects/kuzushiji/lectures">講義を見る <span aria-hidden="true">→</span></Link></section>
              <section className="phase5-stat-line" aria-label="現在地"><div><strong>{completedLectures}</strong><span>完了講義</span></div><div><strong>{weakCharacters}</strong><span>要定着文字</span></div><div><strong>{openMistakes}</strong><span>未克服の誤読</span></div></section>
              <section className="phase5-section"><div className="phase5-section-heading"><h2>復習</h2><Link href="/review">復習へ</Link></div><div className="phase5-row-list"><Link className="phase5-row" href="/review"><span className="phase5-row-main"><span className="phase5-row-title">復習を確認</span><span className="phase5-row-meta">{dashboard.reviewQueue.length > 0 ? `復習候補 ${dashboard.reviewQueue.length}問` : "候補はありません"}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link></div></section>
              <div className="phase5-workspace-secondary-links"><Link href="/projects/kuzushiji/progress">学習記録</Link></div>
              <div className="phase5-sync-line"><span>最終同期 {formatDateTime(dashboard.publishedAt)}</span><button type="button" onClick={() => void onSync()} disabled={syncing}>{syncing ? "同期中…" : "同期"}</button></div>
              {cached && <p className="phase5-freshness" role="status">端末に保存された学習状況を表示しています。</p>}
              {stale && <p className="phase5-freshness" role="status">同期から時間が経っています。閲覧は続けられます。</p>}
              {syncError && <p className="phase5-freshness" role="status">{syncError}</p>}
            </>
          ) : (
            <div className="phase5-snapshot-status" role="status" aria-live="polite">
              <p>{snapshotState === "loading" ? "学習状況を読み込んでいます。" : snapshotState === "bootstrap" ? "学習状況はまだ準備されていません。" : "学習状況を現在取得できません。"}</p>
              {snapshotState === "unavailable" && <p>学習コンテンツは引き続き利用できます。</p>}
              {syncError && <p>{syncError}</p>}
              {snapshotState !== "loading" && <button type="button" onClick={() => void onSync()} disabled={syncing}>{syncing ? "同期中…" : snapshotState === "bootstrap" ? "今すぐ同期" : "学習状況を同期"}</button>}
            </div>
          )}
        </div>
      </details>

      <PrimaryNav active="learn" />
    </main>
  );
}
