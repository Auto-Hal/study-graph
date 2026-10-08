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
  assert.equal(explanations.length, 9);
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

test("all 19 earlier questions retain their immutable hashes after the next units are added", () => {
  const expected = [
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3042-1",
    "hash": "3bc6d6fc97a60fe1df410f9f15393dcd2511c72a55cd557ad84cccac6efe2f16"
  },
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3044-1",
    "hash": "ea77e7a4c05a1ffa19dd8d4abfd553c542bd17c1b8dbfa2e16b45f4e7c16cf25"
  },
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3046-1",
    "hash": "bdddcdef16dfb78d82302860d283ee1de2ec58c451b5a198cb1cb2ce5c057eca"
  },
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3044-2",
    "hash": "3f50098559857aa4ce2cad4112210da32e4d985d104099c05be69b0dd866a6aa"
  },
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3042-2",
    "hash": "07987704b92ab8203f5563d6b4ff1f2a0cde3224fe8fb05ea9fdde53d237927d"
  },
  {
    "unit": "kuzushiji-kana-1",
    "id": "kuzushiji.unit-reading.eitaigura-u3046-2",
    "hash": "384bdeddf390b92d0b1490f9c95ca13d6069f4f8faae630d205d55d189f0dd57"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.paleolithic.period-recall",
    "hash": "eb55d0e08bf4e0495b310a56f45878a8e59930988b72a99b779d5e85fd868745"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.exaggeration.term-recall",
    "hash": "d047eb7baa5f3613bbdddf6da1fd148dbf64685fa0d06289117be57d0d3c6ca6"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.abstraction.term-recall",
    "hash": "5b7235c2351098ece56bdddb429db49d2c38f6bf1aec6f38556e7e58c26d5354"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.unit.lascaux-country",
    "hash": "12bb736f98998b86f65ab2d17c7aaba812509fbd3567b3f7311a78b2a92e1ff4"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.unit.altamira-country",
    "hash": "d9d7d26da1fa4e3c072a1e00c71fe724501fa48ce75cead5f79a78060eb737f9"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.unit.venus-material",
    "hash": "08f856635b3f3c794588ff5aa849c018caea2a2264f9196ab4b9293b22ba9d2f"
  },
  {
    "unit": "art-prehistory-1",
    "id": "western-art-history.unit.venus-interpretation",
    "hash": "f216553e888481fe96c2b74d506657e45d7ab161204ff0bff600054b5b01d15d"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.thales.arche-recall",
    "hash": "912c2a4ef680477847ea3b801fce9e569e6b6f73c980980dd88cf1885a0424d1"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.anaximander.arche-recall",
    "hash": "e447af0932b075e2b57cc6ce200cfc499ef4f6dd002196ee4ceb9a9bbfc27318"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.anaximenes.arche-recall",
    "hash": "8890890620cf98838bf698af8fb5cf7bbc3f52a4d54c42e2e40f5234c5233898"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.unit.thales-explanation",
    "hash": "fc05d5e5724b261e9e6f28a7222235fe384d26ee0a86bb65c6d1a27ee443a6a8"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.unit.apeiron-comparison",
    "hash": "089f037845c85900fc5ecbbed2782ce9d5cc8e43eb40c9f2d5bebaed0dddd606"
  },
  {
    "unit": "philosophy-arche-1",
    "id": "philosophy.unit.anaximenes-change",
    "hash": "1d9e27a9fe281c142f19bf1fa5cb0dd77e47e3f8b00607f8f4d4910198002ffb"
  }
];
  for (const e of expected) assert.equal(getUnitExercises(e.unit).find(q => q.exerciseId === e.id)?.revision.contentHash, e.hash);
});

test("comparison examples are distinct, same-reading, secondary stimuli preserved in the archived card", () => {
  for (const entry of getUnitExercises("kuzushiji-kana-2")) {
    const card = unitCardFromPersisted(decodeUnitInstance(instance("kuzushiji-kana-2", entry)));
    assert.equal(card.comparisonAssets?.length, 1);
    assert.notEqual(card.asset?.src, card.comparisonAssets![0].src);
    assert.equal(entry.revisionPayload.stimuli[1].role, "secondary");
    assert.notEqual(entry.revisionPayload.visualAssets[0].checksum, entry.revisionPayload.visualAssets[1].checksum);
    for (const asset of entry.revisionPayload.visualAssets) {
      const bytes = readFileSync(new URL("../../../../public" + asset.src, import.meta.url));
      assert.equal("sha256:" + createHash("sha256").update(bytes).digest("hex"), asset.checksum);
    }
  }
});

test("art picture has immutable licensed bytes without a visible answer in its title or caption", () => {
  const entry = getUnitExercises("art-megaliths-2")[0];
  const card = unitCardFromPersisted(decodeUnitInstance(instance("art-megaliths-2", entry)));
  assert.equal(card.kindLabel, "画像を見て短答");
  assert.doesNotMatch(card.front + card.asset!.alt + card.asset!.attribution, /ストーンヘンジ|Stonehenge/i);
  const asset = entry.revisionPayload.visualAssets[0];
  assert.equal(asset.source.license, "CC BY 2.0");
  assert.equal("sha256:" + createHash("sha256").update(readFileSync(new URL("../../../../public" + asset.src, import.meta.url))).digest("hex"), asset.checksum);
  assert.ok(entry.revisionPayload.sources.some(s => s.url.includes("english-heritage.org.uk")));
});
