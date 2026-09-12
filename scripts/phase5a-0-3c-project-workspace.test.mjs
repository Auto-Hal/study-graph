import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const registry = read("src/lib/projects/registry.ts");
const workspace = read("src/lib/projects/workspace.ts");
const graphRegistry = read("src/lib/graph/registry.ts");
const projectHome = read("app/projects/[projectId]/page.tsx");
const sectionPage = read("app/projects/[projectId]/[section]/page.tsx");
const detailPage = read("app/projects/[projectId]/[section]/[id]/page.tsx");
const projectsPage = read("app/projects/page.tsx");
const kuzushijiDashboard = read("src/components/KuzushijiSnapshotDashboard.tsx");

test("Art History and Philosophy open learner workspaces from the registry", () => {
  assert.match(registry, /id: "western-art-history"[\s\S]*?href: "\/projects\/western-art-history"/);
  assert.match(registry, /id: "philosophy"[\s\S]*?href: "\/projects\/philosophy"/);
  assert.doesNotMatch(registry, /id: "western-art-history"[\s\S]*?href: "\/graph\?project=/);
  assert.doesNotMatch(registry, /id: "philosophy"[\s\S]*?href: "\/graph\?project=/);
  assert.match(registry, /id: "kuzushiji"[\s\S]*?href: "\/projects\/kuzushiji"/);
});

test("workspace configuration has explicit domain sections", () => {
  for (const slug of ["lectures", "artists", "artworks", "movements", "terms", "periods", "culture", "museums"]) {
    assert.match(workspace, new RegExp(`slug: "${slug}"`));
  }
  for (const slug of ["lectures", "philosophers", "works", "terms", "problems", "periods", "culture", "thought-notes"]) {
    assert.match(workspace, new RegExp(`slug: "${slug}"`));
  }
  assert.match(workspace, /WorkspaceProjectId = "kuzushiji" \| "western-art-history" \| "philosophy"/);
  assert.match(workspace, /graphHref: `\/graph\?project=/);
});

test("generic workspace routes use the shared learner shell", () => {
  for (const source of [projectHome, sectionPage, detailPage]) {
    assert.match(source, /AppHeader/);
    assert.match(source, /PrimaryNav active="learn"/);
    assert.match(source, /phase5-shell/);
    assert.match(source, /getWorkspaceProject/);
  }
  assert.match(projectHome, /loadProjectReadState/);
  assert.match(sectionPage, /loadProjectReadState/);
  assert.match(detailPage, /loadProjectReadState/);
  assert.match(sectionPage, /isRenderableProjectReadState/);
  assert.match(detailPage, /projectReadStateToGraph/);
});

test("lectures and knowledge sections are first-class workspace links", () => {
  assert.match(projectHome, /section\.slug/);
  assert.match(projectHome, /section\.label/);
  assert.match(projectHome, /講義を開く/);
  assert.match(projectHome, /知識のつながり/);
  assert.match(sectionPage, /encodeURIComponent\(node\.id\)/);
  assert.match(detailPage, /getWorkspaceSectionForKind/);
});

test("all project workspaces use the same overview, learning, knowledge, and graph grammar", () => {
  for (const source of [projectHome, kuzushijiDashboard]) {
    assert.match(source, /phase5-workspace-overview/);
    assert.match(source, /<h2[^>]*>学習|<h2[^>]*>講義/);
    assert.match(source, /<h2[^>]*>知識/);
    assert.match(source, /phase5-workspace-graph/);
    assert.match(source, /<details/);
    assert.match(source, /知識のつながり/);
  }
  assert.match(projectsPage, /project\.context/);
  assert.doesNotMatch(projectsPage, /完了講義|今日の復習|復習予定を確認できません/);
});

test("knowledge connections stay collapsed by default", () => {
  for (const source of [projectHome, kuzushijiDashboard]) {
    assert.match(source, /<details className="phase5-workspace-section phase5-workspace-graph">/);
    assert.doesNotMatch(source, /<details[^>]*\bopen(?:=|\s|>)/);
    assert.match(source, /phase5-workspace-graph-summary/);
  }
});

test("Kuzushiji keeps authoritative state behind a secondary collapsed disclosure", () => {
  const dashboardView = kuzushijiDashboard.slice(kuzushijiDashboard.indexOf("function DashboardView"));
  const secondaryIndex = dashboardView.indexOf('<details className="phase5-workspace-section phase5-workspace-secondary"');
  assert.ok(secondaryIndex > 0, "Kuzushiji needs a secondary learning-status disclosure");
  const primaryMarkup = dashboardView.slice(dashboardView.indexOf("return ("), secondaryIndex);
  const secondaryMarkup = dashboardView.slice(secondaryIndex);

  assert.match(primaryMarkup, /workspaceContext/);
  assert.match(primaryMarkup, /kuzushiji-learning-title/);
  assert.match(primaryMarkup, /kuzushiji-knowledge-title/);
  for (const privilegedSurface of ["phase5-focus", "phase5-stat-line", "phase5-sync-line", "phase5-freshness", "端末の保存", "同期済み", "完了講義", "復習候補", "現在位置"]) {
    assert.doesNotMatch(primaryMarkup, new RegExp(privilegedSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(secondaryMarkup, /学習状況/);
  assert.match(secondaryMarkup, /phase5-focus/);
  assert.match(secondaryMarkup, /phase5-stat-line/);
  assert.match(secondaryMarkup, /phase5-sync-line/);
  assert.match(secondaryMarkup, /phase5-freshness/);
  assert.match(secondaryMarkup, /href="\/review"/);
  assert.match(secondaryMarkup, /href="\/projects\/kuzushiji\/progress"/);
});

test("the common workspace skeleton keeps its section order", () => {
  const orderedMarkers = [
    "phase5-workspace-overview",
    "workspace-learning-title",
    "workspace-knowledge-title",
    "phase5-workspace-graph",
  ];
  const genericPositions = orderedMarkers.map((marker) => projectHome.indexOf(marker));
  assert.ok(genericPositions.every((position) => position >= 0));
  assert.deepEqual([...genericPositions].sort((a, b) => a - b), genericPositions);

  const kuzushijiMarkers = [
    "phase5-workspace-overview",
    "kuzushiji-learning-title",
    "kuzushiji-knowledge-title",
    "phase5-workspace-graph",
    "phase5-workspace-secondary",
  ];
  const kuzushijiPositions = kuzushijiMarkers.map((marker) => kuzushijiDashboard.indexOf(marker));
  assert.ok(kuzushijiPositions.every((position) => position >= 0));
  assert.deepEqual([...kuzushijiPositions].sort((a, b) => a - b), kuzushijiPositions);
});

test("detail pages preserve graph focus and source links", () => {
  assert.match(detailPage, /project=.*node=.*view=focus/);
  assert.match(detailPage, /知識のつながりを見る/);
  assert.match(detailPage, /元の資料を開く/);
  assert.match(detailPage, /graph\.edges\.flatMap/);
});

test("verified snapshot data is the only source rendered by generic workspaces", () => {
  for (const source of [projectHome, sectionPage, detailPage]) {
    assert.match(source, /loadProjectReadState/);
    assert.doesNotMatch(source, /getWesternArtHistoryGraph|getPhilosophyGraph/);
  }
  assert.match(sectionPage, /projectReadStateToGraph/);
  assert.match(detailPage, /projectReadStateToGraph/);
  assert.match(graphRegistry, /loadSnapshotProjectGraph/);
  assert.doesNotMatch(graphRegistry, /getWesternArtHistoryGraph|getPhilosophyGraph/);
});

test("generic learner markup does not expose technical dashboard or fake progress state", () => {
  for (const source of [projectHome, sectionPage, detailPage]) {
    for (const technicalLabel of ["PHASE", "Adapter", "Notion接続中", "NODES", "NODE TYPES", "Graph architecture"]) {
      assert.doesNotMatch(source, new RegExp(technicalLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    for (const inventedState of ["完了率", "習得率", "次の復習", "mastery", "reviewCount", "getReviewStates"]) {
      assert.doesNotMatch(source, new RegExp(inventedState.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("Kuzushiji static routes remain alongside the generic workspace", () => {
  for (const path of [
    "app/projects/kuzushiji/page.tsx",
    "app/projects/kuzushiji/[section]/page.tsx",
    "app/projects/kuzushiji/[section]/[id]/page.tsx",
    "app/projects/kuzushiji/progress/page.tsx",
  ]) {
    assert.equal(existsSync(resolve(root, path)), true, `${path} must remain available`);
  }
  assert.match(read("app/projects/kuzushiji/page.tsx"), /snapshot|Snapshot|KuzushijiSnapshotDashboard/);
});

test("workspace cutover does not add a migration or service-worker dependency", () => {
  assert.doesNotMatch(projectHome, /serviceWorker|supabase\/migrations/);
  assert.doesNotMatch(sectionPage, /serviceWorker|supabase\/migrations/);
  assert.doesNotMatch(detailPage, /serviceWorker|supabase\/migrations/);
});
