import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM,
  kuzushijiPilotAsset,
  kuzushijiPilotAssetV2,
  kuzushijiPilotExercise,
  kuzushijiPilotExerciseV2,
} from "./kuzushiji-pilot.ts";
import {
  kuzushijiPilotContentRelease,
  kuzushijiPilotContentReleaseV2,
  kuzushijiPilotRevision,
  kuzushijiPilotRevisionV2,
} from "./kuzushiji-revision.ts";
import {
  KUZUSHIJI_PILOT_OBJECTIVE_ID,
  KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  KUZUSHIJI_PILOT_SRS_EPOCH,
  kuzushijiPilotV2ObjectiveBinding,
} from "./kuzushiji-objective.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("the v2 checksum is the SHA-256 of the repository asset bytes", () => {
  const path = resolve(root, "public/assets/kuzushiji/a-eitaigura-hires.png");
  const checksum = createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(checksum, KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM);
});

test("v1 remains immutable while v2 pins the same semantic pilot", () => {
  assert.equal(kuzushijiPilotAsset.checksum, null);
  assert.equal(kuzushijiPilotAssetV2.assetVersion, 2);
  assert.equal(kuzushijiPilotAssetV2.checksum, KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM);
  assert.notEqual(kuzushijiPilotRevisionV2.contentHash, kuzushijiPilotRevision.contentHash);
  assert.equal(kuzushijiPilotRevision.contentHash, "675e22c5ea7f3288dceb4b0c89a6a10d9624b9dd1de59c835a46e3eb07799594");
  assert.equal(kuzushijiPilotContentRelease.manifestHash, "09eb84df83abede6be3a9164105bd8cdf7c48775fdb6c13bca50d4b71df71c60");
  assert.equal(kuzushijiPilotRevisionV2.contentHash, "fca3edc54f17aa731c53cedd1130ff83d51a318ee07696c3310129f67a8db86d");
  assert.equal(kuzushijiPilotContentReleaseV2.manifestHash, "a6346dcb6b1b7a6df890f032ec3974e0c95ac3e631367ab022707d09c6357446");
  assert.equal(kuzushijiPilotExerciseV2.prompt, kuzushijiPilotExercise.prompt);
  assert.equal(kuzushijiPilotExerciseV2.front, kuzushijiPilotExercise.front);
  assert.deepEqual(kuzushijiPilotExerciseV2.answerSpec, kuzushijiPilotExercise.answerSpec);
  assert.equal(kuzushijiPilotExerciseV2.objectiveId, KUZUSHIJI_PILOT_OBJECTIVE_ID);
  assert.equal(kuzushijiPilotRevisionV2.objectiveId, kuzushijiPilotRevision.objectiveId);
  assert.equal(kuzushijiPilotV2ObjectiveBinding.objectiveId, KUZUSHIJI_PILOT_OBJECTIVE_ID);
  assert.equal(kuzushijiPilotV2ObjectiveBinding.objectiveVersion, KUZUSHIJI_PILOT_OBJECTIVE_VERSION);
  assert.equal(KUZUSHIJI_PILOT_SRS_EPOCH, 1);
});
