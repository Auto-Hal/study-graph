import "server-only";

import { createPilotPresentation, hashPilotPresentation } from "../exercises/attempt.ts";
import {
  KUZUSHIJI_PILOT_EXERCISE_ID,
  KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,
} from "../exercises/kuzushiji-pilot.ts";
import {
  KUZUSHIJI_PILOT_OBJECTIVE_ID,
  KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  KUZUSHIJI_PILOT_SRS_EPOCH,
} from "../exercises/kuzushiji-objective.ts";
import {
  kuzushijiPilotRevision,
  kuzushijiPilotRevisionPayload,
  kuzushijiPilotRevisionV2,
  kuzushijiPilotRevisionV2Payload,
} from "../exercises/kuzushiji-revision.ts";
import type { ExerciseRevisionPayload } from "../exercises/revision.ts";
import {
  assertValidOfflinePilotFeedbackBundle,
  assertValidOfflineAssetDescriptor,
  assertValidServerIssuedOfflineInstance,
  createOfflineAssetDescriptor,
  createOfflinePilotFeedbackBundle,
  freezeServerIssuedOfflineInstance,
  deepFreeze,
  type OfflineAssetDescriptor,
  type IssuanceScopeEvidence,
  type OfflinePilotFeedbackBundleV1,
  type ServerIssuedOfflineInstance,
} from "./model-core.ts";
import { getCurrentScopeKnowledgeSnapshotModel } from "../../supabase/snapshots.ts";
import {
  ensureKuzushijiPilotOfflineArchive,
  getPilotRuntimeConfig,
  PilotRpcError,
  prefetchKuzushijiPilotInstanceV2,
  type OfflinePrefetchInstanceV2,
} from "../../supabase/pilot.ts";
import { isPilotIssuanceEnabled } from "../pilot-operations.ts";
import { newObjectiveIssuanceVersion } from "../objective-runtime.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";
import { canonicalizeJson } from "../canonical-json.ts";
import {
  selectPilotCharacterFromSnapshot,
  type SnapshotPilotCharacter,
} from "./pilot-scope.ts";

export const PILOT_PREFETCH_PROJECT_ID = "kuzushiji" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function selectEligiblePilotCharacter(snapshot: ScopeKnowledgeSnapshot): SnapshotPilotCharacter {
  try {
    return selectPilotCharacterFromSnapshot(snapshot);
  } catch {
    throw new PilotRpcError("pilot_scope_not_eligible", 409, "pilot_scope_not_eligible");
  }
}

function buildIssuanceEvidence(snapshot: ScopeKnowledgeSnapshot, characterId: string): IssuanceScopeEvidence {
  const decision = snapshot.scopeDecisions.find((entry) => entry.subjectId === characterId);
  if (!decision || decision.status !== "eligible") {
    throw new PilotRpcError("pilot_scope_not_eligible", 409, "pilot_scope_not_eligible");
  }
  return {
    authority: "server-issuance",
    snapshotId: snapshot.snapshotId,
    sourceReadStartedAt: snapshot.sourceReadStartedAt,
    sourceReadCompletedAt: snapshot.sourceReadCompletedAt,
    status: decision.status,
    reasonCodes: [...decision.reasonCodes],
    complete: snapshot.sourceEvidence.paginationComplete && snapshot.sourceEvidence.relationCompleteness,
  };
}

function feedbackForRevision(revision: ExerciseRevisionPayload, contentHash: string): OfflinePilotFeedbackBundleV1 {
  if (revision.answerSpec.type !== "text" || !revision.pilotMetadata) {
    throw new PilotRpcError("unsupported_pilot_feedback", 503, "unsupported_pilot_feedback");
  }
  const bundle = createOfflinePilotFeedbackBundle({
    revisionContentHash: contentHash,
    acceptedAnswers: revision.answerSpec.acceptedAnswers,
    answerRows: [
      { label: "正解", value: revision.answerSpec.acceptedAnswers[0] ?? "" },
      { label: "字母", value: revision.pilotMetadata.motherCharacter.value },
      { label: "学習ポイント", value: revision.explanation.summary },
    ],
  });
  assertValidOfflinePilotFeedbackBundle(bundle);
  return bundle;
}

/** Historical export retained for Phase 4E callers and regression tests. */
export function createPilotOfflineFeedbackBundle(): OfflinePilotFeedbackBundleV1 {
  return feedbackForRevision(kuzushijiPilotRevisionV2Payload, kuzushijiPilotRevisionV2.contentHash);
}

function sameJson(left: unknown, right: unknown) {
  try {
    return canonicalizeJson(left) === canonicalizeJson(right);
  } catch {
    return false;
  }
}

function mismatch(): never {
  throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
}

function selectedRevision(row: OfflinePrefetchInstanceV2): ExerciseRevisionPayload {
  for (const historical of [
    { hash: kuzushijiPilotRevision.contentHash, payload: kuzushijiPilotRevisionPayload },
    { hash: kuzushijiPilotRevisionV2.contentHash, payload: kuzushijiPilotRevisionV2Payload },
  ]) {
    if (row.revision_content_hash === historical.hash && sameJson(row.revision_payload, historical.payload)) {
      return historical.payload;
    }
  }
  return mismatch();
}

function decodePersistedPrefetchRow(row: OfflinePrefetchInstanceV2, input: {
  requestId: string;
  deviceId: string;
  learnerId: string;
}): { descriptor: ServerIssuedOfflineInstance; feedback: OfflinePilotFeedbackBundleV1 } {
  const revision = selectedRevision(row);
  const presentation = createPilotPresentation(revision);
  const asset = revision.visualAssets[0];
  if (!asset) return mismatch();
  const expectedAsset = createOfflineAssetDescriptor({
    assetId: asset.assetId,
    assetVersion: asset.assetVersion,
    src: asset.src,
    checksum: asset.checksum,
    revisionContentHash: row.revision_content_hash,
    mediaType: asset.mediaType,
    width: asset.width,
    height: asset.height,
    source: asset.source,
    offlineReady: false,
  });
  const expectedFeedback = feedbackForRevision(revision, row.revision_content_hash);
  if (
    row.request_id !== input.requestId
    || !UUID_PATTERN.test(row.instance_id)
    || row.learner_id !== input.learnerId
    || row.project_id !== PILOT_PREFETCH_PROJECT_ID
    || row.objective_id !== KUZUSHIJI_PILOT_OBJECTIVE_ID
    || row.objective_version !== KUZUSHIJI_PILOT_OBJECTIVE_VERSION
    || row.srs_epoch !== KUZUSHIJI_PILOT_SRS_EPOCH
    || row.evidence_use !== "srs"
    || row.legacy_item_id !== KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID
    || row.legacy_exercise_id !== KUZUSHIJI_PILOT_EXERCISE_ID
    || !UUID_PATTERN.test(row.revision_id)
    || row.release_id.length === 0
    || row.device_id !== input.deviceId
    || !UUID_PATTERN.test(row.snapshot_id ?? "")
    || !Number.isSafeInteger(row.snapshot_generation)
    || (row.snapshot_generation ?? 0) <= 0
    || !sameJson(row.presentation, presentation)
    || row.presentation_hash !== hashPilotPresentation(presentation)
    || !Array.isArray(row.assets)
    || row.assets.length !== 1
    || !sameJson(row.assets[0], expectedAsset)
    || !sameJson(row.feedback, expectedFeedback)
    || typeof row.scope_evidence !== "object" || row.scope_evidence === null || Array.isArray(row.scope_evidence)
  ) return mismatch();
  const actualAsset = row.assets[0];
  try {
    assertValidOfflineAssetDescriptor(actualAsset);
    assertValidOfflinePilotFeedbackBundle(row.feedback);
  } catch {
    return mismatch();
  }
  const assets: OfflineAssetDescriptor[] = deepFreeze([actualAsset]);
  const descriptor = freezeServerIssuedOfflineInstance({
    descriptorVersion: 1,
    instanceId: row.instance_id,
    learnerId: row.learner_id,
    projectId: row.project_id,
    revision: { revisionId: row.revision_id, revisionContentHash: row.revision_content_hash },
    presentation,
    presentationHash: row.presentation_hash,
    issuedAt: row.issued_at,
    scopeSnapshot: { snapshotId: row.snapshot_id!, generation: row.snapshot_generation! },
    objectiveId: row.objective_id,
    objectiveVersion: row.objective_version,
    srsEpoch: row.srs_epoch,
    evidenceUse: row.evidence_use,
    assets,
    delivery: { deviceId: row.device_id, prefetchedAt: row.prefetched_at },
  });
  try {
    assertValidServerIssuedOfflineInstance(descriptor);
  } catch {
    return mismatch();
  }
  return { descriptor, feedback: expectedFeedback };
}

/** Recovery is independent of current flags, archive candidates and Scope. */
export async function prefetchKuzushijiOfflineInstance(input: {
  deviceId: string;
  issuanceRequestId: string;
}): Promise<{ descriptor: ServerIssuedOfflineInstance; feedback: OfflinePilotFeedbackBundleV1 }> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const recover = () => prefetchKuzushijiPilotInstanceV2({
    requestId: input.issuanceRequestId,
    deviceId: input.deviceId,
    createIfMissing: false,
    newIssuanceAllowed: false,
  });
  const recovery = await recover();
  if (recovery) return decodePersistedPrefetchRow(recovery, {
    requestId: input.issuanceRequestId, deviceId: input.deviceId, learnerId: config.learnerId,
  });

  try {
    if (!isPilotIssuanceEnabled() || newObjectiveIssuanceVersion() !== "v2") {
      throw new PilotRpcError("pilot_issuance_disabled", 409, "pilot_issuance_disabled");
    }
    const archive = await ensureKuzushijiPilotOfflineArchive();
    const presentation = createPilotPresentation(kuzushijiPilotRevisionV2Payload);
    const snapshot = await getCurrentScopeKnowledgeSnapshotModel(PILOT_PREFETCH_PROJECT_ID);
    if (!snapshot || !snapshot.sourceEvidence.paginationComplete || !snapshot.sourceEvidence.relationCompleteness) {
      throw new PilotRpcError("pilot_scope_not_eligible", 409, "pilot_scope_not_eligible");
    }
    const character = selectEligiblePilotCharacter(snapshot);
    const evidence = buildIssuanceEvidence(snapshot, character.id);
    const row = await prefetchKuzushijiPilotInstanceV2({
      requestId: input.issuanceRequestId,
      deviceId: input.deviceId,
      createIfMissing: true,
      newIssuanceAllowed: true,
      releaseId: archive.releaseId,
      revisionId: archive.revisionId,
      snapshotId: snapshot.snapshotId,
      snapshotGeneration: snapshot.generation,
      presentation,
      presentationHash: hashPilotPresentation(presentation),
      scopeEvidence: evidence,
      legacyItemId: character.id,
    });
    if (!row) return mismatch();
    return decodePersistedPrefetchRow(row, {
      requestId: input.issuanceRequestId, deviceId: input.deviceId, learnerId: config.learnerId,
    });
  } catch (error) {
    // Another invocation may have committed this exact request while this one
    // was preparing its candidate. This is a lookup only, never a reissue.
    try {
      const committed = await recover();
      if (committed) return decodePersistedPrefetchRow(committed, {
        requestId: input.issuanceRequestId, deviceId: input.deviceId, learnerId: config.learnerId,
      });
    } catch {
      // The original bounded failure remains the response; no retry issuance.
    }
    throw error;
  }
}
