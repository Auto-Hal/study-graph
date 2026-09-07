import assert from "node:assert/strict";
import test from "node:test";
import { createKuzushijiPilotReviewCard } from "./kuzushiji-adapter.ts";
import { kuzushijiPilotContentRelease, kuzushijiPilotContentReleaseManifest, kuzushijiPilotRevision, kuzushijiPilotRevisionPayload } from "./kuzushiji-revision.ts";
import {
  canonicalizeContentReleaseManifest,
  canonicalizeExerciseRevision,
  canonicalizeJson,
  createContentRelease,
  findRevisionIdentityConflict,
  hashContentReleaseManifest,
  hashExerciseRevision,
  type ContentReleaseManifest,
  type ExerciseRevision,
} from "./revision.ts";

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function revisionCopy() {
  return copy(kuzushijiPilotRevision);
}

test("the same revision payload always produces the same canonical string and hash", () => {
  const first = revisionCopy();
  const second = revisionCopy();
  assert.equal(canonicalizeExerciseRevision(first), canonicalizeExerciseRevision(second));
  assert.equal(hashExerciseRevision(first), hashExerciseRevision(second));
});

test("object key order is ignored while array order is preserved", () => {
  const original = revisionCopy();
  const reordered = Object.fromEntries(Object.entries(original).reverse()) as ExerciseRevision;
  assert.equal(hashExerciseRevision(original), hashExerciseRevision(reordered));

  const sourceA = copy(original.sources[0]);
  const sourceB = { ...sourceA, title: "補助出典" };
  const first = { ...original, sources: [sourceA, sourceB] };
  const second = { ...original, sources: [sourceB, sourceA] };
  assert.notEqual(hashExerciseRevision(first), hashExerciseRevision(second));
});

test("undefined and non-finite values are rejected without changing strings", () => {
  assert.equal(canonicalizeJson({ value: "ａ" }), '{"value":"ａ"}');
  assert.throws(() => canonicalizeJson({ value: undefined }), /undefined/);
  assert.throws(() => canonicalizeJson({ value: Number.NaN }), /Non-finite/);
  assert.throws(() => canonicalizeJson({ value: Number.POSITIVE_INFINITY }), /Non-finite/);
});

test("prompt, answer, source, provenance, mother annotation, and asset changes alter the revision hash", () => {
  const baseHash = hashExerciseRevision(kuzushijiPilotRevision);

  const prompt = revisionCopy();
  prompt.prompt = "別の問題文";
  assert.notEqual(hashExerciseRevision(prompt), baseHash);

  const answer = revisionCopy();
  answer.answerSpec.acceptedAnswers = ["い"];
  assert.notEqual(hashExerciseRevision(answer), baseHash);

  const source = revisionCopy();
  source.sources[0].url = "https://example.invalid/changed";
  assert.notEqual(hashExerciseRevision(source), baseHash);

  const provenance = revisionCopy();
  provenance.provenance.note = "出典説明の訂正";
  assert.notEqual(hashExerciseRevision(provenance), baseHash);

  const mother = revisionCopy();
  mother.pilotMetadata.motherCharacter.value = "別の字母";
  assert.notEqual(hashExerciseRevision(mother), baseHash);

  const asset = revisionCopy();
  asset.visualAssets[0].src = "/assets/kuzushiji/changed.png";
  assert.notEqual(hashExerciseRevision(asset), baseHash);

  const versioning = revisionCopy();
  versioning.changeReason = "訂正理由";
  versioning.supersedes = "kuzushiji.visual-reading.eitaigura-u3042-00032-1:v0";
  assert.notEqual(hashExerciseRevision(versioning), baseHash);

  const scope = revisionCopy();
  scope.scopeRequirements = { source: "notion", directRelation: true };
  scope.prerequisites = ["kuzushiji.reading.basic"];
  scope.relatedKnowledgeBindings = [{ source: "notion", externalId: "character-a", role: "scope-subject" }];
  assert.notEqual(hashExerciseRevision(scope), baseHash);
});

test("archive metadata, contentHash itself, and release metadata are outside revision contentHash", () => {
  const baseHash = hashExerciseRevision(kuzushijiPilotRevision);
  const withMetadata = {
    ...revisionCopy(),
    contentHash: "0".repeat(64),
    archiveMetadata: {
      registeredAt: "2030-01-02T03:04:05Z",
      sourceGitSha: "deadbeef",
      releaseId: "release-test",
      quarantineStatus: "quarantined",
    },
  };
  assert.equal(hashExerciseRevision(withMetadata), baseHash);
});

test("a revision identity collision is detected only when content differs", () => {
  const existing = {
    projectId: kuzushijiPilotRevision.projectId,
    exerciseId: kuzushijiPilotRevision.exerciseId,
    exerciseVersion: kuzushijiPilotRevision.exerciseVersion,
    contentHash: kuzushijiPilotRevision.contentHash,
  };
  const same = { ...existing };
  const changed = { ...existing, contentHash: "f".repeat(64) };
  const otherVersion = { ...changed, exerciseVersion: existing.exerciseVersion + 1 };
  assert.equal(findRevisionIdentityConflict(existing, same), null);
  assert.ok(findRevisionIdentityConflict(existing, changed));
  assert.equal(findRevisionIdentityConflict(existing, otherVersion), null);
});

test("the pilot keeps 阿 as legacy-approved metadata from PR #27", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(kuzushijiPilotRevisionPayload, "contentHash"), false);
  assert.equal(Object.isFrozen(kuzushijiPilotRevision), true);
  assert.equal(Object.isFrozen(kuzushijiPilotRevisionPayload), true);
  assert.equal(kuzushijiPilotRevision.pilotMetadata.motherCharacter.value, "阿");
  assert.equal(kuzushijiPilotRevision.pilotMetadata.motherCharacter.status, "legacy-approved");
  assert.equal(kuzushijiPilotRevision.pilotMetadata.motherCharacter.approvedFrom, "PR #27");
  assert.equal(kuzushijiPilotRevision.objectiveId, "kuzushiji.a.eitaigura-u3042-00032-1.read");
  assert.equal(kuzushijiPilotRevision.exerciseVersion, 1);
});

test("the Phase 4A adapter contract remains unchanged", () => {
  const card = createKuzushijiPilotReviewCard(
    { id: "character-a" },
    {
      id: "character-a",
      url: "#",
      glyph: "あ",
      reading: "あ",
      mother: "Notion側の値",
      category: "ひらがな",
      mastery: "学習中",
      importance: "通常",
      errorCount: 0,
      lastReviewedAt: null,
    },
    { id: "character-a", kind: "character", label: "あ", reason: "pilot" },
  );
  assert.ok(card);
  assert.equal(card.id, "character-a");
  assert.equal(card.exerciseId, "character-a:visual-reading:eitaigura-u3042-00032-1:v1");
  assert.equal(card.answer.type, "text");
  assert.deepEqual(card.answer.acceptedAnswers, ["あ"]);
  assert.equal(card.asset?.src, "/assets/kuzushiji/a-eitaigura-hires.png");
  assert.equal(card.answerRows.find((row) => row.label === "字母")?.value, "阿");
});

test("the manifest hash is deterministic and revision entry changes are visible", () => {
  const first = copy(kuzushijiPilotContentReleaseManifest);
  const second = copy(kuzushijiPilotContentReleaseManifest);
  assert.equal(canonicalizeContentReleaseManifest(first), canonicalizeContentReleaseManifest(second));
  assert.equal(hashContentReleaseManifest(first), kuzushijiPilotContentRelease.manifestHash);
  const releaseWithProvenance = createContentRelease(first, { sourceGitSha: "source-sha" });
  assert.equal(releaseWithProvenance.manifestHash, kuzushijiPilotContentRelease.manifestHash);
  assert.equal(releaseWithProvenance.provenance?.sourceGitSha, "source-sha");

  const changed: ContentReleaseManifest = {
    ...first,
    revisionEntries: [{
      ...first.revisionEntries[0],
      contentHash: "e".repeat(64),
    }],
  };
  assert.notEqual(hashContentReleaseManifest(changed), kuzushijiPilotContentRelease.manifestHash);
});
