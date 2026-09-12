import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const contract = read("src/lib/projects/read-contract.ts");
const projections = read("src/lib/projects/project-projections.ts");
const model = read("src/lib/review/snapshot-sync/model.ts");
const publisher = read("src/lib/review/snapshot-sync/kuzushiji.ts");
const strictSource = read("src/lib/notion/strict-snapshot-source.ts");
const v2Source = read("src/lib/notion/kuzushiji-v2-snapshot-source.ts");
const packageJson = JSON.parse(read("package.json"));
const workflow = read(".github/workflows/ci.yml");

test("Kuzushiji v2 is an explicit version beside the unchanged v1 contract", () => {
  assert.match(contract, /KUZUSHIJI_V1_PROJECTION_VERSION = "kuzushiji-v1"/);
  assert.match(contract, /KUZUSHIJI_V2_PROJECTION_VERSION = "kuzushiji-v2"/);
  assert.match(contract, /projectionVersion === KUZUSHIJI_V2_PROJECTION_VERSION/);
  assert.match(contract, /invalid-kuzushiji-v2-projection/);
  assert.match(contract, /KUZUSHIJI_V1_PROJECTION_VERSION/);
  assert.match(contract, /KUZUSHIJI_V2_PROJECTION_VERSION/);
});

test("v2 projection and completeness use exact, hash-covered keys", () => {
  assert.match(projections, /lectures, characters, mistakes, sources, expressions, reviewQueue, relations, completeness/);
  assert.match(projections, /projectionObject\(value, \["lectures", "characters", "mistakes", "sources", "expressions", "reviewQueue", "relations", "completeness"\]\)/);
  assert.match(projections, /exactKeys\(relation, \["sourceEntityId", "ownerKind", "propertyName", "relationKind", "itemCount", "paginationComplete"\]/);
  assert.match(projections, /must identify an entity of the declared review kind/);
  assert.match(model, /createKuzushijiV2ScopeKnowledgeSnapshot/);
  assert.match(model, /knowledgeProjectionVersion: KUZUSHIJI_V2_KNOWLEDGE_PROJECTION_VERSION/);
  assert.match(model, /scopePolicyVersion: KUZUSHIJI_SCOPE_POLICY_VERSION/);
});

test("the v2 source reads exactly five sources and all declared relation properties strictly", () => {
  for (const id of [
    "1da45577-aa7d-44e1-a304-9e33e5feb9e2",
    "4a9814ba-7c44-47ec-8c46-e5d558a62085",
    "12c37554-c7fa-424f-9590-f2f756bf284a",
    "a8a2de24-00d8-44cc-9721-a7382b17ee98",
    "e8b4669f-41a6-4c59-9876-4e44976a7e33",
  ]) assert.ok(v2Source.includes(id), `missing declared source ${id}`);
  assert.match(v2Source, /Promise\.all\(\[/);
  assert.match(v2Source, /collectStrictRelationObservations/);
  assert.match(v2Source, /preserveDuplicateTargets: true/);
  assert.match(v2Source, /materializeStrictDirectionalRelations/);
  assert.match(v2Source, /unresolvedTargets: \[\]/);
  assert.match(strictSource, /decodeURIComponent\(property\.id\)/);
  assert.match(strictSource, /encodeURIComponent\(decodeURIComponent\(property\.id\)\)/);
  assert.match(strictSource, /relation-pagination-cycle/);
  assert.match(strictSource, /pagination-cycle/);
  assert.match(strictSource, /response\.status === 529/);
});

test("the six Kuzushiji relation declarations preserve directional identity", () => {
  for (const kind of [
    "lecture-character",
    "lecture-mistake",
    "lecture-source",
    "lecture-expression",
    "mistake-character",
    "mistake-source",
  ]) assert.ok(v2Source.includes(`relationKind: "${kind}"`), `missing ${kind}`);
  assert.match(strictSource, /const id = `\$\{observation\.sourceEntityId\}:\$\{observation\.targetEntityId\}:\$\{observation\.relationKind\}`/);
  assert.match(strictSource, /relation \$\{id\} is duplicated/);
});

test("future publication selects v2 while learner routes remain outside the publisher/source", () => {
  assert.match(publisher, /readKuzushijiV2SnapshotSource/);
  assert.match(publisher, /createKuzushijiV2ScopeKnowledgeSnapshot/);
  assert.match(publisher, /beginScopeSnapshotSync/);
  assert.match(publisher, /publishScopeKnowledgeSnapshot/);
  assert.match(publisher, /failScopeSnapshotSync/);
  for (const path of [
    "app/projects/kuzushiji/page.tsx",
    "app/graph/page.tsx",
    "app/review/page.tsx",
    "app/review/session/page.tsx",
    "src/components/KuzushijiSnapshotDashboard.tsx",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /kuzushiji-v2|readKuzushijiV2SnapshotSource|createKuzushijiV2ScopeKnowledgeSnapshot/);
  }
});

test("v1 review queue and historical source/hash boundaries remain referenced", () => {
  assert.match(model, /buildKuzushijiReviewQueue/);
  assert.match(model, /createKuzushijiKnowledgeProjection/);
  assert.match(model, /createScopeKnowledgeSnapshot/);
  assert.match(model, /isScopeKnowledgeSnapshotHashValid/);
  assert.match(model, /phase4b-v1/);
  assert.match(contract, /KUZUSHIJI_V1_PROJECTION_VERSION/);
  assert.doesNotMatch(v2Source, /demoData|demoGraph|fallback/i);
});

test("focused v2 tests are wired into package scripts and CI", () => {
  assert.equal(typeof packageJson.scripts?.["test:phase5a-0-4a-4"], "string");
  assert.match(packageJson.scripts["test:phase5a-0-4a-4"], /kuzushiji-v2/);
  assert.match(workflow, /test:phase5a-0-4a-4/);
});

test("the slice does not add migration, service-worker, or write behavior", () => {
  assert.doesNotMatch(v2Source, /supabase\/migrations|serviceWorker|Notion.*write|fetch\([^)]*POST/i);
  assert.doesNotMatch(model, /supabase\/migrations|serviceWorker|Notion.*write/);
  assert.doesNotMatch(publisher, /app\/api|NextRequest|NextResponse/);
});
