import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const contract = read("src/lib/projects/read-contract.ts");
const projections = read("src/lib/projects/project-projections.ts");
const model = read("src/lib/review/snapshot-sync/project-model.ts");
const publisher = read("src/lib/review/snapshot-sync/projects.ts");
const strictSource = read("src/lib/notion/strict-snapshot-source.ts");
const artSource = read("src/lib/notion/western-art-history-snapshot-source.ts");
const philosophySource = read("src/lib/notion/philosophy-snapshot-source.ts");
const workflow = read(".github/workflows/ci.yml");

test("Art and Philosophy versions are explicit and dispatched fail closed", () => {
  assert.match(contract, /WESTERN_ART_HISTORY_PROJECT_ID = "western-art-history"/);
  assert.match(contract, /WESTERN_ART_HISTORY_V1_PROJECTION_VERSION = "western-art-history-v1"/);
  assert.match(contract, /PHILOSOPHY_PROJECT_ID = "philosophy"/);
  assert.match(contract, /PHILOSOPHY_V1_PROJECTION_VERSION = "philosophy-v1"/);
  assert.match(contract, /decodeWesternArtHistoryV1Projection/);
  assert.match(contract, /decodePhilosophyV1Projection/);
  assert.match(contract, /project-projection-mismatch/);
  assert.match(contract, /unsupported-projection-version/);
  assert.doesNotMatch(contract, /as\s+SomeProjection/);
});

test("project projections are typed, exact-key, and completeness protected", () => {
  for (const key of [
    "WesternArtHistoryV1Projection",
    "PhilosophyV1Projection",
    "ProjectKnowledgeRelation",
    "ProjectProjectionCompleteness",
    "decodeWesternArtHistoryV1Projection",
    "decodePhilosophyV1Projection",
  ]) assert.match(projections, new RegExp(key));
  assert.match(projections, /projectionObject\(value, \["lectures", "artists", "artworks"/);
  assert.match(projections, /exactKeys\(record, \["dataSources", "relationProperties", "unresolvedTargets"\]/);
  assert.match(projections, /unresolvedTargets\.length > 0/);
});

test("project snapshot labels preserve current learner fallback semantics", () => {
  for (const source of [artSource, philosophySource]) {
    assert.match(source, /readNotionDisplayLabel/);
    assert.doesNotMatch(source, /requiredNotionText/);
  }
  for (const label of ["講義", "芸術家", "作品", "様式・運動", "用語", "時代", "文化・歴史", "美術館・建築"]) {
    assert.ok(artSource.includes(`"${label}"`), `Art source should preserve fallback label ${label}`);
  }
  for (const label of ["講義", "哲学者", "用語", "哲学的問題", "原典・著作", "文化", "時代", "思考ノート"]) {
    assert.ok(philosophySource.includes(`"${label}"`), `Philosophy source should preserve fallback label ${label}`);
  }
});

test("strict Notion source centralizes bounded rate-limit retry", () => {
  assert.match(strictSource, /fetchNotionWithRetry/);
  assert.match(strictSource, /NOTION_MAX_REQUEST_ATTEMPTS = 6/);
  assert.match(strictSource, /response\.status === 429/);
  assert.match(strictSource, /response\.status === 529/);
  assert.match(strictSource, /retry-after/);
});

test("strict source readers use all eight declared sources and never demo fallback", () => {
  for (const source of [artSource, philosophySource]) {
    assert.match(source, /queryAllNotionDataSource/);
    assert.match(source, /collectStrictRelationObservations/);
    assert.match(source, /materializeStrictRelations/);
    assert.doesNotMatch(source, /demoGraph|getWesternArtHistoryGraph|getPhilosophyGraph/);
    assert.match(source, /Promise\.all\(\[/);
  }
  assert.equal((artSource.match(/: "[0-9a-f-]{36}"/g) ?? []).length, 8);
  assert.equal((philosophySource.match(/: "[0-9a-f-]{36}"/g) ?? []).length, 8);
  assert.match(strictSource, /pagination-incomplete/);
  assert.match(strictSource, /pagination-cycle/);
  assert.match(strictSource, /duplicate-page/);
  assert.match(strictSource, /relation-pagination-incomplete/);
  assert.match(strictSource, /relation-pagination-cycle/);
  assert.match(strictSource, /relation-target-unresolved/);
});

test("relation completeness is read property-by-property and resolved before publication", () => {
  assert.match(strictSource, /pages\/\$\{encodeURIComponent\(page\.id\)\}\/properties/);
  assert.match(strictSource, /queryAllNotionRelationProperty/);
  assert.match(strictSource, /materializeStrictRelations/);
  assert.match(artSource, /relationRead\.evidence/);
  assert.match(philosophySource, /relationRead\.evidence/);
  assert.match(artSource, /WESTERN_ART_HISTORY_RELATION_DECLARATIONS/);
  assert.match(philosophySource, /PHILOSOPHY_RELATION_DECLARATIONS/);
  assert.match(projections, /relationProperties/);
  assert.match(projections, /sourceEntityId/);
  assert.match(strictSource, /sourceEntityId: page\.id/);
  assert.match(model, /sourceEntityId/);
  assert.match(projections, /unresolvedTargets/);
});

test("publishers use the existing snapshot envelope and RPC lifecycle", () => {
  assert.match(model, /createScopeKnowledgeSnapshot/);
  assert.match(model, /isScopeKnowledgeSnapshotHashValid/);
  assert.match(contract, /NO_OBJECTIVE_SCOPE_POLICY_VERSION = "not-applicable-no-objective-v1"/);
  assert.match(model, /NO_OBJECTIVE_SCOPE_POLICY_VERSION/);
  assert.match(model, /scopeDecisions: \[\]/);
  assert.match(publisher, /import "server-only"/);
  assert.match(publisher, /beginScopeSnapshotSync/);
  assert.match(publisher, /publishScopeKnowledgeSnapshot/);
  assert.match(publisher, /failScopeSnapshotSync/);
  assert.match(publisher, /value === "western-art-history" \|\| value === "philosophy"/);
  assert.match(publisher, /readWesternArtHistorySnapshotSource/);
  assert.match(publisher, /readPhilosophySnapshotSource/);
  assert.doesNotMatch(publisher, /app\/api|NextRequest|NextResponse/);
});

test("historical source evidence stays small while detailed evidence is projection data", () => {
  assert.match(model, /sourceIdentifiers: \[\.\.\.input\.source\.sourceIdentifiers\]/);
  assert.match(model, /paginationComplete: input\.source\.paginationComplete/);
  assert.match(model, /relationCompleteness: input\.source\.relationCompleteness/);
  assert.match(model, /knowledgeProjection: input\.source\.projection/);
  assert.doesNotMatch(model, /sourceEvidence:[\s\S]{0,500}relationProperties/);
});

test("CI executes the focused publisher contract", () => {
  assert.match(workflow, /test:phase5a-0-4a-2/);
});
