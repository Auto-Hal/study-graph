import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const runtime = read("src/lib/projects/read-runtime.ts");
const runtimeCore = read("src/lib/projects/read-runtime-core.ts");
const contract = read("src/lib/projects/read-contract.ts");
const projectGraph = read("src/lib/projects/project-graph.ts");
const workspace = read("src/lib/projects/workspace.ts");
const graphRegistry = read("src/lib/graph/registry.ts");
const graphPage = read("app/graph/page.tsx");
const kuzushijiHome = read("app/projects/kuzushiji/page.tsx");
const kuzushijiDashboard = read("src/components/KuzushijiSnapshotDashboard.tsx");
const sectionPage = read("app/projects/kuzushiji/[section]/page.tsx");
const detailPage = read("app/projects/kuzushiji/[section]/[id]/page.tsx");
const progressPage = read("app/projects/kuzushiji/progress/page.tsx");
const reviewRegistry = read("src/lib/review/registry.ts");
const snapshotCache = read("src/lib/review/offline/snapshot-cache.ts");
const syncRoute = read("app/api/snapshots/kuzushiji/sync/route.ts");
const source = read("src/lib/notion/kuzushiji-v2-snapshot-source.ts");
const packageJson = JSON.parse(read("package.json"));
const ci = read(".github/workflows/ci.yml");

test("shared learner runtime allowlists Kuzushiji v2 and uses knowledge collections for empty detection", () => {
  assert.match(runtimeCore, /SnapshotBackedProjectId = "kuzushiji" \| "western-art-history" \| "philosophy"/);
  assert.match(runtimeCore, /KUZUSHIJI_V2_PROJECTION_VERSION/);
  assert.match(runtimeCore, /isSupportedLearnerProjection/);
  assert.match(runtimeCore, /projection\.sources\.length/);
  assert.match(runtimeCore, /projection\.expressions\.length/);
  assert.doesNotMatch(runtimeCore, /reviewQueue\.length/);
  assert.match(runtime, /getCurrentScopeKnowledgeSnapshotModel/);
  assert.match(runtime, /decodeStoredProjectReadState/);
  assert.doesNotMatch(runtime, /getKuzushijiDashboard|getKuzushijiReferenceData|getKuzushijiGraph/);
});

test("global decoder keeps v1 while normal learner state requires v2", () => {
  assert.match(contract, /KUZUSHIJI_V1_PROJECTION_VERSION = "kuzushiji-v1"/);
  assert.match(contract, /KUZUSHIJI_V2_PROJECTION_VERSION = "kuzushiji-v2"/);
  assert.match(contract, /decodeKuzushijiV1Projection/);
  assert.match(runtimeCore, /projectId === KUZUSHIJI_PROJECT_ID && snapshot\.projectionVersion === KUZUSHIJI_V2_PROJECTION_VERSION/);
  assert.match(runtimeCore, /project-projection-mismatch/);
});

test("Home dashboard maps both v1 and v2 without weakening v2 validation", () => {
  assert.match(kuzushijiDashboard, /dashboardFromScopeKnowledgeSnapshot/);
  assert.match(kuzushijiDashboard, /cacheScopeKnowledgeSnapshot/);
  assert.match(kuzushijiDashboard, /selectSnapshotForDisplay/);
  assert.match(kuzushijiDashboard, /ObjectiveStateMirrorSync/);
  assert.match(read("src/lib/review/snapshot-sync/dashboard.ts"), /KUZUSHIJI_V1_PROJECTION_VERSION/);
  assert.match(read("src/lib/review/snapshot-sync/dashboard.ts"), /KUZUSHIJI_V2_PROJECTION_VERSION/);
  assert.match(read("src/lib/review/snapshot-sync/dashboard.ts"), /decodeKuzushijiV2Projection/);
  assert.doesNotMatch(kuzushijiHome, /getKuzushijiDashboard|getKuzushijiReferenceData/);
});

test("Kuzushiji v2 graph conversion preserves five kinds, one observation, and directional relations", () => {
  for (const kind of ["lecture", "character", "mistake", "source", "expression"]) {
    assert.match(projectGraph, new RegExp(`"${kind}"`));
  }
  assert.match(projectGraph, /kuzushijiV2ProjectionToGraph/);
  assert.match(projectGraph, /projection\.relations/);
  assert.match(projectGraph, /edgesFromProjection/);
  assert.match(projectGraph, /mode: "snapshot"/);
  assert.match(projectGraph, /workspaceNodeHref/);
});

test("all Kuzushiji lists and details use the shared v2 snapshot, never live learner readers", () => {
  for (const page of [sectionPage, detailPage, progressPage]) {
    assert.match(page, /loadProjectReadState\("kuzushiji"\)/);
    assert.doesNotMatch(page, /getKuzushijiDashboard|getKuzushijiReferenceData|getKuzushijiGraph/);
    assert.doesNotMatch(page, /from ["'][^"']*notion["']/i);
  }
  assert.match(sectionPage, /isKuzushijiV2ProjectReadState/);
  assert.match(sectionPage, /projection\.(lectures|characters|mistakes|sources|expressions)/);
  assert.match(detailPage, /projectReadStateToGraph/);
  assert.match(detailPage, /graph\.edges\.flatMap/);
  assert.match(detailPage, /graph\?project=kuzushiji&node=/);
  assert.match(progressPage, /isKuzushijiV2ProjectReadState/);
  assert.match(progressPage, /getKuzushijiPilotObjectiveState|getReviewHistory/);
});

test("Kuzushiji workspace definitions provide learner section hrefs", () => {
  assert.match(workspace, /WorkspaceProjectId = "kuzushiji"/);
  for (const [slug, kind] of [["lectures", "lecture"], ["characters", "character"], ["mistakes", "mistake"], ["sources", "source"], ["expressions", "expression"]]) {
    assert.match(workspace, new RegExp(`slug: "${slug}"`));
    assert.match(workspace, new RegExp(`kind: "${kind}"`));
  }
  assert.match(workspace, /kuzushiji: "講義と文字を読む"/);
  assert.match(workspace, /kuzushiji: "講義・文字・資料の関係を見る"/);
});

test("normal Graph is snapshot-only for Kuzushiji while Review remains live and fresh-Scope based", () => {
  assert.doesNotMatch(graphRegistry, /getKuzushijiGraph/);
  assert.match(graphRegistry, /loadSnapshotProjectGraph/);
  assert.match(graphRegistry, /"kuzushiji", "western-art-history", "philosophy"/);
  assert.match(graphPage, /loadProjectReadState\(project\.id\)/);
  assert.match(graphPage, /projectReadStateToGraph/);
  assert.doesNotMatch(graphPage, /getKuzushijiGraph|getKuzushijiDashboard|getKuzushijiReferenceData/);
  assert.match(reviewRegistry, /getKuzushijiDashboard/);
  assert.match(reviewRegistry, /buildKuzushijiScopeSnapshot/);
});

test("Graph learning overlay reports unavailable instead of rendering unavailable zeros", () => {
  assert.match(graphPage, /learning\?\.mode === "supabase"/);
  assert.match(graphPage, /復習状態は現在表示できません/);
  assert.doesNotMatch(graphPage, /summary\.tracked \?\? 0|summary\.due \?\? 0|summary\.weak \?\? 0|summary\.recent \?\? 0/);
  assert.match(read("app/graph/GraphExplorer.tsx"), /learningAvailable = learning\.mode === "supabase"/);
  assert.match(read("app/graph/GraphExplorer.tsx"), /復習状態は現在表示できません/);
});

test("v1 cache compatibility and manual sync contracts remain unchanged", () => {
  assert.match(snapshotCache, /SNAPSHOT_CACHE_DB_VERSION = 1/);
  assert.match(snapshotCache, /compareVerifiedSnapshotAdoption/);
  assert.match(snapshotCache, /candidate\.generation/);
  assert.match(syncRoute, /export async function POST\(request: Request\)/);
  assert.match(syncRoute, /same-origin|origin/i);
  assert.doesNotMatch(kuzushijiDashboard, /loadKuzushijiV2|readKuzushijiV2SnapshotSource/);
});

test("the focused command and CI step cover the Kuzushiji snapshot cutover", () => {
  assert.equal(typeof packageJson.scripts?.["test:phase5a-0-4a-5"], "string");
  assert.match(packageJson.scripts["test:phase5a-0-4a-5"], /kuzushiji-snapshot-cutover/);
  assert.match(ci, /test:phase5a-0-4a-5/);
});

test("learner cutover does not introduce publication, persistence, or service-worker changes", () => {
  for (const path of [
    "app/graph/page.tsx",
    "app/projects/kuzushiji/[section]/page.tsx",
    "app/projects/kuzushiji/[section]/[id]/page.tsx",
    "app/projects/kuzushiji/progress/page.tsx",
    "src/lib/projects/read-runtime.ts",
    "src/lib/projects/read-runtime-core.ts",
    "src/lib/projects/project-graph.ts",
  ]) {
    assert.equal(existsSync(resolve(root, path)), true);
    assert.doesNotMatch(read(path), /supabase\/migrations|serviceWorker|Notion.*write|openai/i);
  }
  assert.doesNotMatch(source, /supabase\/migrations|serviceWorker|Notion.*write|fetch\([^)]*POST/i);
});
