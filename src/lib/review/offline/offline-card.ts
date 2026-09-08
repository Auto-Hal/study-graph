import {
  assertValidOfflinePilotFeedbackBundle,
  assertValidServerIssuedOfflineInstance,
  type OfflinePilotFeedbackBundleV1,
  type ServerIssuedOfflineInstance,
} from "./model-core.ts";
import type { ReviewAsset, ReviewCard } from "../types.ts";
import { KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID } from "../exercises/kuzushiji-pilot.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";

type PilotPresentation = {
  prompt: string;
  front: string;
  asset: {
    assetId: string;
    assetVersion: number;
    mediaType: string;
    src: string;
    width: number;
    height: number;
    alt: string;
    checksum: string | null;
    source: Record<string, unknown>;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readPresentation(value: unknown): PilotPresentation {
  if (!record(value) || !nonEmpty(value.prompt) || !nonEmpty(value.front) || !record(value.asset)) {
    throw new Error("offline pilot presentation is invalid");
  }
  const asset = value.asset;
  const assetId = asset.assetId;
  const assetVersion = asset.assetVersion;
  const mediaType = asset.mediaType;
  const src = asset.src;
  const width = asset.width;
  const height = asset.height;
  const alt = asset.alt;
  const checksum = asset.checksum;
  const source = asset.source;
  if (!nonEmpty(assetId) || !Number.isSafeInteger(assetVersion) || (assetVersion as number) <= 0
    || !nonEmpty(mediaType) || !nonEmpty(src) || !Number.isSafeInteger(width) || (width as number) <= 0
    || !Number.isSafeInteger(height) || (height as number) <= 0 || typeof alt !== "string"
    || (checksum !== null && !nonEmpty(checksum)) || !record(source)) {
    throw new Error("offline pilot presentation asset is invalid");
  }
  // The server descriptor is intentionally answer-free. Reject an accidental
  // answer-bearing presentation rather than silently rendering it.
  if (Object.prototype.hasOwnProperty.call(value, "answerSpec")
    || Object.prototype.hasOwnProperty.call(value, "acceptedAnswers")
    || Object.prototype.hasOwnProperty.call(value, "feedback")) {
    throw new Error("offline pilot presentation must be answer-free");
  }
  const validAssetId = assetId as string;
  const validAssetVersion = assetVersion as number;
  const validMediaType = mediaType as string;
  const validSrc = src as string;
  const validWidth = width as number;
  const validHeight = height as number;
  const validAlt = alt as string;
  const validChecksum = checksum as string | null;
  const validSource = source as Record<string, unknown>;
  return {
    prompt: value.prompt,
    front: value.front,
    asset: {
      assetId: validAssetId,
      assetVersion: validAssetVersion,
      mediaType: validMediaType,
      src: validSrc,
      width: validWidth,
      height: validHeight,
      alt: validAlt,
      checksum: validChecksum,
      source: validSource,
    },
  };
}

function sourceString(source: Record<string, unknown>, key: string) {
  return typeof source[key] === "string" ? source[key] as string : "";
}

/**
 * A newer verified local Scope snapshot may explicitly exclude an unstarted
 * issued card. Unknown/no snapshot is intentionally not an exclusion;
 * durable attempts are reconciled before this gate.
 */
export function isOfflinePilotInstanceOfferable(
  instanceGeneration: number,
  currentSnapshot: ScopeKnowledgeSnapshot | null,
): boolean {
  if (!currentSnapshot || currentSnapshot.generation <= instanceGeneration) return true;
  const decision = currentSnapshot.scopeDecisions.find(
    (entry) => entry.subjectId === KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID,
  );
  return decision?.status !== "ineligible";
}

/**
 * Convert a validated server-issued descriptor into the existing ReviewCard
 * shape. Answer rows/accepted answers come from the separately pinned
 * provisional feedback bundle; the presentation remains answer-free.
 */
export function createOfflineKuzushijiReviewCard(
  descriptor: ServerIssuedOfflineInstance,
  feedback: OfflinePilotFeedbackBundleV1,
  verifiedAssetSrc: string,
): ReviewCard {
  assertValidServerIssuedOfflineInstance(descriptor);
  assertValidOfflinePilotFeedbackBundle(feedback);
  if (descriptor.projectId !== "kuzushiji" || descriptor.evidenceUse !== "srs") {
    throw new Error("offline pilot descriptor is not eligible for this card");
  }
  if (feedback.revisionContentHash !== descriptor.revision.revisionContentHash) {
    throw new Error("offline pilot feedback revision mismatch");
  }
  const presentation = readPresentation(descriptor.presentation);
  const assetDescriptor = descriptor.assets.find((asset) => asset.assetId === presentation.asset.assetId && asset.assetVersion === presentation.asset.assetVersion);
  if (!assetDescriptor || assetDescriptor.checksum !== presentation.asset.checksum) {
    throw new Error("offline pilot asset attribution mismatch");
  }
  if (!nonEmpty(verifiedAssetSrc)) throw new Error("verified asset URL is required");
  const sourceUrl = sourceString(presentation.asset.source, "url") || "#";
  const asset: ReviewAsset = {
    type: "image",
    src: verifiedAssetSrc,
    alt: presentation.asset.alt,
    width: presentation.asset.width,
    height: presentation.asset.height,
    presentation: "full",
    attribution: sourceString(presentation.asset.source, "attribution") || undefined,
    sourceUrl,
    license: sourceString(presentation.asset.source, "license") || undefined,
  };
  return {
    id: descriptor.instanceId,
    exerciseId: "kuzushiji.visual-reading.eitaigura-u3042-00032-1:offline-v2",
    projectId: descriptor.projectId,
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "OFFLINE",
    label: "くずし字1字",
    prompt: presentation.prompt,
    front: presentation.front,
    frontStyle: "title",
    reason: "サーバー発行済みの問題を端末から復習",
    answer: {
      type: "text",
      acceptedAnswers: [...feedback.acceptedAnswers],
      placeholder: "読みを入力",
    },
    answerRows: feedback.answerRows.map((row) => ({ label: row.label, value: row.value })),
    sourceUrl,
    asset,
    persistenceKind: "versioned-pilot",
    definitionId: "kuzushiji.visual-reading.eitaigura-u3042-00032-1",
    instanceId: descriptor.instanceId,
  };
}
