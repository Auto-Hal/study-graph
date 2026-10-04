import assert from "node:assert/strict";
import { test } from "node:test";
import { prefetchKuzushijiOfflineInstance, createPilotOfflineFeedbackBundle } from "./pilot-prefetch.ts";
import { createPilotPresentation, hashPilotPresentation } from "../exercises/attempt.ts";
import { legacyKuzushijiExerciseId } from "../exercises/kuzushiji-adapter.ts";
import { KUZUSHIJI_PILOT_EXERCISE_ID, KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID } from "../exercises/kuzushiji-pilot.ts";
import { KUZUSHIJI_PILOT_OBJECTIVE_ID } from "../exercises/kuzushiji-objective.ts";
import { kuzushijiPilotRevisionV2, kuzushijiPilotRevisionV2Payload } from "../exercises/kuzushiji-revision.ts";
import { createOfflineAssetDescriptor } from "./model-core.ts";
import { PilotRpcError, prefetchKuzushijiPilotInstanceV2, type OfflinePrefetchInstanceV2 } from "../../supabase/pilot.ts";

const learner = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const device = "33333333-3333-4333-8333-333333333333";
const presentation = createPilotPresentation(kuzushijiPilotRevisionV2Payload);
const asset = kuzushijiPilotRevisionV2Payload.visualAssets[0];
function fixture(legacyId: string): OfflinePrefetchInstanceV2 {
  return {
    request_id: request, instance_id: "44444444-4444-4444-8444-444444444444",
    learner_id: learner, project_id: "kuzushiji", release_id: "fixture-release",
    revision_id: "55555555-5555-4555-8555-555555555555",
    revision_payload: kuzushijiPilotRevisionV2Payload,
    revision_content_hash: kuzushijiPilotRevisionV2.contentHash,
    presentation, presentation_hash: hashPilotPresentation(presentation),
    issued_at: "2026-10-01T00:00:00Z", scope_evidence: {},
    snapshot_id: "66666666-6666-4666-8666-666666666666", snapshot_generation: 1,
    objective_id: KUZUSHIJI_PILOT_OBJECTIVE_ID, objective_version: 1, srs_epoch: 1, evidence_use: "srs",
    legacy_item_id: KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID, legacy_exercise_id: legacyId,
    assets: [createOfflineAssetDescriptor({ ...asset, revisionContentHash: kuzushijiPilotRevisionV2.contentHash, offlineReady: false })],
    feedback: createPilotOfflineFeedbackBundle() as unknown as Record<string, unknown>,
    device_id: device, prefetched_at: "2026-10-01T00:00:01Z",
  };
}

test("offline decoder accepts only the two exact pilot identities while cutback recovery remains lookup-only", async () => {
  const savedEnv = { ...process.env }, savedFetch = globalThis.fetch;
  try {
    process.env.SUPABASE_URL = "https://isolated-fixture.invalid";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-fixture-only";
    process.env.STUDY_GRAPH_LEARNER_ID = learner;
    process.env.STUDY_GRAPH_PILOT_ISSUANCE_ENABLED = "false";
    process.env.NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED = "false";
    let current = fixture(KUZUSHIJI_PILOT_EXERCISE_ID), calls = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://isolated-fixture.invalid/rest/v1/rpc/study_graph_prefetch_kuzushiji_objective_instance_v2");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_create_if_missing, false);
      assert.equal(body.p_new_issuance_allowed, false);
      assert.equal(body.p_legacy_exercise_id, KUZUSHIJI_PILOT_EXERCISE_ID);
      calls++;
      return new Response(JSON.stringify([current]), { status: 200 });
    };
    const input = { issuanceRequestId: request, deviceId: device };
    const canonical = await prefetchKuzushijiOfflineInstance(input);
    current = fixture(legacyKuzushijiExerciseId(KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID));
    assert.deepEqual(await prefetchKuzushijiOfflineInstance(input), canonical);
    assert.equal(calls, 2, "one recovery RPC per invocation; no issuer call");
    for (const change of [
      { legacy_exercise_id: current.legacy_exercise_id + ":extra" },
      { legacy_exercise_id: "wrong-subject:visual-reading:eitaigura-u3042-00032-1:v1" },
      { legacy_exercise_id: null }, { legacy_item_id: "wrong-subject" },
      { project_id: "wrong-project" }, { objective_id: "wrong-objective" },
      { objective_version: 2 }, { srs_epoch: 2 }, { presentation_hash: "0".repeat(64) },
    ]) {
      current = { ...fixture(KUZUSHIJI_PILOT_EXERCISE_ID), ...change } as OfflinePrefetchInstanceV2;
      await assert.rejects(prefetchKuzushijiOfflineInstance(input), (error: unknown) => error instanceof PilotRpcError && error.code === "pilot_descriptor_mismatch");
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "offline_asset_integrity_unavailable" }), { status: 400 });
    await assert.rejects(prefetchKuzushijiPilotInstanceV2({ requestId: request, deviceId: device, createIfMissing: true, newIssuanceAllowed: true }), (error: unknown) => error instanceof PilotRpcError && error.status === 409 && error.code === "offline_asset_integrity_unavailable");
  } finally {
    globalThis.fetch = savedFetch;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
  }
});
