import "server-only";

import {
  createPilotPresentation,
  hashPilotPresentation,
  type PilotPresentation,
} from "../exercises/attempt.ts";
import {
  KUZUSHIJI_PILOT_ASSET_ID,
  KUZUSHIJI_PILOT_EXERCISE_ID,
  kuzushijiPilotV2Record,
} from "../exercises/kuzushiji-pilot.ts";
import {
  KUZUSHIJI_PILOT_OBJECTIVE_ID,
  KUZUSHIJI_PILOT_OBJECTIVE_VERSION,
  KUZUSHIJI_PILOT_SRS_EPOCH,
  kuzushijiPilotV2ObjectiveBinding,
} from "../exercises/kuzushiji-objective.ts";
import {
  kuzushijiPilotRevisionV2,
  kuzushijiPilotRevisionV2Payload,
} from "../exercises/kuzushiji-revision.ts";
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
import {
  getCurrentScopeKnowledgeSnapshotModel,
} from "../../supabase/snapshots.ts";
import {
  ensureKuzushijiPilotOfflineArchive,
  getPilotRuntimeConfig,
  PilotRpcError,
  prefetchKuzushijiPilotInstance,
} from "../../supabase/pilot.ts";
import { isPilotIssuanceEnabled } from "../pilot-operations.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";
import { canonicalizeJson } from "../canonical-json.ts";
import {
  selectPilotCharacterFromSnapshot,
  type SnapshotPilotCharacter,
} from "./pilot-scope.ts";

export const PILOT_PREFETCH_PROJECT_ID = "kuzushiji" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Select the exact fixed pilot Scope anchor from a verified server snapshot. */
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

export function createPilotOfflineFeedbackBundle(): OfflinePilotFeedbackBundleV1 {
  const answerSpec = kuzushijiPilotV2Record.exercise.answerSpec;
  if (answerSpec.type !== "text") throw new PilotRpcError("unsupported_pilot_feedback", 503, "unsupported_pilot_feedback");
  const bundle = createOfflinePilotFeedbackBundle({
    revisionContentHash: kuzushijiPilotRevisionV2.contentHash,
    acceptedAnswers: answerSpec.acceptedAnswers,
    answerRows: [
      { label: "正解", value: answerSpec.acceptedAnswers[0] ?? "" },
      { label: "字母", value: kuzushijiPilotV2Record.metadata.motherCharacter.value },
      { label: "学習ポイント", value: kuzushijiPilotV2Record.exercise.explanation.summary },
    ],
  });
  assertValidOfflinePilotFeedbackBundle(bundle);
  return bundle;
}

function sameJson(left: unknown, right: unknown) {
  try {
    return canonicalizeJson(left) === canonicalizeJson(right);
  } catch {
    return false;
  }
}

function assertReturnedPrefetchRow(input: {
  row: {
    request_id: string;
    instance_id: string;
    learner_id: string;
    project_id: string;
    release_id: string;
    revision_id: string;
    presentation: Record<string, unknown>;
    presentation_hash: string;
    scope_evidence: Record<string, unknown>;
    snapshot_id: string | null;
    snapshot_generation: number | null;
    objective_id: string;
    objective_version: number;
    srs_epoch: number;
    evidence_use: "srs" | "practice-only";
    legacy_exercise_id: string;
    assets: unknown[];
    feedback: Record<string, unknown>;
    device_id: string;
  };
  requestId: string;
  deviceId: string;
  learnerId: string;
  releaseId: string;
  revisionId: string;
  expectedPresentation: PilotPresentation;
  expectedPresentationHash: string;
  expectedAsset: OfflineAssetDescriptor;
  expectedFeedback: OfflinePilotFeedbackBundleV1;
}): { assets: OfflineAssetDescriptor[]; feedback: OfflinePilotFeedbackBundleV1; presentation: PilotPresentation } {
  const { row } = input;
  if (
    row.request_id !== input.requestId
    || !UUID_PATTERN.test(row.instance_id)
    || row.learner_id !== input.learnerId
    || row.project_id !== PILOT_PREFETCH_PROJECT_ID
    || row.release_id !== input.releaseId
    || row.revision_id !== input.revisionId
    || row.objective_id !== KUZUSHIJI_PILOT_OBJECTIVE_ID
    || row.objective_version !== KUZUSHIJI_PILOT_OBJECTIVE_VERSION
    || row.srs_epoch !== KUZUSHIJI_PILOT_SRS_EPOCH
    || row.evidence_use !== kuzushijiPilotV2ObjectiveBinding.evidenceUse
    || row.legacy_exercise_id !== KUZUSHIJI_PILOT_EXERCISE_ID
    || !UUID_PATTERN.test(row.device_id)
    || row.device_id !== input.deviceId
    || !UUID_PATTERN.test(row.snapshot_id ?? "")
    || !Number.isSafeInteger(row.snapshot_generation) || (row.snapshot_generation as number) <= 0
    || !sameJson(row.presentation, input.expectedPresentation)
    || row.presentation_hash !== input.expectedPresentationHash
    || !Array.isArray(row.assets)
    || row.assets.length !== 1
    || Array.isArray(row.feedback)
    || typeof row.scope_evidence !== "object" || row.scope_evidence === null || Array.isArray(row.scope_evidence)
  ) {
    throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
  }
  const assets: OfflineAssetDescriptor[] = [];
  for (const value of row.assets) {
    try {
      assertValidOfflineAssetDescriptor(value);
      const asset = value as OfflineAssetDescriptor;
      if (asset.offlineReady || !sameJson(asset, input.expectedAsset)) {
        throw new Error("asset identity mismatch");
      }
      assets.push(asset);
    } catch {
      throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
    }
  }
  if (!sameJson(row.feedback, input.expectedFeedback)) {
    throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
  }
  const feedback = row.feedback as unknown as OfflinePilotFeedbackBundleV1;
  const presentation = row.presentation as unknown as PilotPresentation;
  return { assets: deepFreeze(assets), feedback, presentation };
}

/**
 * Issue one v2 server-owned descriptor for the currently eligible pilot
 * character. The caller supplies only the durable device/request IDs; all
 * content, learner, Objective and epoch fields are resolved here.
 */
export async function prefetchKuzushijiOfflineInstance(input: {
  deviceId: string;
  issuanceRequestId: string;
}): Promise<{ descriptor: ServerIssuedOfflineInstance; feedback: OfflinePilotFeedbackBundleV1 }> {
  const config = getPilotRuntimeConfig();
  if (!config) throw new PilotRpcError("pilot_runtime_not_configured", 503, "pilot_runtime_not_configured");
  const archive = await ensureKuzushijiPilotOfflineArchive();
  const presentation = createPilotPresentation(kuzushijiPilotRevisionV2Payload);
  const presentationHash = hashPilotPresentation(presentation);
  const asset = kuzushijiPilotRevisionV2Payload.visualAssets.find((entry) => entry.assetId === KUZUSHIJI_PILOT_ASSET_ID);
  if (!asset) throw new PilotRpcError("pilot_asset_not_found", 503, "pilot_asset_not_found");
  const assetDescriptor = createOfflineAssetDescriptor({
    assetId: asset.assetId,
    assetVersion: asset.assetVersion,
    src: asset.src,
    checksum: asset.checksum,
    revisionContentHash: kuzushijiPilotRevisionV2.contentHash,
    mediaType: asset.mediaType,
    width: asset.width,
    height: asset.height,
    source: asset.source,
    offlineReady: false,
  });
  const feedback = createPilotOfflineFeedbackBundle();
  // Existing request/device mappings may be reused without consulting a
  // changed or temporarily unavailable current snapshot.  A genuinely new
  // instance still receives all snapshot evidence below and is rejected by
  // the RPC if the snapshot is absent/incomplete/ineligible.
  let snapshot: ScopeKnowledgeSnapshot | null = null;
  let character: SnapshotPilotCharacter | null = null;
  try {
    const candidate = await getCurrentScopeKnowledgeSnapshotModel(PILOT_PREFETCH_PROJECT_ID);
    if (candidate?.sourceEvidence.paginationComplete && candidate.sourceEvidence.relationCompleteness) {
      snapshot = candidate;
      try {
        character = selectEligiblePilotCharacter(candidate);
      } catch {
        character = null;
      }
    }
  } catch {
    snapshot = null;
  }
  const scopeEvidence = snapshot && character ? buildIssuanceEvidence(snapshot, character.id) : null;
  const row = await prefetchKuzushijiPilotInstance({
    requestId: input.issuanceRequestId,
    deviceId: input.deviceId,
    newIssuanceAllowed: isPilotIssuanceEnabled(),
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    snapshotId: snapshot?.snapshotId ?? null,
    snapshotGeneration: snapshot?.generation ?? null,
    presentation: presentation as unknown as Record<string, unknown>,
    presentationHash,
    scopeEvidence: scopeEvidence as unknown as Record<string, unknown> | null,
    legacyItemId: character?.id ?? null,
    legacyExerciseId: KUZUSHIJI_PILOT_EXERCISE_ID,
    assets: [assetDescriptor],
    feedback: feedback as unknown as Record<string, unknown>,
  });
  const returned = assertReturnedPrefetchRow({
    row,
    requestId: input.issuanceRequestId,
    deviceId: input.deviceId,
    learnerId: config.learnerId,
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    expectedPresentation: presentation,
    expectedPresentationHash: presentationHash,
    expectedAsset: assetDescriptor,
    expectedFeedback: feedback,
  });
  // New instances and every persisted prefetch mapping carry issuance
  // snapshot evidence.  Keep the descriptor contract non-null even though
  // the RPC input is nullable for idempotent recovery of an existing row.
  const snapshotId = row.snapshot_id;
  const snapshotGeneration = row.snapshot_generation;
  if (!snapshotId || snapshotGeneration === null) {
    throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
  }
  const descriptor = freezeServerIssuedOfflineInstance({
    descriptorVersion: 1,
    instanceId: row.instance_id,
    learnerId: config.learnerId,
    projectId: row.project_id,
    revision: {
      revisionId: row.revision_id,
      revisionContentHash: returned.assets[0]!.revisionContentHash,
    },
    presentation: returned.presentation,
    presentationHash: row.presentation_hash,
    issuedAt: row.issued_at,
    scopeSnapshot: {
      snapshotId,
      generation: snapshotGeneration,
    },
    objectiveId: row.objective_id,
    objectiveVersion: row.objective_version,
    srsEpoch: row.srs_epoch,
    evidenceUse: row.evidence_use,
    assets: returned.assets,
    delivery: {
      deviceId: row.device_id,
      prefetchedAt: row.prefetched_at,
    },
  });
  if (descriptor.objectiveId !== KUZUSHIJI_PILOT_OBJECTIVE_ID
    || descriptor.objectiveVersion !== KUZUSHIJI_PILOT_OBJECTIVE_VERSION
    || descriptor.srsEpoch !== KUZUSHIJI_PILOT_SRS_EPOCH
    || descriptor.evidenceUse !== kuzushijiPilotV2ObjectiveBinding.evidenceUse) {
    throw new PilotRpcError("pilot_descriptor_mismatch", 502, "pilot_descriptor_mismatch");
  }
  assertValidServerIssuedOfflineInstance(descriptor);
  return { descriptor, feedback: returned.feedback };
}
