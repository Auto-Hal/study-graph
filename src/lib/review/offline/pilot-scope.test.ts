import assert from "node:assert/strict";
import test from "node:test";
import { KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID } from "../exercises/kuzushiji-pilot.ts";
import { createScopeKnowledgeSnapshot } from "./snapshot.ts";
import { isOfflinePilotInstanceOfferable } from "./offline-card.ts";
import { selectPilotCharacterFromSnapshot } from "./pilot-scope.ts";

function snapshot(
  status: "eligible" | "ineligible" | "unknown" = "eligible",
  generation = 1,
  includeFake = false,
) {
  return createScopeKnowledgeSnapshot({
    snapshotId: `snapshot-${generation}`,
    projectId: "kuzushiji",
    generation,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:00:01.000Z",
    publishedAt: "2030-01-01T00:00:02.000Z",
    validUntil: "2030-01-01T02:00:01.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "kuzushiji-v1",
    sourceEvidence: {
      sourceIdentifiers: ["notion:characters"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [{
      subjectId: KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,
      status,
      reasonCodes: ["pilot"],
      anchorReferences: [],
    }],
    knowledgeProjection: {
      characters: [
        ...(includeFake ? [{ id: "fake-a-0001", glyph: "あ", reading: "あ", mastery: "learning" }] : []),
        {
          id: KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,
          glyph: "あ",
          reading: "あ",
          mastery: "learning",
        },
      ],
    },
  });
}

test("pilot selection requires the exact Scope anchor, even when another あ is eligible", () => {
  const candidate = snapshot("eligible", 1, true);
  const selected = selectPilotCharacterFromSnapshot(candidate);
  assert.equal(selected.id, KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID);
});

test("missing or ineligible exact pilot anchor fails closed", () => {
  assert.throws(() => selectPilotCharacterFromSnapshot(snapshot("ineligible")), /pilot_scope_not_eligible/);
  const missingProjection = createScopeKnowledgeSnapshot({
    ...snapshot(),
    snapshotId: "snapshot-missing",
    knowledgeProjection: { characters: [] },
  });
  assert.throws(() => selectPilotCharacterFromSnapshot(missingProjection), /pilot_scope_not_eligible/);
});

test("a newer ineligible snapshot excludes only an unstarted issued card", () => {
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot("ineligible", 2)), false);
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot("eligible", 2)), true);
  assert.equal(isOfflinePilotInstanceOfferable(1, snapshot("unknown", 2)), true);
  assert.equal(isOfflinePilotInstanceOfferable(2, snapshot("ineligible", 2)), true);
  assert.equal(isOfflinePilotInstanceOfferable(1, null), true);
});
