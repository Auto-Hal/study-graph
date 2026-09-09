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
  assert.match(home, /scheduledReview\.persistence === "supabase"/);
  assert.match(projects, /scheduledReview\.persistence === "supabase"/);
  assert.match(reviewLanding, /scheduledReview\.persistence === "supabase"/);
  assert.match(home, /復習予定を確認できません/);
  assert.match(reviewLanding, /期限はサーバーで確認できていません/);
  assert.doesNotMatch(dashboard, /問が期限です/);
  assert.match(dashboard, /復習候補/);
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
  assert.match(graphPage, /const graphIsTrusted = graph\.mode === "notion"/);
  assert.match(graphPage, /graphIsTrusted \? \(/);
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

test("untrusted Kuzushiji readers render controlled states instead of synthetic data", () => {
  assert.match(kuzushijiSection, /const sourceIsTrusted =/);
  assert.match(kuzushijiSection, /!sourceIsTrusted \?/);
  assert.match(kuzushijiSection, /phase5-deep-unavailable/);
  assert.match(kuzushijiDetail, /const sourceIsTrusted =/);
  assert.match(kuzushijiDetail, /if \(!sourceIsTrusted\)/);
  assert.match(kuzushijiDetail, /phase5-deep-unavailable/);
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
  assert.doesNotMatch(kuzushijiSection, /\bitems\b/);
});

test("Kuzushiji detail and progress routes keep learner language and deep links", () => {
  assert.match(kuzushijiDetail, /AppHeader/);
  assert.match(kuzushijiDetail, /phase5-info-list/);
  assert.match(kuzushijiDetail, /PrimaryNav active="learn"/);
  assert.match(kuzushijiDetail, /\/graph\?node=/);
  assert.match(kuzushijiDetail, /\/projects\/kuzushiji\/progress/);
  assert.doesNotMatch(kuzushijiDetail, /learn-shell|learn-header|sync-pill/);
  assert.doesNotMatch(kuzushijiDetail, /Notion誤読回数|Notion最終復習日/);

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
