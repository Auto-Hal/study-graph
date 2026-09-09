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

  if (state.kind === "loading") return <main className="phase5-shell"><AppHeader context="くずし字" /><section className="phase5-empty" aria-live="polite">学習データを読み込んでいます…</section><PrimaryNav active="learn" /></main>;
  if (state.kind === "auth-required") return <main className="phase5-shell"><AppHeader context="くずし字" /><section className="phase5-review-focus"><p className="phase5-eyebrow">ログイン</p><h1 className="phase5-page-title">ログインが必要です</h1><p className="phase5-context">学習データを表示するにはログインしてください。</p><Link className="phase5-action phase5-login-action" href="/login">ログイン</Link></section><PrimaryNav active="learn" /></main>;
  if (state.kind === "bootstrap" || state.kind === "unavailable") {
    const isBootstrap = state.kind === "bootstrap";
    return <main className="phase5-shell"><AppHeader context="くずし字" /><section className="phase5-page-heading"><div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">くずし字</h1><p className="phase5-context">{isBootstrap ? "学習データがまだ同期されていません" : state.message}</p></div></section><section className="phase5-review-focus"><h2>{isBootstrap ? "学習を始める準備をする" : "もう一度確認する"}</h2><p>通信が戻ったら、最新の学習データを同期できます。</p><button className="phase5-action" type="button" onClick={() => void manualSync()} disabled={syncing}>{syncing ? "同期中…" : isBootstrap ? "今すぐ同期" : "同期を試す"}</button></section><PrimaryNav active="learn" /></main>;
  }
  return <DashboardView dashboard={state.dashboard} cached={state.cached} syncing={syncing} onSync={manualSync} />;
}

function DashboardView({ dashboard, cached, syncing, onSync }: { dashboard: SnapshotDashboard; cached: boolean; syncing: boolean; onSync: () => Promise<void> }) {
  const completedLectures = dashboard.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = dashboard.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = dashboard.mistakes.filter((mistake) => !mistake.resolved).length;
  const latestLecture = useMemo(() => [...dashboard.lectures].sort((a, b) => b.sequence - a.sequence || b.id.localeCompare(a.id))[0], [dashboard.lectures]);
  const stale = Date.parse(dashboard.validUntil) <= Date.now();
  return <main className="phase5-shell">
    <ObjectiveStateMirrorSync />
    <AppHeader context="くずし字" />
    <section className="phase5-page-heading"><div><p className="phase5-eyebrow">学習</p><h1 className="phase5-page-title">くずし字</h1><p className="phase5-context">{completedLectures > 0 ? `第${completedLectures}回まで完了` : "最初の講義から始める"}</p></div><span className="phase5-row-status">{cached ? "端末の保存" : "同期済み"}</span></section>
    <section className="phase5-focus"><p className="phase5-eyebrow">次の学習</p><h2>{latestLecture ? latestLecture.title : "講義を選ぶ"}</h2><p>{latestLecture?.theme || "講義と文字を、自分のペースで読み進めます。"}</p><div className="phase5-focus-meta"><span>{latestLecture ? `第${latestLecture.sequence}回` : "くずし字"}</span>{latestLecture?.status && <span>{latestLecture.status}</span>}</div>{latestLecture && <Link className="phase5-action" href={`/projects/kuzushiji/lectures/${latestLecture.id}`}>学習を続ける <span aria-hidden="true">→</span></Link>}</section>
    <section className="phase5-stat-line" aria-label="現在地"><div><strong>{completedLectures}</strong><span>完了講義</span></div><div><strong>{weakCharacters}</strong><span>要定着文字</span></div><div><strong>{openMistakes}</strong><span>未克服の誤読</span></div></section>
    <section className="phase5-section"><div className="phase5-section-heading"><h2>講義</h2><Link href="/projects/kuzushiji/lectures">一覧を見る</Link></div><div className="phase5-row-list">{dashboard.lectures.slice(0, 5).map((lecture) => <Link className="phase5-row" href={`/projects/kuzushiji/lectures/${lecture.id}`} key={lecture.id}><span className="phase5-row-main"><span className="phase5-row-title">{lecture.title}</span><span className="phase5-row-meta">{lecture.theme || "学習テーマ未設定"}</span></span><span className="phase5-row-status">{lecture.status || ""}</span></Link>)}</div></section>
    <section className="phase5-section"><div className="phase5-section-heading"><h2>復習</h2><Link href="/review">復習へ</Link></div><div className="phase5-row-list"><Link className="phase5-row" href="/review"><span className="phase5-row-main"><span className="phase5-row-title">今日の復習</span><span className="phase5-row-meta">{dashboard.reviewQueue.length > 0 ? `${dashboard.reviewQueue.length}問が期限です` : "今のところ予定はありません"}</span></span><span className="phase5-row-arrow" aria-hidden="true">→</span></Link></div></section>
    <div className="phase5-link-strip"><Link href="/graph?project=kuzushiji">知識のつながり</Link><Link href="/projects/kuzushiji/progress">学習記録</Link><Link href="/projects/kuzushiji/characters">文字を見る</Link></div>
    <div className="phase5-sync-line"><span>最終同期 {formatDateTime(dashboard.publishedAt)}</span><button type="button" onClick={() => void onSync()} disabled={syncing}>{syncing ? "同期中…" : "同期"}</button></div>{stale && <p className="phase5-freshness" role="status">同期から時間が経っています。閲覧は続けられます。</p>}
    <PrimaryNav active="learn" />
  </main>;
}
