import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const runtime = read("src/lib/projects/read-runtime.ts");
const runtimeCore = read("src/lib/projects/read-runtime-core.ts");
const projectGraph = read("src/lib/projects/project-graph.ts");
const graphRegistry = read("src/lib/graph/registry.ts");
const graphPage = read("app/graph/page.tsx");
const graphExplorer = read("app/graph/GraphExplorer.tsx");
const projectHome = read("app/projects/[projectId]/page.tsx");
const sectionPage = read("app/projects/[projectId]/[section]/page.tsx");
const detailPage = read("app/projects/[projectId]/[section]/[id]/page.tsx");
const ci = read(".github/workflows/ci.yml");

test("server snapshot runtime uses the current Supabase boundary and strict neutral decoder", () => {
  assert.match(runtime, /import "server-only"/);
  assert.match(runtime, /getCurrentScopeKnowledgeSnapshotModel/);
  assert.match(runtime, /decodeStoredProjectReadState/);
  assert.match(runtimeCore, /adaptScopeKnowledgeSnapshot/);
  assert.match(runtimeCore, /decodeProjectReadSnapshot/);
  assert.match(runtimeCore, /validUntil/);
  assert.match(runtimeCore, /stale/);
  assert.match(runtimeCore, /missing/);
  assert.match(runtimeCore, /unavailable/);
  assert.match(runtimeCore, /invalid-candidate/);
  assert.doesNotMatch(runtime, /readWesternArtHistory|readPhilosophy|notion[-/]/i);
  assert.doesNotMatch(runtimeCore, /Notion|demo/);
});

test("Art and Philosophy projection-to-Graph conversion is typed and snapshot-labelled", () => {
  assert.match(projectGraph, /westernArtHistoryProjectionToGraph/);
  assert.match(projectGraph, /philosophyProjectionToGraph/);
  assert.match(projectGraph, /mode: "snapshot"/);
  assert.match(projectGraph, /westernArtPlaceholderLabels/);
  assert.match(projectGraph, /workspaceNodeHref/);
  assert.match(projectGraph, /edgesFromProjection/);
});

test("normal Art and Philosophy routes use one decoded snapshot observation", () => {
  for (const source of [projectHome, sectionPage, detailPage]) {
    assert.match(source, /loadProjectReadState/);
    assert.doesNotMatch(source, /getWesternArtHistoryGraph|getPhilosophyGraph/);
    assert.doesNotMatch(source, /loadProjectGraph/);
  }
  assert.match(sectionPage, /projectReadStateToGraph/);
  assert.match(detailPage, /projectReadStateToGraph/);
  assert.match(graphPage, /loadProjectReadState/);
  assert.match(graphPage, /projectReadStateToGraph/);
  assert.doesNotMatch(graphPage, /getWesternArtHistoryGraph|getPhilosophyGraph/);
});

test("Graph registry keeps Kuzushiji compatibility while removing live Art/Philosophy dispatch", () => {
  assert.match(graphRegistry, /getKuzushijiGraph/);
  assert.match(graphRegistry, /loadSnapshotProjectGraph/);
  assert.match(graphRegistry, /project\.id === "western-art-history" \|\| project\.id === "philosophy"/);
  assert.doesNotMatch(graphRegistry, /getWesternArtHistoryGraph|getPhilosophyGraph/);
});

test("snapshot failure is local and never an authoritative empty or demo fallback", () => {
  assert.match(runtimeCore, /kind: "missing"/);
  assert.match(runtimeCore, /kind: "unavailable"/);
  assert.match(runtimeCore, /kind: "invalid-candidate"/);
  assert.match(runtime, /scope: \{ sourceState: "unavailable"/);
  assert.match(runtime, /nodes: \[\]/);
  assert.doesNotMatch(runtime, /loadWestern|loadPhilosophy|demo/);
  assert.match(graphPage, /知識のつながりを表示できません/);
});

test("stale snapshots remain displayable and Graph learning unavailability does not render zero metrics", () => {
  assert.match(graphPage, /graphIsStale/);
  assert.match(graphPage, /表示中の知識データは少し前のものです/);
  assert.match(graphPage, /learning\?\.mode === "supabase"/);
  assert.match(graphExplorer, /learningAvailable = learning\.mode === "supabase"/);
  assert.match(graphExplorer, /復習状態は現在表示できません/);
  assert.match(graphExplorer, /learningAvailable \? </);
  assert.doesNotMatch(graphPage, /summary\.tracked \?\? 0/);
});

test("Kuzushiji route and safety boundaries remain intact", () => {
  assert.equal(existsSync(resolve(root, "app/projects/kuzushiji/page.tsx")), true);
  assert.match(read("app/projects/kuzushiji/page.tsx"), /KuzushijiSnapshotDashboard|snapshot/i);
  for (const source of [runtime, runtimeCore, projectGraph, graphRegistry, graphPage, projectHome, sectionPage, detailPage]) {
    assert.doesNotMatch(source, /supabase\/migrations|serviceWorker|Notion.*write|openai/i);
  }
  assert.match(ci, /test:phase5a-0-4a-3/);
});
