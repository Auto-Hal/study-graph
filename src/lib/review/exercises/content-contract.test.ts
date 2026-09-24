import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeContentReleaseManifest,
  canonicalizeExerciseRevision,
  canonicalizeJson,
  createContentRelease,
  createContentReleaseManifest,
  createExerciseRevision,
  getExerciseRevisionPayload,
  hashContentReleaseManifest,
} from "./revision.ts";
import { gradeExerciseRevision } from "./attempt.ts";
import { kuzushijiPilotContentRelease, kuzushijiPilotContentReleaseV2, kuzushijiPilotRevision, kuzushijiPilotRevisionV2 } from "./kuzushiji-revision.ts";
import { kuzushijiPilotAsset, kuzushijiPilotExercise, kuzushijiPilotAssets } from "./kuzushiji-pilot.ts";
import { kuzushijiBaselineGoldens } from "./test-fixtures/kuzushiji-baseline-goldens.ts";
import type { VisualAsset, VisualAssetSource } from "./types.ts";
import { validateExerciseDefinition } from "./validation.ts";
import {
  philosophyArcheContentRelease,
  philosophyArcheDefinition,
  philosophyArcheManifest,
  philosophyArcheRevision,
  philosophyTestTextReferenceSource,
} from "./test-fixtures/philosophy-arche.ts";

const textSource = philosophyTestTextReferenceSource;
const philosophyFixture = {
  definition: philosophyArcheDefinition,
  revision: philosophyArcheRevision,
  manifest: philosophyArcheManifest,
  contentRelease: philosophyArcheContentRelease,
};
// @ts-expect-error A text reference cannot replace a licensed image source.
const invalidVisualSource: VisualAssetSource = textSource;
void invalidVisualSource;

test("approved Kuzushiji v1/v2 payload and release bytes remain exact", () => {
  const actual = {
    v1: {
      payload: canonicalizeJson(getExerciseRevisionPayload(kuzushijiPilotRevision)),
      hashInput: canonicalizeExerciseRevision(kuzushijiPilotRevision),
      contentHash: kuzushijiPilotRevision.contentHash,
      manifest: canonicalizeContentReleaseManifest(kuzushijiPilotContentRelease.manifest),
      manifestHash: kuzushijiPilotContentRelease.manifestHash,
    },
    v2: {
      payload: canonicalizeJson(getExerciseRevisionPayload(kuzushijiPilotRevisionV2)),
      hashInput: canonicalizeExerciseRevision(kuzushijiPilotRevisionV2),
      contentHash: kuzushijiPilotRevisionV2.contentHash,
      manifest: canonicalizeContentReleaseManifest(kuzushijiPilotContentReleaseV2.manifest),
      manifestHash: kuzushijiPilotContentReleaseV2.manifestHash,
    },
  };
  assert.deepEqual(actual, kuzushijiBaselineGoldens);
  for (const version of ["v1", "v2"] as const) {
    for (const field of ["payload", "hashInput", "manifest"] as const) {
      assert.deepEqual(Buffer.from(actual[version][field], "utf8"), Buffer.from(kuzushijiBaselineGoldens[version][field], "utf8"));
    }
  }
  assert.equal(actual.v1.contentHash, "675e22c5ea7f3288dceb4b0c89a6a10d9624b9dd1de59c835a46e3eb07799594");
  assert.equal(actual.v2.contentHash, "fca3edc54f17aa731c53cedd1130ff83d51a318ee07696c3310129f67a8db86d");
  assert.equal(actual.v1.manifestHash, "09eb84df83abede6be3a9164105bd8cdf7c48775fdb6c13bca50d4b71df71c60");
  assert.equal(actual.v2.manifestHash, "a6346dcb6b1b7a6df890f032ec3974e0c95ac3e631367ab022707d09c6357446");
});

test("Philosophy text-only fixture uses the supported builder chain", () => {
  const fixture = philosophyFixture;
  assert.equal(fixture.revision.pilotMetadata, null);
  assert.equal(fixture.revision.stimuli.length, 0);
  assert.equal(fixture.revision.visualAssets.length, 0);
  assert.equal(fixture.manifest.revisionEntries[0].assets.length, 0);
  assert.equal(fixture.contentRelease.manifestHash, hashContentReleaseManifest(fixture.manifest));
  const correct = gradeExerciseRevision(getExerciseRevisionPayload(fixture.revision), "アペイロン");
  const incorrect = gradeExerciseRevision(getExerciseRevisionPayload(fixture.revision), "タレス");
  assert.equal(correct.gradingStatus, "graded");
  assert.equal(correct.isCorrect, true);
  assert.equal(incorrect.gradingStatus, "graded");
  assert.equal(incorrect.isCorrect, false);
});

test("Kuzushiji identity requires its historical metadata and neutral identities require null", () => {
  const fixture = philosophyFixture;
  const historicalMetadata = kuzushijiPilotRevision.pilotMetadata;
  assert.throws(() => createExerciseRevision(fixture.definition, new Map(), historicalMetadata), /non-Kuzushiji/);
  assert.throws(() => Reflect.apply(createExerciseRevision, null, [fixture.definition, new Map(), undefined]), /pilotMetadata/);

  const kuzushijiDefinition = {
    ...fixture.definition,
    projectId: "kuzushiji",
    exerciseId: "kuzushiji.visual-reading.eitaigura-u3042-00032-1",
  };
  for (const metadata of [
    null,
    undefined,
    { motherCharacter: { value: "別", status: "legacy-approved", approvedFrom: "PR #27" } },
    { motherCharacter: { value: "阿", status: "draft", approvedFrom: "PR #27" } },
    { motherCharacter: { value: "阿", status: "legacy-approved", approvedFrom: "manual-curation" } },
    { motherCharacter: {} },
    {},
  ]) {
    assert.throws(() => Reflect.apply(createExerciseRevision, null, [kuzushijiDefinition, new Map(), metadata]), /Kuzushiji pilot/);
  }
  assert.equal(kuzushijiPilotRevision.pilotMetadata?.motherCharacter.value, "阿");
});

test("source validation distinguishes licensed and text-reference sources", () => {
  const fixture = philosophyFixture;
  const missingTitle = { ...fixture.definition, sources: [{ ...textSource, title: "" }] };
  const missingUrl = { ...fixture.definition, sources: [{ ...textSource, url: "" }] };
  const missingAttribution = { ...fixture.definition, sources: [{ ...textSource, attribution: "" }] };
  assert.match(validateExerciseDefinition(missingTitle, new Map()).join(";"), /sources\[0\]\.title/);
  assert.match(validateExerciseDefinition(missingUrl, new Map()).join(";"), /sources\[0\]\.url/);
  assert.match(validateExerciseDefinition(missingAttribution, new Map()).join(";"), /sources\[0\]\.attribution/);
  const licensedWithoutLicense = { ...fixture.definition, sources: [{ title: "licensed", url: "https://example.invalid", attribution: "test" }] };
  assert.match(Reflect.apply(validateExerciseDefinition, null, [licensedWithoutLicense, new Map()]).join(";"), /sources\[0\]\.license/);
  const invalidKind = { ...fixture.definition, sources: [{ ...textSource, kind: "visual" }] };
  assert.match(Reflect.apply(validateExerciseDefinition, null, [invalidKind, new Map()]).join(";"), /sources\[0\]\.kind/);
  const textWithLicense = { ...fixture.definition, sources: [{ ...textSource, license: "not-a-visual-license" }] };
  assert.match(Reflect.apply(validateExerciseDefinition, null, [textWithLicense, new Map()]).join(";"), /sources\[0\]\.license/);
  assert.deepEqual(validateExerciseDefinition(kuzushijiPilotExercise, kuzushijiPilotAssets), []);
  const assetWithTextSource = { ...kuzushijiPilotAsset, source: textSource };
  const malformedAssets = new Map([[kuzushijiPilotAsset.assetId, assetWithTextSource]]);
  assert.match(Reflect.apply(validateExerciseDefinition, null, [kuzushijiPilotExercise, malformedAssets]).join(";"), /asset source must be a licensed source/);
});

test("empty release entries remain invalid while zero-asset entries are valid", () => {
  const fixture = philosophyFixture;
  assert.throws(() => createContentReleaseManifest([]), /at least one revision entry/);
  assert.equal(fixture.manifest.revisionEntries[0].assets.length, 0);
  const invalidAssetManifest = {
    ...fixture.manifest,
    revisionEntries: [{ ...fixture.manifest.revisionEntries[0], assets: [{ assetId: "x", assetVersion: 1, src: "", checksum: null }] }],
  };
  assert.throws(() => createContentRelease(invalidAssetManifest), /assets\[0\]\.src/);
  for (const assets of [null, undefined, "not-an-array"]) {
    const malformed = {
      ...fixture.manifest,
      revisionEntries: [{ ...fixture.manifest.revisionEntries[0], assets }],
    };
    assert.throws(() => Reflect.apply(createContentRelease, null, [malformed]), /assets must be an array/);
  }
});
