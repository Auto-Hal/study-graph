import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const route = read("app/api/projects/[projectId]/snapshot/refresh/route.ts");
const oldKuzushijiRoute = read("app/api/snapshots/kuzushiji/sync/route.ts");
const refresh = read("src/lib/projects/foreground-refresh.ts");
const refreshCore = read("src/lib/projects/foreground-refresh-core.ts");
const client = read("src/components/ProjectSnapshotRefresh.tsx");
const coordinator = read("src/components/project-snapshot-refresh-coordinator.ts");
const kuzushijiDashboard = read("src/components/KuzushijiSnapshotDashboard.tsx");
const reviewRegistry = read("src/lib/review/registry.ts");
const packageJson = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");

test("shared refresh route is POST-only, bounded, allowlisted, and safe", () => {
  assert.match(route, /export async function POST/);
  assert.doesNotMatch(route, /export async function GET/);
  for (const project of ["kuzushiji", "western-art-history", "philosophy"]) assert.match(refreshCore, new RegExp(project));
  assert.match(route, /pilotWriteSameOriginFailure/);
  assert.match(route, /MAX_REFRESH_BODY_BYTES/);
  assert.match(route, /Object\.keys\(record\)\.length !== 1/);
  assert.match(route, /record\.intent !== "foreground"/);
  assert.match(route, /record\.intent !== "manual"/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.doesNotMatch(route, /snapshotId|contentHash|Notion|Supabase|scopeDecisions/i);
});

test("server policy keeps foreground/manual decisions and publisher dispatch explicit", () => {
  assert.match(refreshCore, /MANUAL_REFRESH_MIN_INTERVAL_MS = 90_000/);
  for (const kind of ["fresh", "refreshed", "cooldown", "busy", "missing", "blocked", "unavailable"]) {
    assert.match(refreshCore, new RegExp(`"${kind}"`));
  }
  assert.match(refreshCore, /intent === "foreground"/);
  assert.match(refreshCore, /intent === "manual"/);
  assert.match(refreshCore, /state\.kind === "stale"/);
  assert.match(refreshCore, /state\.kind === "missing"/);
  assert.match(refreshCore, /state\.kind === "invalid-candidate"/);
  assert.match(refreshCore, /state\.kind === "conflict"/);
  assert.match(refresh, /syncKuzushijiScopeKnowledgeSnapshot/);
  assert.match(refresh, /syncWesternArtHistorySnapshot/);
  assert.match(refresh, /syncPhilosophySnapshot/);
  assert.match(refreshCore, /snapshot_sync_in_progress/);
  assert.match(refreshCore, /snapshot_publish_conflict/);
});

test("client coordinator waits for hydration, visibility, and per-tab throttle", () => {
  assert.match(client, /useEffect/);
  assert.match(client, /document\.visibilityState/);
  assert.match(client, /visibilitychange/);
  assert.match(coordinator, /FOREGROUND_REFRESH_THROTTLE_MS = 5 \* 60/);
  assert.match(coordinator, /foregroundRequestedAt/);
  assert.match(coordinator, /inFlightRequests/);
  assert.match(coordinator, /intent: CoordinatorIntent/);
  assert.match(coordinator, /promise: Promise<CoordinatorResult>/);
  assert.match(client, /refreshCoordinator\.requestForeground/);
  assert.match(client, /method: "POST"/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /router\.refresh\(\)/);
  assert.match(client, /intent \}/);
  assert.doesNotMatch(client, /api\/snapshots\/kuzushiji\/sync/);
});

test("client intent and remount coordination preserve manual work and join before throttle", () => {
  assert.match(coordinator, /existing\.intent === "manual" \|\| intent === "foreground"/);
  assert.match(coordinator, /result\.kind === "refreshed" \? result : startDirect\(projectId, "manual"\)/);
  assert.match(coordinator, /const existing = inFlightRequests\.get\(projectId\);\n    if \(existing\) return existing\.promise;/);
  assert.match(coordinator, /inFlightRequests\.set\(projectId, \{ projectId, intent: "manual", promise \}\)/);
});

test("all normal learner surfaces mount the shared coordinator without touching Review", () => {
  const surfaces = [
    "app/projects/[projectId]/page.tsx",
    "app/projects/[projectId]/[section]/page.tsx",
    "app/projects/[projectId]/[section]/[id]/page.tsx",
    "app/projects/kuzushiji/[section]/page.tsx",
    "app/projects/kuzushiji/[section]/[id]/page.tsx",
    "app/projects/kuzushiji/progress/page.tsx",
    "app/graph/page.tsx",
  ];
  for (const path of surfaces) assert.match(read(path), /ProjectSnapshotRefreshCoordinator/);
  assert.match(read("app/projects/[projectId]/page.tsx"), /ProjectSnapshotRefreshControl/);
  assert.match(kuzushijiDashboard, /ProjectSnapshotRefreshCoordinator/);
  assert.match(kuzushijiDashboard, /api\/projects\/kuzushiji\/snapshot\/refresh/);
  assert.doesNotMatch(reviewRegistry, /ProjectSnapshotRefresh/);
});

test("Kuzushiji compatibility sync is the same-origin POST wrapper", () => {
  assert.match(oldKuzushijiRoute, /export async function POST/);
  assert.doesNotMatch(oldKuzushijiRoute, /export async function GET/);
  assert.match(oldKuzushijiRoute, /pilotWriteSameOriginFailure/);
  assert.match(oldKuzushijiRoute, /runProjectSnapshotRefresh\("kuzushiji", "manual"\)/);
  assert.match(oldKuzushijiRoute, /syncKuzushijiScopeKnowledgeSnapshot/);
  assert.doesNotMatch(oldKuzushijiRoute, /snapshotId|contentHash|generation/);
});

test("refresh never enters GET/prefetch or Review/acceptance paths", () => {
  assert.doesNotMatch(read("src/lib/review/registry.ts"), /foreground|snapshot\/refresh/);
  assert.doesNotMatch(read("src/lib/review/offline/foreground-sync.ts"), /snapshot\/refresh/);
  assert.doesNotMatch(read("src/lib/projects/read-runtime.ts"), /runProjectSnapshotRefresh|foreground-refresh/);
  assert.doesNotMatch(read("app/projects/[projectId]/page.tsx"), /sync[A-Z]|fetch\(/);
  assert.doesNotMatch(read("app/graph/page.tsx"), /sync[A-Z]|fetch\(/);
});

test("package and CI wire the focused contract without schema or worker changes", () => {
  assert.equal(typeof packageJson.scripts["test:phase5a-0-4a-6"], "string");
  assert.match(ci, /test:phase5a-0-4a-6/);
  assert.doesNotMatch(route, /migration|service.?worker|indexeddb/i);
  assert.doesNotMatch(refresh, /supabase|notion/i);
});
