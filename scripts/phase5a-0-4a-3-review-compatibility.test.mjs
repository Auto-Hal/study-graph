import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const source = read("src/lib/review/graph-practice-source.ts");
const reviewRegistry = read("src/lib/review/registry.ts");
const graphRegistry = read("src/lib/graph/registry.ts");
const graphPage = read("app/graph/page.tsx");
const projectHome = read("app/projects/[projectId]/page.tsx");
const sectionPage = read("app/projects/[projectId]/[section]/page.tsx");
const detailPage = read("app/projects/[projectId]/[section]/[id]/page.tsx");

test("Review has an explicit legacy Graph practice source with ready scope evidence", () => {
  assert.match(source, /import "server-only"/);
  assert.match(source, /getWesternArtHistoryGraph/);
  assert.match(source, /getPhilosophyGraph/);
  assert.match(source, /removeWesternArtPlaceholderNodes/);
  assert.match(source, /graph\.mode !== "notion"/);
  assert.match(source, /workspaceNodeHref/);
  assert.match(reviewRegistry, /loadReviewGraphPracticeSource/);
  assert.doesNotMatch(reviewRegistry, /loadProjectGraph/);
  assert.match(reviewRegistry, /buildGraphScopeSnapshot/);
  assert.match(reviewRegistry, /graph\.mode === "notion" && scope\.sourceState === "ready"/);
  assert.doesNotMatch(reviewRegistry, /sourceMode: "notion" \| "demo" \| "snapshot"/);
});

test("normal Art and Philosophy learner routes stay snapshot-only", () => {
  for (const route of [projectHome, sectionPage, detailPage, graphPage]) {
    assert.doesNotMatch(route, /getWesternArtHistoryGraph|getPhilosophyGraph/);
  }
  assert.doesNotMatch(graphRegistry, /getWesternArtHistoryGraph|getPhilosophyGraph/);
  assert.match(projectHome, /loadProjectReadState/);
  assert.match(sectionPage, /loadProjectReadState/);
  assert.match(detailPage, /loadProjectReadState/);
  assert.match(graphPage, /loadProjectReadState/);
});

test("Review compatibility preserves Art placeholder filtering and Kuzushiji isolation", () => {
  for (const label of ["芸術家", "作品", "様式・運動", "用語", "時代", "文化・歴史", "美術館・建築"]) {
    assert.match(source, new RegExp(`"${label}"`));
  }
  assert.match(source, /node\.meta === ""/);
  assert.match(source, /edges: graph\.edges\.filter/);
  assert.match(reviewRegistry, /loadKuzushijiReview/);
  assert.match(reviewRegistry, /issueKuzushijiPilotReview/);
});

test("Review compatibility makes no new authority or persistence path", () => {
  assert.doesNotMatch(source, /from ["'].*supabase/i);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /crypto\.randomUUID|randomUUID/);
  assert.doesNotMatch(reviewRegistry, /sourceMode: graph\.mode === "snapshot"/);
});
