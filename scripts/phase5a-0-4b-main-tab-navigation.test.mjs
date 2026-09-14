import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const home = read("app/page.tsx");
const review = read("app/review/page.tsx");
const schedule = read("src/lib/supabase/review.ts");
const registry = read("src/lib/review/registry.ts");
const projects = read("app/projects/page.tsx");
const primaryNav = read("src/components/PrimaryNav.tsx");
const header = read("src/components/AppHeader.tsx");
const refresh = read("src/components/ProjectSnapshotRefresh.tsx");
const css = read("app/phase5.css");
const loading = `${read("app/projects/loading.tsx")}\n${read("app/review/loading.tsx")}\n${read("src/components/Phase5DestinationLoading.tsx")}`;

test("Home and Review landing are snapshot-first and never call live Notion", () => {
  for (const page of [home, review]) {
    assert.doesNotMatch(page, /getKuzushijiDashboard/);
    assert.match(page, /loadProjectReadState\("kuzushiji"\)/);
    assert.match(page, /isKuzushijiV2ProjectReadState/);
    assert.match(page, /ProjectSnapshotRefreshCoordinator projectId="kuzushiji"/);
    assert.match(page, /Promise\.all/);
  }
  assert.match(home, /projection(?:\?\.)?lectures/);
  assert.match(home, /projection(?:\?\.)?characters/);
  assert.match(home, /projection(?:\?\.)?mistakes/);
  assert.match(home, /projection\.reviewQueue/);
  assert.match(review, /projection\.reviewQueue/);
});

test("snapshot candidates remain separate from authoritative due schedule", () => {
  assert.match(schedule, /export type ReviewScheduleState/);
  assert.match(schedule, /export async function loadReviewScheduleState/);
  assert.match(schedule, /export function filterDueReviewItems/);
  assert.match(review, /filterDueReviewItems\(candidates, scheduleState\)/);
  assert.match(home, /filterDueReviewItems\(projection\.reviewQueue, scheduleState\)/);
  assert.match(review, /count = scheduleAvailable \? dueItems\.length : null/);
  assert.match(review, /count \?\? "—"/);
  assert.doesNotMatch(review, /reviewQueue\.length/);
  assert.match(schedule, /getDueReviewItems/);
  assert.match(schedule, /loadReviewScheduleState\(\)/);
});

test("stale and unavailable states remain learner-safe", () => {
  assert.match(home, /displayState\?\.kind === "stale"/);
  assert.match(review, /displayState\?\.kind === "stale"/);
  assert.match(home, /学習データは現在表示できません/);
  assert.match(review, /復習候補を取得できません/);
  assert.match(home, /復習予定を確認できません/);
  assert.match(review, /復習予定を確認できません/);
  assert.doesNotMatch(home, /getKuzushijiDashboard|data\.mode/);
  assert.doesNotMatch(review, /getKuzushijiDashboard|data\.mode/);
});

test("Review session keeps live Notion and fresh Scope authority", () => {
  assert.match(registry, /getKuzushijiDashboard/);
  assert.match(registry, /buildKuzushijiScopeSnapshot/);
  assert.doesNotMatch(registry, /loadProjectReadState\("kuzushiji"\)/);
  assert.doesNotMatch(registry, /ProjectSnapshotRefreshCoordinator/);
});

test("Projects remains registry-only and navigation prefetch is read-only", () => {
  assert.match(projects, /studyProjects/);
  assert.doesNotMatch(projects, /loadProjectReadState|getKuzushijiDashboard|getReviewStates|fetch\(/);
  for (const source of [primaryNav, header, projects]) assert.match(source, /prefetch/);
  assert.doesNotMatch(`${primaryNav}\n${header}\n${projects}`, /api\/.*(?:sync|refresh|issue|attempt|accept)/i);
});

test("localized loading boundaries contain only shell/skeleton presentation", () => {
  assert.match(loading, /AppHeader/);
  assert.match(loading, /PrimaryNav/);
  assert.match(loading, /phase5-loading/);
  assert.doesNotMatch(loading, /fetch\(|publisher|sync|RPC|loadProject|ReviewStates|getKuzushijiDashboard/);
});

test("pressed feedback covers main learner rows and header actions", () => {
  assert.match(css, /\.phase5-row:active/);
  assert.match(css, /\.phase5-project-row:active/);
  assert.match(css, /\.phase5-brand:active/);
  assert.match(css, /\.phase5-back:active/);
  assert.match(css, /\.phase5-settings-link:active/);
  assert.match(css, /prefers-reduced-motion/);
});

test("render and prefetch paths do not publish", () => {
  assert.doesNotMatch(home, /runProjectSnapshotRefresh|sync[A-Z]|publisher/i);
  assert.doesNotMatch(review, /runProjectSnapshotRefresh|sync[A-Z]|publisher/i);
  assert.doesNotMatch(projects, /runProjectSnapshotRefresh|sync[A-Z]|publisher/i);
  assert.match(refresh, /method: "POST"/);
  assert.match(refresh, /useEffect/);
  assert.match(home, /prefetch=\{!focus\.href\.startsWith\("\/review\/session"\)\}/);
  const reviewSessionLinks = review.split("\n").filter((line) => line.includes("<Link") && line.includes("/review/session"));
  assert.ok(reviewSessionLinks.length >= 3);
  assert.ok(reviewSessionLinks.every((line) => line.includes("prefetch={false}")));
});

test("no authority or storage contract is changed by this slice", () => {
  assert.doesNotMatch(`${home}\n${review}\n${projects}\n${loading}`, /createObjective|recordReviewAttempt|requestHash|receipt|buildKuzushijiScopeSnapshot/);
  assert.doesNotMatch(`${home}\n${review}\n${projects}\n${loading}`, /service.?worker|indexeddb|migration/i);
});
