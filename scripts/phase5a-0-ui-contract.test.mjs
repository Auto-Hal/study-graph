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
