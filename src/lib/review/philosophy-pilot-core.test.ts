import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeExerciseRevision } from "./exercises/attempt.ts";
import {
  PHILOSOPHY_ARCHE_EXERCISE_ID, PHILOSOPHY_ARCHE_LECTURE_ID, PHILOSOPHY_ARCHE_LECTURE_URL,
  PHILOSOPHY_ARCHE_TERM_ID, PHILOSOPHY_ARCHE_TERM_URL,
  philosophyArcheContentRelease, philosophyArcheDefinition, philosophyArcheObjectiveBinding,
  philosophyArcheObjectiveDefinition, philosophyArcheRevision, philosophyArcheRevisionPayload,
} from "./exercises/philosophy-anaximander.ts";
import { hashObjectiveDefinition } from "./objectives.ts";
import { createExerciseRevision, getExerciseRevisionPayload } from "./exercises/revision.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import { createPhilosophyPresentation, decodePhilosophyInstance, philosophyCardFromPersisted, philosophyPilotEnabled, hashPhilosophyPresentation } from "./philosophy-pilot-core.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import type { GraphData } from "../graph/types.ts";

const instanceId = "11111111-1111-4111-8111-111111111111";
const learnerId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";

function persisted(overrides: Partial<ResolvedObjectiveInstanceArchive> = {}): ResolvedObjectiveInstanceArchive {
  const presentation = createPhilosophyPresentation(philosophyArcheRevisionPayload);
  return {
    instance_id: instanceId, learner_id: learnerId,
    release_id: philosophyArcheContentRelease.manifestHash, revision_id: revisionId,
    presentation, presentation_hash: hashPhilosophyPresentation(presentation),
    renderer_version: null, adapter_version: null, locale: "ja-JP",
    scope_evidence: {}, knowledge_binding: { source: "notion", externalId: PHILOSOPHY_ARCHE_TERM_ID, role: "scope-subject" },
    legacy_item_id: PHILOSOPHY_ARCHE_TERM_ID, legacy_item_kind: "knowledge",
    legacy_exercise_id: PHILOSOPHY_ARCHE_EXERCISE_ID, srs_target: "objective", srs_epoch: "1",
    revision_payload: philosophyArcheRevisionPayload, revision_status: "approved",
    project_id: "philosophy", exercise_id: PHILOSOPHY_ARCHE_EXERCISE_ID,
    exercise_version: 1, content_hash: philosophyArcheRevision.contentHash,
    ...overrides,
  };
}

function graph(completion: "completed" | "incomplete" = "completed", sourceState: "ready" | "unavailable" = "ready"): GraphData {
  return {
    projectId: "philosophy", mode: "notion",
    nodes: [{ id: PHILOSOPHY_ARCHE_TERM_ID, kind: "term", label: "アペイロン", meta: "", href: null, notionUrl: PHILOSOPHY_ARCHE_TERM_URL }],
    edges: [], scope: { sourceState, anchors: [{ id: PHILOSOPHY_ARCHE_LECTURE_ID, completion, date: null,
      directRelations: [{ nodeId: PHILOSOPHY_ARCHE_TERM_ID, kind: "term" }] }] },
  };
}

test("production Philosophy content is built from real text references without visual assets", () => {
  assert.equal(philosophyArcheDefinition.projectId, "philosophy");
  assert.equal(philosophyArcheDefinition.exerciseId, PHILOSOPHY_ARCHE_EXERCISE_ID);
  assert.equal(philosophyArcheRevision.pilotMetadata, null);
  assert.deepEqual(philosophyArcheDefinition.relatedKnowledgeBindings, [{ source: "notion", externalId: PHILOSOPHY_ARCHE_TERM_ID, role: "scope-subject" }]);
  assert.deepEqual(philosophyArcheDefinition.sources.map((source) => source.url), [PHILOSOPHY_ARCHE_LECTURE_URL, PHILOSOPHY_ARCHE_TERM_URL]);
  assert.ok(philosophyArcheDefinition.sources.every((source) => "kind" in source && source.kind === "text-reference" && !source.url.includes("example.invalid")));
  assert.equal(philosophyArcheRevision.stimuli.length, 0);
  assert.equal(philosophyArcheRevision.visualAssets.length, 0);
  assert.equal(philosophyArcheContentRelease.manifest.revisionEntries[0].assets.length, 0);
  assert.equal(philosophyArcheObjectiveDefinition.target, "アペイロン");
  assert.equal(philosophyArcheObjectiveDefinition.responseMode, "recall");
  assert.equal(philosophyArcheObjectiveBinding.revisionContentHash, philosophyArcheRevision.contentHash);
  assert.equal(philosophyArcheObjectiveBinding.evidenceUse, "srs");
  assert.equal(philosophyArcheRevision.contentHash, "e447af0932b075e2b57cc6ce200cfc499ef4f6dd002196ee4ceb9a9bbfc27318");
  assert.equal(philosophyArcheContentRelease.manifestHash, "d16990dd6dc12cbca7187f10e626f520c9bace8572fa94a02c2bad1ce0f1e064");
  assert.equal(hashObjectiveDefinition(philosophyArcheObjectiveDefinition), "03b0197db1ca4ce1ef90301035715c412d8cc49f98ef78d438c490276d86652f");
  assert.equal(gradeExerciseRevision(philosophyArcheRevisionPayload, "アペイロン").isCorrect, true);
  assert.equal(gradeExerciseRevision(philosophyArcheRevisionPayload, "アリストテレス").isCorrect, false);
});

test("Philosophy rollout flag is exact true only", () => {
  for (const value of [undefined, "", "false", "1", "TRUE", "on", "yes"]) assert.equal(philosophyPilotEnabled(value), false);
  assert.equal(philosophyPilotEnabled("true"), true);
});

test("completed directly related lecture is eligible; incomplete and unavailable are not", () => {
  assert.equal(buildGraphScopeSnapshot("philosophy", graph()).decisions[PHILOSOPHY_ARCHE_TERM_ID].status, "eligible");
  assert.equal(buildGraphScopeSnapshot("philosophy", graph("incomplete")).decisions[PHILOSOPHY_ARCHE_TERM_ID].status, "ineligible");
  assert.equal(buildGraphScopeSnapshot("philosophy", graph("completed", "unavailable")).decisions[PHILOSOPHY_ARCHE_TERM_ID].status, "unknown");
});

test("new and reused cards read persisted presentation and immutable revision", () => {
  const row = persisted();
  const issued = { instanceId, releaseId: row.release_id, revisionId };
  const card = philosophyCardFromPersisted(decodePhilosophyInstance(row, issued), "due");
  assert.equal(card.instanceId, instanceId);
  assert.equal(card.prompt, row.presentation.prompt);
  assert.equal(card.answer.type, "text");
  assert.equal(card.persistenceKind, "versioned-pilot");
  assert.equal(card.asset, undefined);
  const olderRevision = createExerciseRevision({ ...philosophyArcheDefinition, exerciseVersion: 2,
    prompt: "Persisted prior immutable prompt", front: "Persisted front" }, new Map(), null);
  const reusedPresentation = createPhilosophyPresentation(getExerciseRevisionPayload(olderRevision));
  const reused = persisted({ exercise_version: 2, revision_payload: getExerciseRevisionPayload(olderRevision),
    content_hash: olderRevision.contentHash, presentation: reusedPresentation,
    presentation_hash: hashPhilosophyPresentation(reusedPresentation) });
  assert.equal(philosophyCardFromPersisted(decodePhilosophyInstance(reused, issued), "unseen").prompt, reusedPresentation.prompt);
  assert.throws(() => decodePhilosophyInstance(row, { ...issued, releaseId: "candidate-not-persisted" }));
  assert.throws(() => decodePhilosophyInstance(persisted({ legacy_item_id: "wrong" })));
  assert.throws(() => decodePhilosophyInstance(persisted({ project_id: "kuzushiji" })));
  assert.throws(() => decodePhilosophyInstance(persisted({ revision_payload: { ...philosophyArcheRevisionPayload, answerSpec: { type: "text", acceptedAnswers: ["forged"] } } })));
  assert.throws(() => decodePhilosophyInstance(persisted({ presentation: { ...row.presentation, prompt: "tampered" } })));
});
