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
  assert.match(workspace, /WorkspaceProjectId = "western-art-history" \| "philosophy"/);
  assert.match(workspace, /graphHref: `\/graph\?project=/);
});

test("generic workspace routes use the shared learner shell", () => {
  for (const source of [projectHome, sectionPage, detailPage]) {
    assert.match(source, /AppHeader/);
    assert.match(source, /PrimaryNav active="learn"/);
    assert.match(source, /phase5-shell/);
    assert.match(source, /getWorkspaceProject/);
  }
  assert.match(projectHome, /loadProjectGraph/);
  assert.match(sectionPage, /loadProjectGraph/);
  assert.match(detailPage, /loadProjectGraph/);
  assert.match(projectHome, /graph\.mode === "notion"/);
  assert.match(sectionPage, /graph\.mode === "notion"/);
  assert.match(detailPage, /graph\.mode !== "notion"/);
});

test("lectures and knowledge sections are first-class workspace links", () => {
  assert.match(projectHome, /section\.slug/);
  assert.match(projectHome, /section\.label/);
  assert.match(projectHome, /講義を開く/);
  assert.match(projectHome, /知識のつながり/);
  assert.match(sectionPage, /encodeURIComponent\(node\.id\)/);
  assert.match(detailPage, /getWorkspaceSectionForKind/);
});

test("detail pages preserve graph focus and source links", () => {
  assert.match(detailPage, /project=.*node=.*view=focus/);
  assert.match(detailPage, /知識のつながりを見る/);
  assert.match(detailPage, /元の資料を開く/);
  assert.match(detailPage, /graph\.edges\.flatMap/);
});

test("trusted GraphData is the only source rendered by generic workspaces", () => {
  assert.match(projectHome, /const trusted = graph\.mode === "notion"/);
  assert.match(projectHome, /!trusted \?/);
  assert.match(sectionPage, /const nodes = trusted \? graph\.nodes\.filter/);
  assert.match(sectionPage, /!trusted \?/);
  assert.match(detailPage, /if \(graph\.mode !== "notion" \|\| graph\.projectId !== workspace\.id\)/);
  assert.match(graphRegistry, /workspaceNodeHref/);
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
