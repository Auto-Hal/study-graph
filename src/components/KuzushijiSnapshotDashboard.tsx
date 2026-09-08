"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrimaryNav from "./PrimaryNav";
import OfflinePrefetchControl from "./OfflinePrefetchControl";
import PilotBlockedAttemptDiagnostics from "./PilotBlockedAttemptDiagnostics";
import ObjectiveStateMirrorSync from "./ObjectiveStateMirrorSync";
import {
  cacheScopeKnowledgeSnapshot,
  getCachedCurrentScopeKnowledgeSnapshot,
} from "@/src/lib/review/offline/snapshot-cache";
import {
  isScopeKnowledgeSnapshotHashValidBrowser,
} from "@/src/lib/review/offline/snapshot-browser";
import type { ScopeKnowledgeSnapshot } from "@/src/lib/review/offline/snapshot-content";
import {
  dashboardFromScopeKnowledgeSnapshot,
  selectSnapshotForDisplay,
  type KuzushijiSnapshotDashboard as SnapshotDashboard,
} from "@/src/lib/review/snapshot-sync/dashboard";

type PageState =
  | { kind: "loading" }
  | { kind: "ready"; dashboard: SnapshotDashboard; cached: boolean }
  | { kind: "bootstrap"; message?: string }
  | { kind: "unavailable"; message: string }
  | { kind: "auth-required" };

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

function asSnapshot(value: unknown): ScopeKnowledgeSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = (value as { snapshot?: unknown }).snapshot;
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as ScopeKnowledgeSnapshot
    : null;
}

async function fetchCurrentSnapshot(): Promise<
  | { kind: "snapshot"; snapshot: ScopeKnowledgeSnapshot }
  | { kind: "auth" }
  | { kind: "missing" }
  | { kind: "failed" }
> {
  try {
    const response = await fetch("/api/snapshots/kuzushiji/current", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
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
      // An unavailable IndexedDB is equivalent to having no local replica.
    }
    setState(missingMessage ? { kind: "bootstrap", message: missingMessage } : { kind: "unavailable", message: "学習データを取得できませんでした。" });
    return false;
  }, []);

  const loadCurrent = useCallback(async () => {
    setState((current) => current.kind === "ready" ? current : { kind: "loading" });
    const result = await fetchCurrentSnapshot();
    if (result.kind === "auth") {
      setState({ kind: "auth-required" });
      return;
    }
    if (result.kind === "snapshot") {
      try {
        const cacheResult = await cacheScopeKnowledgeSnapshot(result.snapshot);
        if (cacheResult.kind === "conflict") {
          // A same-generation/different-hash candidate is ambiguous. Keep a
          // previously verified local snapshot instead of replacing it.
          if (await useCachedSnapshot()) return;
          setState({ kind: "unavailable", message: "同期データの整合性を確認できませんでした。" });
          return;
        }
        if (cacheResult.kind === "rejected") throw new Error("snapshot cache rejected candidate");
        const cached = await getCachedCurrentScopeKnowledgeSnapshot("kuzushiji").catch(() => null);
        const displayed = selectSnapshotForDisplay(result.snapshot, cached);
        setState({
          kind: "ready",
          dashboard: dashboardFromScopeKnowledgeSnapshot(displayed.snapshot),
          cached: displayed.source === "cache",
        });
        return;
      } catch {
        // A cache failure must not hide a valid server snapshot.
        try {
          setState({ kind: "ready", dashboard: dashboardFromScopeKnowledgeSnapshot(result.snapshot), cached: false });
          return;
        } catch {
          setState({ kind: "unavailable", message: "同期データの形式を確認できませんでした。" });
          return;
        }
      }
    }
    if (result.kind === "missing") {
      await useCachedSnapshot("学習データがまだ同期されていません。");
      return;
    }
    await useCachedSnapshot();
  }, [useCachedSnapshot]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const manualSync = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/snapshots/kuzushiji/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 401) {
        setState({ kind: "auth-required" });
        return;
      }
      if (response.status === 403) {
        setState({ kind: "unavailable", message: "この操作は同じサイトから実行してください。" });
        return;
      }
      if (!response.ok) {
        setState((current) => current.kind === "ready" ? current : { kind: "unavailable", message: "同期できませんでした。" });
        return;
      }
      await loadCurrent();
    } catch {
      // A network rejection must not escape the click handler. Preserve a
      // usable snapshot and expose a controlled unavailable state otherwise.
      setState((current) => current.kind === "ready"
        ? current
        : { kind: "unavailable", message: "同期できませんでした。" });
    } finally {
      setSyncing(false);
    }
  }, [loadCurrent]);

  if (state.kind === "loading") {
    return <main className="learn-shell"><section className="learn-panel snapshot-loading" aria-live="polite">学習データを読み込んでいます…</section><PrimaryNav active="learn" /></main>;
  }

  if (state.kind === "auth-required") {
    return (
      <main className="learn-shell">
        <section className="learn-panel snapshot-bootstrap" role="status">
          <p className="eyebrow">AUTHORIZATION REQUIRED</p>
          <h1>ログインが必要です。</h1>
          <p>学習データを表示するにはStudy Graphへログインしてください。</p>
          <Link className="quick-action" href="/login">ログイン</Link>
        </section>
        <PrimaryNav active="learn" />
      </main>
    );
  }

  if (state.kind === "bootstrap" || state.kind === "unavailable") {
    const isBootstrap = state.kind === "bootstrap";
    return (
      <main className="learn-shell">
        <header className="learn-header">
          <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>くずし字</small></span></Link>
          <div className="sync-pill demo"><span className="dot" />Snapshot 未同期</div>
        </header>
        <nav className="breadcrumbs" aria-label="パンくずリスト"><Link href="/projects">Projects</Link><span>くずし字</span></nav>
        <section className="learn-panel snapshot-bootstrap" role="status">
          <p className="eyebrow">KUZUSHIJI SNAPSHOT</p>
          <h1>{isBootstrap ? "学習データがまだ同期されていません" : "学習データを表示できません"}</h1>
          <p>{state.message ?? "通信が戻ってから、もう一度同期してください。"}</p>
          <button className="quick-action snapshot-sync-button" type="button" onClick={() => void manualSync()} disabled={syncing}>{syncing ? "同期中…" : isBootstrap ? "今すぐ同期" : "同期を試す"}</button>
        </section>
        <PrimaryNav active="learn" />
      </main>
    );
  }

  return <DashboardView dashboard={state.dashboard} cached={state.cached} syncing={syncing} onSync={manualSync} />;
}

function DashboardView({ dashboard, cached, syncing, onSync }: { dashboard: SnapshotDashboard; cached: boolean; syncing: boolean; onSync: () => Promise<void> }) {
  const completedLectures = dashboard.lectures.filter((lecture) => lecture.status === "完了").length;
  const weakCharacters = dashboard.characters.filter((character) => character.mastery !== "即読").length;
  const openMistakes = dashboard.mistakes.filter((mistake) => !mistake.resolved).length;
  const latestLecture = useMemo(() => [...dashboard.lectures].sort((a, b) => b.sequence - a.sequence || b.id.localeCompare(a.id))[0], [dashboard.lectures]);
  const stale = Date.parse(dashboard.validUntil) <= Date.now();

  return (
    <main className="learn-shell">
      <ObjectiveStateMirrorSync />
      <header className="learn-header">
        <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>くずし字</small></span></Link>
        <div className={`sync-pill ${cached ? "demo" : "online"}`}><span className="dot" />{cached ? "Snapshot cache" : "Snapshot"}</div>
      </header>
      <nav className="breadcrumbs" aria-label="パンくずリスト"><Link href="/projects">Projects</Link><span>くずし字</span></nav>

      <section className="learn-hero">
        <p className="eyebrow">KUZUSHIJI</p>
        <h1>実物資料を、その場で読めるようになる。</h1>
        <p className="learn-hero-copy">講義で得た読み方、覚えるべき文字、実際に起こした誤読を一つの学習面にまとめます。表示はサーバーで同期したSnapshotです。</p>
        <div className="snapshot-status-row"><span>最終同期 {formatDateTime(dashboard.publishedAt)}</span><button className="snapshot-sync-link" type="button" onClick={() => void onSync()} disabled={syncing}>{syncing ? "同期中…" : "同期"}</button></div>
        {stale && <p className="snapshot-freshness" role="status">同期から時間が経っています。閲覧は続けられます。</p>}
      </section>

      <section className="entity-type-grid" aria-label="くずし字エンティティ">
        <Link className="entity-type-card" href="/projects/kuzushiji/lectures"><p className="eyebrow">LECTURES</p><h2>講義</h2><p>実施済み・学習中の講義と、そのテーマや成績を確認。</p><span className="entity-count">{dashboard.lectures.length}</span><span className="entity-link-label">一覧を見る →</span></Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/characters"><p className="eyebrow">CHARACTERS</p><h2>文字</h2><p>読み・字母・習得状態・重要度・誤読回数を確認。</p><span className="entity-count">{dashboard.characters.length}</span><span className="entity-link-label">一覧を見る →</span></Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/mistakes"><p className="eyebrow">MISTAKES</p><h2>誤読記録</h2><p>誤った判断、正解、原因、克服状況を振り返る。</p><span className="entity-count">{dashboard.mistakes.length}</span><span className="entity-link-label">一覧を見る →</span></Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/sources"><p className="eyebrow">SOURCES</p><h2>資料</h2><p>講義で使った原資料・教材、難易度や所蔵情報を確認。</p><span className="entity-count">—</span><span className="entity-link-label">一覧を見る →</span></Link>
        <Link className="entity-type-card" href="/projects/kuzushiji/expressions"><p className="eyebrow">EXPRESSIONS</p><h2>頻出表現</h2><p>読み・意味・用例と、候文などの重要表現を確認。</p><span className="entity-count">—</span><span className="entity-link-label">一覧を見る →</span></Link>
        <Link className="entity-type-card graph-entry-card" href="/graph"><p className="eyebrow">KNOWLEDGE GRAPH</p><h2>関係を見る</h2><p>講義・文字・誤読・資料・表現をRelationで横断する。</p><span className="entity-count">↗</span><span className="entity-link-label">Graphを開く →</span></Link>
      </section>

      <section className="project-overview-grid">
        <article className="learn-panel"><div className="learn-panel-header"><h2>現在地</h2><span>Snapshot</span></div><div className="learn-stats"><div><strong>{completedLectures}</strong><span>完了講義</span></div><div><strong>{weakCharacters}</strong><span>要定着文字</span></div><div><strong>{openMistakes}</strong><span>未克服誤読</span></div></div>{latestLecture ? <div className="entity-list"><Link className="entity-row" href={`/projects/kuzushiji/lectures/${latestLecture.id}`}><span className="entity-row-leading">{String(latestLecture.sequence).padStart(2, "0")}</span><div><strong>{latestLecture.title}</strong><p>{latestLecture.theme || "学習テーマ未設定"}</p></div><span className="entity-row-status">{latestLecture.status || "未設定"}</span></Link></div> : <p className="empty empty-panel">講義がまだ登録されていません。</p>}</article>
        <aside className="learn-panel"><div className="learn-panel-header"><h2>復習候補</h2><span>{dashboard.reviewQueue.length}問</span></div>{dashboard.reviewQueue.length > 0 ? <Link className="quick-action" href="/review">復習を開始する</Link> : <Link className="quick-action is-muted" href="/projects/kuzushiji/progress">次の復習予定を見る</Link>}<OfflinePrefetchControl /><PilotBlockedAttemptDiagnostics /><Link className="progress-link-card" href="/projects/kuzushiji/progress"><strong>学習記録を見る →</strong><span>保存済みのSRS履歴はProgressで確認</span></Link></aside>
      </section>
      <PrimaryNav active="learn" />
    </main>
  );
}
