import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { studyUnits } from "./catalog.ts";
import { getUnitExercises, type UnitExercise } from "./registry.ts";
import { decodeUnitInstance, unitCardFromPersisted, unitPresentation } from "./core.ts";
import { gradeExerciseRevision } from "../exercises/attempt.ts";
import { canonicalizeJson, sha256Hex } from "../exercises/revision.ts";
import { validateExerciseDefinition } from "../exercises/validation.ts";
import type { ExerciseDefinition } from "../exercises/types.ts";
import type { ResolvedObjectiveInstanceArchive } from "../../supabase/objective-archive.ts";

function instance(unitId: string, entry: UnitExercise): ResolvedObjectiveInstanceArchive {
  const presentation = unitPresentation(unitId, entry);
  return {
    instance_id: "20000000-0000-4000-8000-000000000001", learner_id: "30000000-0000-4000-8000-000000000001",
    release_id: entry.contentRelease.manifestHash, revision_id: "40000000-0000-4000-8000-000000000001",
    project_id: entry.revision.projectId, exercise_id: entry.exerciseId, exercise_version: 1,
    revision_status: "approved", revision_payload: entry.revisionPayload, content_hash: entry.revision.contentHash,
    presentation, presentation_hash: sha256Hex(canonicalizeJson(presentation)),
    legacy_item_id: entry.scopeSubjectId, legacy_item_kind: entry.revision.projectId === "kuzushiji" ? "character" : "knowledge",
    legacy_exercise_id: entry.exerciseId, srs_target: "objective", srs_epoch: String(entry.srsEpoch),
  } as unknown as ResolvedObjectiveInstanceArchive;
}

for (const unit of studyUnits) {
  test(`${unit.id}: 5–10 complete, unique questions tied to Notion Scope`, () => {
    const entries = getUnitExercises(unit.id);
    assert.equal(entries.length, unit.questionCount);
    assert.ok(entries.length >= 5 && entries.length <= 10);
    assert.equal(new Set(entries.map((entry) => entry.exerciseId)).size, entries.length);
    for (const entry of entries) {
      const card = unitCardFromPersisted(decodeUnitInstance(instance(unit.id, entry)));
      assert.equal(card.projectId, unit.projectId);
      assert.ok(entry.revisionPayload.relatedKnowledgeBindings.some((binding) => binding.externalId === entry.scopeSubjectId));
      assert.ok(entry.revisionPayload.sources.some((source) => source.url === entry.scopeSubjectUrl));
      if (card.answer.type === "text") {
        assert.equal(gradeExerciseRevision(entry.revisionPayload, card.answer.acceptedAnswers[0]).isCorrect, true);
        assert.equal(gradeExerciseRevision(entry.revisionPayload, "意図的な誤答").isCorrect, false);
      } else assert.equal(card.answer.type, "self-evaluation");
    }
  });
}

test("rubric explanations do not fail exact text or keyword matching", () => {
  const explanations = studyUnits.flatMap((unit) => getUnitExercises(unit.id)).filter((entry) => entry.revisionPayload.explanation.rubric);
  assert.equal(explanations.length, 4);
  for (const entry of explanations) for (const answer of [entry.revisionPayload.explanation.rubric!.modelAnswer, "世界の共通の仕組みを、自然の側から考えた。", "意図的な誤答"]) {
    const graded = gradeExerciseRevision(entry.revisionPayload, answer);
    assert.equal(graded.gradingStatus, "ungraded");
    assert.equal(graded.isCorrect, null);
    assert.equal(graded.normalizedAnswer, null);
    assert.equal(graded.gradingStrategyId, "rubric-self-evaluation-v1");
  }
});

test("rubric content cannot silently fall back to an exact-match answer", () => {
  const entry = getUnitExercises("philosophy-arche-1")[3];
  const { visualAssets: _assets, canonicalizationVersion: _canonical, pilotMetadata: _metadata, scopeRequirements: _scope,
    prerequisites: _prerequisites, supersedes: _supersedes, changeReason: _change, ...definition } = entry.revisionPayload;
  assert.deepEqual(validateExerciseDefinition(definition as ExerciseDefinition, new Map()), []);
  const changed = structuredClone(definition) as ExerciseDefinition;
  changed.answerSpec.acceptedAnswers = ["一言一句一致する文"];
  assert.ok(validateExerciseDefinition(changed, new Map()).includes("rubric must not use exact-match answers"));
  changed.answerSpec.acceptedAnswers = [];
  changed.explanation.rubric!.majorMisconceptions = [];
  assert.ok(validateExerciseDefinition(changed, new Map()).includes("a complete self-evaluation rubric is required"));
});

test("six readable assets have distinct immutable bytes and attribution", () => {
  const entries = getUnitExercises("kuzushiji-kana-1");
  const assets = entries.map((entry) => entry.revisionPayload.visualAssets[0]);
  assert.equal(new Set(assets.map((asset) => asset.checksum)).size, 6);
  for (const asset of assets) {
    assert.ok(asset.width > 0 && asset.height > 0);
    assert.equal(asset.source.license, "CC BY-SA 4.0");
    assert.ok(asset.source.attribution.includes("10.20676/00000340"));
    assert.match(asset.source.originalFile!, /^https:\/\/codh\.rois\.ac\.jp\//);
    const data = readFileSync(new URL("../../../../public" + asset.src, import.meta.url));
    assert.equal("sha256:" + createHash("sha256").update(data).digest("hex"), asset.checksum);
  }
});

test("archived unit decoding rejects changed answers, presentation, identity and asset bytes", () => {
  const unitId = "kuzushiji-kana-1", entry = getUnitExercises(unitId)[0];
  const valid = instance(unitId, entry);
  assert.doesNotThrow(() => decodeUnitInstance(valid));
  for (const mutate of [
    (value: ResolvedObjectiveInstanceArchive) => { value.project_id = "philosophy"; },
    (value: ResolvedObjectiveInstanceArchive) => { value.exercise_id = "unsupported"; },
    (value: ResolvedObjectiveInstanceArchive) => { value.content_hash = "f".repeat(64); },
    (value: ResolvedObjectiveInstanceArchive) => { (value.presentation as Record<string, unknown>).prompt = "別の問題"; },
    (value: ResolvedObjectiveInstanceArchive) => { (value.revision_payload as unknown as UnitExercise["revisionPayload"]).answerSpec.acceptedAnswers = ["別の答え"]; },
    (value: ResolvedObjectiveInstanceArchive) => { (value.revision_payload as unknown as UnitExercise["revisionPayload"]).visualAssets[0].checksum = null; },
  ]) {
    const changed = structuredClone(valid); mutate(changed);
    assert.throws(() => decodeUnitInstance(changed), /invalid_authority_response/);
  }
});

test("existing immutable Philosophy and Art objectives are reused without rewriting their revisions", () => {
  assert.equal(getUnitExercises("philosophy-arche-1")[0].revision.contentHash, "912c2a4ef680477847ea3b801fce9e569e6b6f73c980980dd88cf1885a0424d1");
  assert.equal(getUnitExercises("art-prehistory-1")[0].revision.contentHash, "eb55d0e08bf4e0495b310a56f45878a8e59930988b72a99b779d5e85fd868745");
});
