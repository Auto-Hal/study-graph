"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "./AppHeader";
import PrimaryNav from "./PrimaryNav";
import ObjectiveStateMirrorSync from "./ObjectiveStateMirrorSync";
import { cacheScopeKnowledgeSnapshot, getCachedCurrentScopeKnowledgeSnapshot } from "@/src/lib/review/offline/snapshot-cache";
import { isScopeKnowledgeSnapshotHashValidBrowser } from "@/src/lib/review/offline/snapshot-browser";
import type { ScopeKnowledgeSnapshot } from "@/src/lib/review/offline/snapshot-content";
import { dashboardFromScopeKnowledgeSnapshot, selectSnapshotForDisplay, type KuzushijiSnapshotDashboard as SnapshotDashboard } from "@/src/lib/review/snapshot-sync/dashboard";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; dashboard: SnapshotDashboard; cached: boolean }
  | { kind: "bootstrap"; message?: string }
  | { kind: "unavailable"; message: string }
  | { kind: "auth-required" };

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function asSnapshot(value: unknown): ScopeKnowledgeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = (value as { snapshot?: unknown }).snapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as ScopeKnowledgeSnapshot : null;
}

async function fetchCurrentSnapshot(): Promise<{ kind: "snapshot"; snapshot: ScopeKnowledgeSnapshot } | { kind: "auth" } | { kind: "missing" } | { kind: "failed" }> {
  try {
    const response = await fetch("/api/snapshots/kuzushiji/current", { method: "GET", credentials: "same-origin", cache: "no-store" });
    if (response.status === 401) return { kind: "auth" };
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
    setState(missingMessage ? { kind: "bootstrap", message: missingMessage } : { kind: "unavailable", message: "学習データを取得できませんでした。" });
    return false;
  }, []);

  const loadCurrent = useCallback(async () => {
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const result = await fetchCurrentSnapshot();
    if (result.kind === "auth") { setState({ kind: "auth-required" }); return; }
    if (result.kind === "snapshot") {
      try {
        const cacheResult = await cacheScopeKnowledgeSnapshot(result.snapshot);
        if (cacheResult.kind === "conflict") {
          if (await useCachedSnapshot()) return;
          setState({ kind: "unavailable", message: "同期データの整合性を確認できませんでした。" });
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
          setState({ kind: "unavailable", message: "同期データの形式を確認できませんでした。" });
          return;
        }
      }
    }
    if (result.kind === "missing") { await useCachedSnapshot("学習データがまだ同期されていません。"); return; }
    await useCachedSnapshot();
  }, [useCachedSnapshot]);

  useEffect(() => { void loadCurrent(); }, [loadCurrent]);

  const manualSync = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/snapshots/kuzushiji/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (response.status === 401) { setState({ kind: "auth-required" }); return; }
      if (response.status === 403) { setState({ kind: "unavailable", message: "この操作は同じサイトから実行してください。" }); return; }
      if (!response.ok) { setState((current) => current.kind === "ready" ? current : { kind: "unavailable", message: "同期できませんでした。" }); return; }
      await loadCurrent();
    } catch {
      setState((current) => current.kind === "ready" ? current : { kind: "unavailable", message: "同期できませんでした。" });
    } finally {
      setSyncing(false);
    }
  }, [loadCurrent]);

  if (state.kind === "loading") return <main className="phase5-shell phase5-deep-shell phase5-workspace-shell"><AppHeader context="くずし字 · 学ぶ" backHref="/projects" backLabel="学ぶ" /><section className="phase5-empty" aria-live="polite">学習データを読み込んでいます…</section><PrimaryNav active="learn" /></main>;
  if (state.kind === "auth-required") return <main className="phase5-shell phase5-deep-shell phase5-workspace-shell"><AppHeader context="くずし字 · 学ぶ" backHref="/projects" backLabel="学ぶ" /><section className="phase5-review-focus"><p className="phase5-eyebrow">ログイン</p><h1 className="phase5-page-title">ログインが必要です</h1><p className="phase5-context">学習データを表示するにはログインしてください。</p><Link className="phase5-action phase5-login-action" href="/login">ログイン</Link></section><PrimaryNav active="learn" /></main>;
  if (state.kind === "bootstrap" || state.kind === "unavailable") {
    const isBootstrap = state.kind === "bootstrap";
    return <main className="phase5-shell phase5-deep-shell phase5-workspace-shell"><AppHeader context="くずし字 · 学ぶ" backHref="/projects" backLabel="学ぶ" /><section className="phase5-page-heading phase5-workspace-overview"><div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">くずし字</h1><p className="phase5-context">{isBootstrap ? "学習データがまだ同期されていません" : state.message}</p></div></section><section className="phase5-review-focus"><h2>{isBootstrap ? "学習を始める準備をする" : "もう一度確認する"}</h2><p>通信が戻ったら、最新の学習データを同期できます。</p><button className="phase5-action" type="button" onClick={() => void manualSync()} disabled={syncing}>{syncing ? "同期中…" : isBootstrap ? "今すぐ同期" : "同期を試す"}</button></section><PrimaryNav active="learn" /></main>;
  }
  return <DashboardView dashboard={state.dashboard} cached={state.cached} syncing={syncing} onSync={manualSync} />;
}

function DashboardView({ dashboard, cached, syncing, onSync }: { dashboard: SnapshotDashboard; cached: boolean; syncing: boolean; onSync: () => Promise<void> }) {
  const completedLectures = dashboard.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = dashboard.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = dashboard.mistakes.filter((mistake) => !mistake.resolved).length;
  const latestCompletedLecture = useMemo(() => [...dashboard.lectures].filter((lecture) => lecture.status === "完了").sort((a, b) => b.sequence - a.sequence || b.id.localeCompare(a.id))[0] ?? null, [dashboard.lectures]);
  const stale = Date.parse(dashboard.validUntil) <= Date.now();
  return <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
    <ObjectiveStateMirrorSync />
    <AppHeader context="くずし字 · 学ぶ" backHref="/projects" backLabel="学ぶ" />
    <div className="phase5-context-nav" aria-label="現在地"><Link href="/projects">学ぶ</Link><span aria-hidden="true">›</span><span>くずし字</span></div>
    <section className="phase5-page-heading phase5-workspace-overview"><div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">くずし字</h1><p className="phase5-context">{completedLectures > 0 ? `完了講義 ${completedLectures}件` : "講義を確認して始める"}</p></div><span className="phase5-row-status">{cached ? "端末の保存" : "同期済み"}</span></section>
    <section className="phase5-focus"><p className="phase5-eyebrow">現在位置</p><h2>{latestCompletedLecture ? latestCompletedLecture.title : "講義を選ぶ"}</h2><p>{latestCompletedLecture ? "ここまでの学習を確認し、次に取り組む講義を選びます。" : "講義と文字を、自分のペースで読み進めます。"}</p><div className="phase5-focus-meta"><span>完了講義 {completedLectures}件</span><span>復習候補 {dashboard.reviewQueue.length}問</span></div><Link className="phase5-action" href="/projects/kuzushiji/lectures">講義を見る <span aria-hidden="true">→</span></Link></section>
    <section className="phase5-stat-line" aria-label="現在地"><div><strong>{completedLectures}</strong><span>完了講義</span></div><div><strong>{weakCharacters}</strong><span>要定着文字</span></div><div><strong>{openMistakes}</strong><span>未克服の誤読</span></div></section>
    <section className="phase5-section"><div className="phase5-section-heading"><h2>講義</h2><Link href="/projects/kuzushiji/lectures">一覧を見る</Link></div><div className="phase5-row-list">{dashboard.lectures.slice(0, 5).map((lecture) => <Link className="phase5-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}><span className="phase5-row-main"><span className="phase5-row-title">{lecture.title}</span><span className="phase5-row-meta">{lecture.theme || "学習テーマ未設定"}</span></span><span className="phase5-row-status">{lecture.status || ""}</span></Link>)}</div></section>
    <section className="phase5-section"><div className="phase5-section-heading"><h2>復習</h2><Link href="/review">復習へ</Link></div><div className="phase5-row-list"><Link className="phase5-row" href="/review"><span className="phase5-row-main"><span className="phase5-row-title">復習を確認</span><span className="phase5-row-meta">{dashboard.reviewQueue.length > 0 ? `復習候補 ${dashboard.reviewQueue.length}問` : "候補はありません"}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link></div></section>
    <section className="phase5-section phase5-workspace-section" aria-labelledby="kuzushiji-knowledge-title"><div className="phase5-section-heading"><h2 id="kuzushiji-knowledge-title">知識</h2></div><div className="phase5-row-list"><Link className="phase5-row" href="/projects/kuzushiji/characters"><span className="phase5-row-main"><span className="phase5-row-title">文字</span><span className="phase5-row-meta">文字の形と読みを確認する</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link><Link className="phase5-row" href="/projects/kuzushiji/mistakes"><span className="phase5-row-main"><span className="phase5-row-title">誤読記録</span><span className="phase5-row-meta">読み違いを振り返る</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link><Link className="phase5-row" href="/projects/kuzushiji/sources"><span className="phase5-row-main"><span className="phase5-row-title">資料</span><span className="phase5-row-meta">学習に使う資料を見る</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link><Link className="phase5-row" href="/projects/kuzushiji/expressions"><span className="phase5-row-main"><span className="phase5-row-title">頻出表現</span><span className="phase5-row-meta">表現のつながりを確認する</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link></div></section>
    <div className="phase5-workspace-secondary-links"><Link href="/projects/kuzushiji/progress">学習記録</Link></div>
    <details className="phase5-workspace-section phase5-workspace-graph">
      <summary className="phase5-workspace-graph-summary"><span className="phase5-workspace-graph-summary-main"><strong>知識のつながり</strong><small>文字・講義・資料の関係を見る</small></span><span className="phase5-workspace-graph-toggle" aria-hidden="true">＋</span></summary>
      <div className="phase5-workspace-graph-content"><p>学んだ内容の関係を、ひとつの地図として眺められます。</p><Link className="phase5-workspace-graph-link" href="/graph?project=kuzushiji"><span>つながりを見る</span><span aria-hidden="true">→</span></Link></div>
    </details>
    <div className="phase5-sync-line"><span>最終同期 {formatDateTime(dashboard.publishedAt)}</span><button type="button" onClick={() => void onSync()} disabled={syncing}>{syncing ? "同期中…" : "同期"}</button></div>{stale && <p className="phase5-freshness" role="status">同期から時間が経っています。閲覧は続けられます。</p>}
    <PrimaryNav active="learn" />
  </main>;
}
