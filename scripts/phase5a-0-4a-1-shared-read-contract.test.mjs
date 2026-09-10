import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const contract = read("src/lib/projects/read-contract.ts");
const historicalSnapshot = read("src/lib/review/offline/snapshot-content.ts");
const packageJson = read("package.json");

test("shared read contract is an application adapter over historical snapshot storage", () => {
  assert.match(contract, /ProjectReadSnapshot/);
  assert.match(contract, /adaptScopeKnowledgeSnapshot/);
  assert.match(contract, /toScopeKnowledgeSnapshot/);
  assert.match(contract, /validUntil/);
  assert.match(contract, /generation/);
  assert.match(contract, /display freshness/);
  assert.match(contract, /does not itself authorize Scope or SRS/);
  assert.match(historicalSnapshot, /export type ScopeKnowledgeSnapshot/);
});

test("project and projection dispatch is explicit and fail closed", () => {
  assert.match(contract, /KUZUSHIJI_PROJECT_ID = "kuzushiji"/);
  assert.match(contract, /KUZUSHIJI_V1_PROJECTION_VERSION = "kuzushiji-v1"/);
  assert.match(contract, /unsupported projectId/);
  assert.match(contract, /unsupported projectionVersion/);
  assert.match(contract, /decodeKuzushijiV1Projection/);
  assert.match(contract, /isScopeKnowledgeSnapshotHashValid/);
  assert.match(contract, /invalid-content-hash/);
  assert.match(contract, /not supported in this projection version/);
  assert.match(contract, /sourceEvidence/);
  assert.match(contract, /subjectObservations/);
  assert.match(contract, /relationCompleteness/);
  assert.match(contract, /anchorReferences/);
  assert.doesNotMatch(contract, /as\s+SomeProjection/);
});

test("read state and capability axes do not infer fake zero state", () => {
  for (const state of ["loading", "ready", "stale", "verified-local-replica", "missing", "unavailable", "invalid-candidate", "conflict"]) {
    assert.match(contract, new RegExp(`kind: "${state}"`));
  }
  assert.match(contract, /authoritative-empty/);
  for (const axis of ["semanticSupport", "publishedContent", "runtimeAvailability", "deviceReadiness"]) {
    assert.match(contract, new RegExp(axis));
  }
  assert.doesNotMatch(contract, /reviewCount|masteryCount|fake|inferredZero/);
});

test("the focused test is exposed without touching route or database contracts", () => {
  assert.match(packageJson, /test:phase5a-0-4a-1/);
  assert.doesNotMatch(contract, /supabase\/migrations|fetch\(|POST|Notion/);
});
