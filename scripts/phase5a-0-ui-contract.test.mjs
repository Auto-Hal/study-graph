import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const nav = read("src/components/PrimaryNav.tsx");
const home = read("app/page.tsx");
const projects = read("app/projects/page.tsx");
const reviewLanding = read("app/review/page.tsx");
const reviewSession = read("app/review/session/page.tsx");
const dashboard = read("src/components/KuzushijiSnapshotDashboard.tsx");
const offline = read("app/review/offline/page.tsx");
const settings = read("app/settings/advanced/diagnostics/page.tsx");
const layout = read("app/layout.tsx");
const phase5SessionCss = read("app/phase5-review-session.css");
const docs = read("docs/PHASE_5A_0_PRODUCT_UX.md");
const graphPage = read("app/graph/page.tsx");
const kuzushijiSection = read("app/projects/kuzushiji/[section]/page.tsx");
const kuzushijiDetail = read("app/projects/kuzushiji/[section]/[id]/page.tsx");
const kuzushijiProgress = read("app/projects/kuzushiji/progress/page.tsx");
const deepRouteCss = read("app/phase5.css");

test("primary navigation exposes exactly 今日, 学ぶ, 復習", () => {
  assert.match(nav, /href="\/"/);
  assert.match(nav, />今日\s*$/m);
  assert.match(nav, /href="\/projects"/);
  assert.match(nav, />学ぶ\s*$/m);
  assert.match(nav, /href="\/review"/);
  assert.match(nav, />復習\s*$/m);
  assert.doesNotMatch(nav, /href="\/graph"/);
  assert.doesNotMatch(nav, /href="\/settings"/);
});

test("review landing and focused session are separate routes", () => {
  assert.doesNotMatch(reviewLanding, /import ReviewSession/);
  assert.match(reviewLanding, /復習/);
  assert.match(reviewLanding, /review\/session\?project=/);
  assert.match(reviewSession, /import ReviewSession/);
  assert.match(reviewSession, /loadReviewProject/);
});

test("due language is shown only from authoritative Supabase schedule state", () => {
  assert.match(home, /scheduleState\.persistence === "supabase"/);
  assert.match(reviewLanding, /scheduleState\.persistence === "supabase"/);
  assert.match(home, /filterDueReviewItems/);
  assert.match(reviewLanding, /filterDueReviewItems/);
  assert.match(home, /復習予定を確認できません/);
  assert.match(reviewLanding, /期限はサーバーで確認できていません/);
  assert.doesNotMatch(dashboard, /問が期限です/);
  assert.match(dashboard, /復習候補/);
});

test("Kuzushiji workspace remains usable while snapshot status is secondary", () => {
  assert.match(dashboard, /phase5-workspace-overview/);
  assert.match(dashboard, /phase5-workspace-secondary/);
  for (const href of [
    "/projects/kuzushiji/lectures",
    "/projects/kuzushiji/characters",
    "/projects/kuzushiji/mistakes",
    "/projects/kuzushiji/sources",
    "/projects/kuzushiji/expressions",
  ]) {
    assert.match(dashboard, new RegExp(`href="${href.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}"`));
  }
  assert.match(dashboard, /PrimaryNav active="learn"/);
  assert.match(dashboard, /学習状況を読み込んでいます/);
  assert.match(dashboard, /学習状況はまだ準備されていません/);
  assert.match(dashboard, /学習状況を現在取得できません/);
  assert.match(dashboard, /学習コンテンツは引き続き利用できます/);
  assert.doesNotMatch(dashboard, /もう一度確認する/);
  assert.doesNotMatch(dashboard, /phase5-review-focus/);

  const dashboardView = dashboard.slice(dashboard.indexOf("function DashboardView"));
  const secondaryIndex = dashboardView.indexOf('<details className="phase5-workspace-section phase5-workspace-secondary"');
  const primaryMarkup = dashboardView.slice(dashboardView.indexOf("return ("), secondaryIndex);
  assert.match(primaryMarkup, /phase5-workspace-overview/);
  assert.match(primaryMarkup, /kuzushiji-learning-title/);
  assert.match(primaryMarkup, /kuzushiji-knowledge-title/);
  assert.match(primaryMarkup, /phase5-workspace-graph/);
  assert.doesNotMatch(primaryMarkup, /完了講義|復習候補|最終同期|端末に保存/);
});

test("Objective mirror reconciliation is independent of snapshot readiness", () => {
  const dashboardView = dashboard.slice(dashboard.indexOf("function DashboardView"));
  const mirrorMount = dashboardView.indexOf("<ObjectiveStateMirrorSync />");
  const shellStart = dashboardView.indexOf("return (");
  assert.ok(mirrorMount > shellStart, "Objective mirror should mount inside the shared workspace shell");
  assert.doesNotMatch(dashboardView.slice(Math.max(0, mirrorMount - 80), mirrorMount), /dashboard\s*&&|snapshotState/);
});

test("Learn project rows keep a shared structure without Kuzushiji-only state", () => {
  assert.match(projects, /studyProjects\.map/);
  assert.match(projects, /phase5-project-mark/);
  assert.match(projects, /phase5-project-title/);
  assert.match(projects, /phase5-project-goal.*project\.context/);
  assert.match(projects, /phase5-project-arrow/);
  assert.doesNotMatch(projects, /getKuzushijiDashboard|getDueReviewItems|completedLectures|reviewCount|kuzushijiMeta/);
});

test("learning position does not infer lecture sequence from completion count", () => {
  assert.doesNotMatch(home, /第\$\{completedLectures\}回まで完了/);
  assert.doesNotMatch(projects, /第\$\{completedLectures\}回まで完了/);
  assert.doesNotMatch(dashboard, /第\$\{completedLectures\}回まで完了/);
  assert.match(dashboard, /latestCompletedLecture/);
  assert.match(dashboard, /講義を見る/);
});

test("operational controls are removed from the normal project detail surface", () => {
  assert.doesNotMatch(dashboard, /OfflinePrefetchControl/);
  assert.doesNotMatch(dashboard, /PilotBlockedAttemptDiagnostics/);
  assert.match(dashboard, /知識のつながり/);
  assert.match(dashboard, /学習記録/);
  assert.match(offline, /OfflinePrefetchControl/);
});

test("blocked diagnostics remains explicitly reachable and read-only by default", () => {
  assert.match(settings, /PilotBlockedAttemptDiagnostics/);
  assert.match(settings, /settings\/advanced/);
  const diagnostics = read("src/components/PilotBlockedAttemptDiagnostics.tsx");
  assert.match(diagnostics, /listOfflineAttempts/);
  assert.match(diagnostics, /recoverBlockedPilotAttemptExplicitly/);
});

test("focused review session inherits Phase 5 visual tokens", () => {
  assert.match(layout, /phase5-review-session\.css/);
  assert.match(phase5SessionCss, /--accent:\s*var\(--p5-accent\)/);
  assert.match(phase5SessionCss, /\.phase5-shell h1,[\s\S]*\.phase5-session-shell h2/);
  assert.match(phase5SessionCss, /\.phase5-session-shell \.answer-panel/);
  assert.match(phase5SessionCss, /\.phase5-session-shell \.choice-list label\.selected/);
});

test("Phase 5A-0 documents preserved boundaries and deferred gateway work", () => {
  assert.match(docs, /Notion read-only/);
  assert.match(docs, /Supabase as\n?the authority/);
  assert.match(docs, /GPT Content Gateway/);
  assert.match(docs, /Consolidation Set/);
});

test("Graph uses the Phase 5 learner shell while preserving graph state links", () => {
  assert.match(graphPage, /AppHeader/);
  assert.match(graphPage, /phase5-graph-shell/);
  assert.match(graphPage, /PrimaryNav active="learn"/);
  assert.match(graphPage, /loadProjectReadState/);
  assert.match(graphPage, /projectReadStateToGraph/);
  assert.match(graphPage, /graphIsAvailable/);
  assert.match(graphPage, /project\.id === "kuzushiji"/);
  assert.match(graphPage, /phase5-deep-unavailable/);
  assert.match(graphPage, /\/graph\?project=/);
  assert.match(graphPage, /initialNodeId/);
  assert.match(graphPage, /initialRelation/);
  for (const technicalCopy of [
    "PHASE 2.5",
    "KNOWLEDGE GRAPH · PHASE 2.5",
    "Notion Relations 接続中",
    "ADAPTER ARCHITECTURE",
    "NODES",
    "NODE TYPES",
  ]) {
    assert.doesNotMatch(graphPage, new RegExp(technicalCopy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Kuzushiji learner routes use the verified v2 snapshot runtime", () => {
  assert.match(kuzushijiSection, /loadProjectReadState\("kuzushiji"\)/);
  assert.match(kuzushijiSection, /isKuzushijiV2ProjectReadState/);
  assert.match(kuzushijiSection, /phase5-deep-unavailable/);
  assert.match(kuzushijiDetail, /loadProjectReadState\("kuzushiji"\)/);
  assert.match(kuzushijiDetail, /isKuzushijiV2ProjectReadState/);
  assert.match(kuzushijiDetail, /phase5-deep-unavailable/);
  assert.doesNotMatch(kuzushijiSection, /getKuzushijiDashboard|getKuzushijiReferenceData/);
  assert.doesNotMatch(kuzushijiDetail, /getKuzushijiDashboard|getKuzushijiReferenceData/);
});

test("Kuzushiji section routes use compact editorial rows", () => {
  assert.match(kuzushijiSection, /AppHeader/);
  assert.match(kuzushijiSection, /phase5-deep-row/);
  assert.match(kuzushijiSection, /PrimaryNav active="learn"/);
  assert.match(kuzushijiSection, /\/projects\/kuzushiji\/lectures\//);
  assert.match(kuzushijiSection, /\/projects\/kuzushiji\/characters\//);
  assert.match(kuzushijiSection, /\/projects\/kuzushiji\/mistakes\//);
  assert.doesNotMatch(kuzushijiSection, /learn-shell|learn-header|sync-pill/);
  assert.doesNotMatch(kuzushijiSection, /LECTURES|CHARACTERS|MISTAKES|SOURCES|EXPRESSIONS/);
  assert.match(kuzushijiSection, /projection\.(lectures|characters|mistakes|sources|expressions)/);
});

test("Kuzushiji detail and progress routes keep learner language and deep links", () => {
  assert.match(kuzushijiDetail, /AppHeader/);
  assert.match(kuzushijiDetail, /phase5-info-list/);
  assert.match(kuzushijiDetail, /PrimaryNav active="learn"/);
  assert.match(kuzushijiDetail, /\/graph\?project=kuzushiji&node=/);
  assert.match(kuzushijiDetail, /\/projects\/kuzushiji\/progress/);
  assert.doesNotMatch(kuzushijiDetail, /learn-shell|learn-header|sync-pill/);
  assert.doesNotMatch(kuzushijiDetail, /Notion誤読回数|Notion最終復習日/);
  assert.match(kuzushijiDetail, /これまでの復習/);
  assert.match(kuzushijiDetail, /過去の最終評価/);
  assert.match(kuzushijiDetail, /過去の反復回数/);
  assert.match(kuzushijiDetail, /過去の最終復習/);
  assert.match(kuzushijiDetail, /当時の次回予定/);
  assert.match(kuzushijiDetail, /過去の復習記録/);
  assert.doesNotMatch(kuzushijiDetail, /Study Graph 最終評価/);
  assert.doesNotMatch(kuzushijiDetail, /<Property label="最終復習"/);
  assert.doesNotMatch(kuzushijiDetail, /<Property label="次回復習"/);
  assert.doesNotMatch(kuzushijiDetail, />次回 \{formatDate\(attempt\.due_at\)\}</);

  assert.match(kuzushijiProgress, /AppHeader/);
  assert.match(kuzushijiProgress, /学習記録/);
  assert.match(kuzushijiProgress, /PrimaryNav active="learn"/);
  assert.match(kuzushijiProgress, /\/review\/session\?project=kuzushiji/);
  assert.match(kuzushijiProgress, /objectiveDueNow && \(/);
  assert.doesNotMatch(kuzushijiProgress, /\{objectiveState && \(\s*<Link className="phase5-action"/);
  for (const internalLabel of [
    "LEGACY ATTEMPTS",
    "LEGACY CONFIDENT",
    "OBJECTIVE STATE",
    "state revision",
    "epoch 1",
    "Objective SRS 接続中",
  ]) {
    assert.doesNotMatch(kuzushijiProgress, new RegExp(internalLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(kuzushijiProgress, /learn-shell|learn-header|sync-pill/);
});

test("deep Graph interactions use local Phase 5 focus and hover tokens", () => {
  assert.match(deepRouteCss, /\.phase5-graph-shell \.graph-canvas-scroll:focus-visible/);
  assert.match(deepRouteCss, /\.phase5-graph-shell \.graph-node:focus-visible rect,[\s\S]*\.phase5-graph-shell \.graph-node:hover rect \{ stroke: var\(--p5-accent\)/);
  assert.match(deepRouteCss, /\.phase5-graph-shell \.graph-node\[class\*="kind-"\] rect \{ fill: var\(--p5-surface\); stroke: #cbd4e2; \}/);
  assert.match(deepRouteCss, /\.phase5-graph-shell \.graph-connected-list button:hover \{ color: var\(--p5-accent\); \}/);
});
