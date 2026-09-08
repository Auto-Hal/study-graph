import {
  resultFromStoredObjectiveReceipt,
  resultFromStoredReceipt,
  type StoredPilotReceiptResult,
} from "../exercises/receipt.ts";
import type { ReviewGrade } from "../exercises/attempt.ts";
import { canonicalizeJson, type JsonValue } from "../canonical-json.ts";
import { assertValidObjectiveSrsEpoch, objectiveSrsKey, type ObjectiveSrsKey } from "../objective-srs.ts";
import type { SrsEpoch } from "../objectives.ts";

/** The first local contract versions. Unsupported versions must fail closed. */
export const OFFLINE_SUBMISSION_SCHEMA_VERSION = 1 as const;
/** Labels the unchanged Phase 4C request tuple; the hash implementation is not changed. */
export const REQUEST_HASH_VERSION = 1 as const;
export const OFFLINE_CACHE_DESCRIPTOR_VERSION = 1 as const;
export const OFFLINE_INSTANCE_DESCRIPTOR_VERSION = 1 as const;
export const OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1 as const;

export type OfflineSubmission = Readonly<{
  submissionSchemaVersion: typeof OFFLINE_SUBMISSION_SCHEMA_VERSION;
  requestHashVersion: typeof REQUEST_HASH_VERSION;
  attemptId: string;
  instanceId: string;
  rawAnswer: JsonValue;
  selfEvaluation: ReviewGrade | null;
  responseMs: number | null;
  usedHint: boolean;
  /** Client claims are historical context, never request identity or SRS authority. */
  clientAnsweredAt?: string;
  clientSnapshotId?: string;
  clientSnapshotGeneration?: number;
}>;

export type OfflineSubmissionInput = Omit<OfflineSubmission, "submissionSchemaVersion" | "requestHashVersion">;

export type OfflineAttemptLocalMetadata = Readonly<{
  createdAt?: string;
  localSequence?: number;
}>;

export type OfflineAttemptDraft = Readonly<{
  status: "draft";
  submission: null;
  requestHash: null;
  localMetadata: OfflineAttemptLocalMetadata;
  receipt: null;
  blockedReason: null;
}>;

export type OfflineAttemptCommittedStatus = Exclude<OfflineAttemptStatus, "draft">;

export type OfflineAttemptCommitted = Readonly<{
  status: OfflineAttemptCommittedStatus;
  submission: OfflineSubmission;
  requestHash: string;
  localMetadata: OfflineAttemptLocalMetadata;
  receipt: OfflineReceiptRecord | null;
  blockedReason: OfflineBlockedReason | null;
}>;

export type OfflineAttemptRecord = OfflineAttemptDraft | OfflineAttemptCommitted;

export type OfflineAttemptStatus =
  | "draft"
  | "pending"
  | "sending"
  | "auth-required"
  | "accepted-applied"
  | "accepted-no-srs"
  | "blocked";

export type OfflineBlockedReason =
  | "attempt-conflict"
  | "instance-already-answered"
  | "unsupported-submission-version"
  | "incomplete-authoritative-receipt"
  | "malformed-response";

export type OfflineReceiptKind = "legacy" | "objective";

/** The server receipt is stored verbatim; it is never reconstructed locally. */
export type OfflineReceiptRecord = Readonly<{
  descriptorVersion: typeof OFFLINE_RECEIPT_DESCRIPTOR_VERSION;
  kind: OfflineReceiptKind;
  receipt: JsonValue;
}>;

export type ObjectiveStateMirror = Readonly<{
  learnerId: string;
  projectId: string;
  objectiveId: string;
  srsEpoch: SrsEpoch;
  stateRevision: number;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lastGrade: ReviewGrade;
  schedulerVersion: string;
}>;

export type ObjectiveStateMirrorDecision =
  | { kind: "adopt"; reason: "no-current" | "newer-revision" }
  | { kind: "ignore"; reason: "older-revision" }
  | { kind: "idempotent"; reason: "same-revision" }
  | { kind: "conflict"; reason: "same-revision-different-content" | "different-key" };

export type OfflineRevisionReference = Readonly<{
  revisionId: string;
  revisionContentHash: string;
}>;

export type OfflineAssetDescriptor = Readonly<{
  descriptorVersion: typeof OFFLINE_CACHE_DESCRIPTOR_VERSION;
  assetId: string;
  assetVersion: number;
  checksum: string | null;
  revisionContentHash: string;
  mediaType: string;
  width: number;
  height: number;
  source: JsonValue;
  offlineReady: boolean;
}>;

export type OfflineInstanceDeliveryMetadata = Readonly<{
  deviceId?: string;
  prefetchedAt?: string;
}>;

/**
 * A server-issued fact suitable for local replication. There is deliberately
 * no client-created/provisional instance type: learner and Objective
 * attribution are immutable facts from the server.
 */
export type ServerIssuedOfflineInstance = Readonly<{
  descriptorVersion: typeof OFFLINE_INSTANCE_DESCRIPTOR_VERSION;
  instanceId: string;
  learnerId: string;
  projectId: string;
  revision: OfflineRevisionReference;
  presentation: JsonValue;
  presentationHash: string;
  issuedAt: string;
  scopeSnapshot: Readonly<{ snapshotId: string; generation: number }>;
  objectiveId: string;
  objectiveVersion: number;
  srsEpoch: SrsEpoch;
  evidenceUse: "srs" | "practice-only";
  assets: readonly OfflineAssetDescriptor[];
  delivery?: OfflineInstanceDeliveryMetadata;
}>;

export type ScopeEvidenceStatus = "eligible" | "ineligible" | "unknown";

/** Evidence captured by the server when it issues an instance. */
export type IssuanceScopeEvidence = Readonly<{
  authority: "server-issuance";
  snapshotId?: string;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  status: ScopeEvidenceStatus;
  reasonCodes: readonly string[];
  complete: boolean;
}>;

/** Client context is a claim retained for audit context, never SRS authority. */
export type ClientAnswerContext = Readonly<{
  authority: "client-claim";
  answeredAt?: string;
  snapshotId?: string;
  snapshotGeneration?: number;
}>;

/** Only this server evidence can prove Scope eligibility for SRS application. */
export type AttemptAcceptanceScopeEvidence = Readonly<{
  authority: "server-first-acceptance";
  snapshotId?: string;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  status: ScopeEvidenceStatus;
  reasonCodes: readonly string[];
  complete: boolean;
}>;

export type OfflineGradingAuthority = "provisional" | "authoritative";

export type OfflineProvisionalGrade = Readonly<{
  authority: "provisional";
  isCorrect: boolean | null;
}>;

export type OfflineAuthoritativeGrade = Readonly<{
  authority: "authoritative";
  isCorrect: boolean | null;
}>;

/** Client grading may inform feedback only; server receipt remains authoritative. */
export const OFFLINE_GRADING_POLICY = Object.freeze({
  clientAuthority: "provisional" as const,
  serverAuthority: "authoritative" as const,
  clientCorrectnessCanAuthorizeSrs: false as const,
});

const GRADES: readonly ReviewGrade[] = ["again", "hard", "good", "easy"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function copyJson<T extends JsonValue>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

/** Freeze a local record while retaining the existing JSON canonicalization contract. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function validateSubmissionInput(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["offline submission must be an object"];
  if (
    Object.prototype.hasOwnProperty.call(value, "submissionSchemaVersion")
    && value.submissionSchemaVersion !== OFFLINE_SUBMISSION_SCHEMA_VERSION
  ) errors.push("submissionSchemaVersion is unsupported");
  if (
    Object.prototype.hasOwnProperty.call(value, "requestHashVersion")
    && value.requestHashVersion !== REQUEST_HASH_VERSION
  ) errors.push("requestHashVersion is unsupported");
  if (!isNonEmptyString(value.attemptId)) errors.push("attemptId is required");
  if (!isNonEmptyString(value.instanceId)) errors.push("instanceId is required");
  if (!Object.prototype.hasOwnProperty.call(value, "rawAnswer")) errors.push("rawAnswer is required");
  if (value.selfEvaluation !== null && !GRADES.includes(value.selfEvaluation as ReviewGrade)) {
    errors.push("selfEvaluation is invalid");
  }
  if (value.responseMs !== null && (!isNonNegativeInteger(value.responseMs) || (value.responseMs as number) > 3_600_000)) {
    errors.push("responseMs is invalid");
  }
  if (typeof value.usedHint !== "boolean") errors.push("usedHint is required");
  for (const field of ["clientAnsweredAt", "clientSnapshotId"] as const) {
    if (Object.prototype.hasOwnProperty.call(value, field) && value[field] !== undefined && !isNonEmptyString(value[field])) {
      errors.push(`${field} must be non-empty when provided`);
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "clientSnapshotGeneration")
    && value.clientSnapshotGeneration !== undefined
    && !isPositiveInteger(value.clientSnapshotGeneration)
  ) errors.push("clientSnapshotGeneration must be a positive integer when provided");
  return errors;
}

export function assertValidOfflineSubmission(value: unknown): asserts value is OfflineSubmissionInput {
  const errors = validateSubmissionInput(value);
  if (errors.length > 0) throw new Error("Invalid offline submission: " + errors.join("; "));
}

/** Creates the immutable submission boundary; hashing is supplied by a runtime adapter. */
export function createOfflineSubmission(value: OfflineSubmissionInput): OfflineSubmission {
  assertValidOfflineSubmission(value);
  const submission = {
    submissionSchemaVersion: OFFLINE_SUBMISSION_SCHEMA_VERSION,
    requestHashVersion: REQUEST_HASH_VERSION,
    attemptId: value.attemptId,
    instanceId: value.instanceId,
    rawAnswer: copyJson(value.rawAnswer),
    selfEvaluation: value.selfEvaluation,
    responseMs: value.responseMs,
    usedHint: value.usedHint,
    ...(value.clientAnsweredAt === undefined ? {} : { clientAnsweredAt: value.clientAnsweredAt }),
    ...(value.clientSnapshotId === undefined ? {} : { clientSnapshotId: value.clientSnapshotId }),
    ...(value.clientSnapshotGeneration === undefined ? {} : { clientSnapshotGeneration: value.clientSnapshotGeneration }),
  } satisfies OfflineSubmission;
  return deepFreeze(submission);
}

export type OfflineRequestHashInput = Readonly<{
  attemptId: string;
  instanceId: string;
  rawAnswer: JsonValue;
  selfEvaluation: ReviewGrade | null;
  responseMs: number | null;
  usedHint: boolean;
}>;

/** The exact immutable Phase 4C request tuple; client metadata is excluded. */
export function offlineRequestHashInput(submission: OfflineSubmission): OfflineRequestHashInput {
  return {
    attemptId: submission.attemptId,
    instanceId: submission.instanceId,
    rawAnswer: submission.rawAnswer,
    selfEvaluation: submission.selfEvaluation,
    responseMs: submission.responseMs,
    usedHint: submission.usedHint,
  };
}

/** Canonical bytes for the existing request hash contract. */
export function canonicalizeOfflineSubmission(submission: OfflineSubmission): string {
  assertValidOfflineSubmission(submission);
  return canonicalizeJson(offlineRequestHashInput(submission));
}

/** Runtime-neutral hash adapter used by the server and browser entrypoints. */
export function hashOfflineSubmissionWith(
  submission: OfflineSubmission,
  hash: (input: OfflineRequestHashInput) => string,
): string {
  assertValidOfflineSubmission(submission);
  return hash(offlineRequestHashInput(submission));
}

export function createOfflineAttemptDraft(localMetadata: OfflineAttemptLocalMetadata = {}): OfflineAttemptDraft {
  if (localMetadata.createdAt !== undefined && !isNonEmptyString(localMetadata.createdAt)) {
    throw new Error("createdAt must be non-empty when provided");
  }
  if (localMetadata.localSequence !== undefined && !isNonNegativeInteger(localMetadata.localSequence)) {
    throw new Error("localSequence must be a non-negative integer when provided");
  }
  return deepFreeze({
    status: "draft" as const,
    submission: null,
    requestHash: null,
    localMetadata: deepFreeze({ ...localMetadata }),
    receipt: null,
    blockedReason: null,
  });
}

export function confirmOfflineSubmissionWithHash(
  draft: OfflineAttemptDraft,
  input: OfflineSubmissionInput,
  requestHash: string,
): OfflineAttemptCommitted {
  if (draft.status !== "draft") throw new Error("Only a draft can be confirmed");
  const submission = createOfflineSubmission(input);
  return deepFreeze({
    status: "pending" as const,
    submission,
    requestHash,
    localMetadata: draft.localMetadata,
    receipt: null,
    blockedReason: null,
  });
}

export function validateObjectiveStateMirror(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["Objective state mirror must be an object"];
  for (const field of ["learnerId", "projectId", "objectiveId", "dueAt", "schedulerVersion"]) {
    if (!isNonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  try {
    assertValidObjectiveSrsEpoch(value.srsEpoch);
  } catch {
    errors.push("srsEpoch must be a positive integer");
  }
  if (!isPositiveInteger(value.stateRevision)) errors.push("stateRevision must be a positive integer");
  if (!isNonNegativeInteger(value.intervalDays)) errors.push("intervalDays must be a non-negative integer");
  if (!isNonNegativeInteger(value.repetitions)) errors.push("repetitions must be a non-negative integer");
  if (!GRADES.includes(value.lastGrade as ReviewGrade)) errors.push("lastGrade is invalid");
  return errors;
}

export function assertValidObjectiveStateMirror(value: unknown): asserts value is ObjectiveStateMirror {
  const errors = validateObjectiveStateMirror(value);
  if (errors.length > 0) throw new Error("Invalid Objective state mirror: " + errors.join("; "));
}

export function objectiveStateMirrorKey(value: ObjectiveStateMirror | ObjectiveSrsKey): string {
  return objectiveSrsKey({
    learnerId: value.learnerId,
    projectId: value.projectId,
    objectiveId: value.objectiveId,
    srsEpoch: value.srsEpoch,
  });
}

export function adoptObjectiveStateMirror(
  current: ObjectiveStateMirror | null,
  candidate: ObjectiveStateMirror,
): ObjectiveStateMirrorDecision {
  assertValidObjectiveStateMirror(candidate);
  if (current === null) return { kind: "adopt", reason: "no-current" };
  assertValidObjectiveStateMirror(current);
  if (objectiveStateMirrorKey(current) !== objectiveStateMirrorKey(candidate)) {
    return { kind: "conflict", reason: "different-key" };
  }
  if (candidate.stateRevision > current.stateRevision) return { kind: "adopt", reason: "newer-revision" };
  if (candidate.stateRevision < current.stateRevision) return { kind: "ignore", reason: "older-revision" };
  return canonicalizeJson(current) === canonicalizeJson(candidate)
    ? { kind: "idempotent", reason: "same-revision" }
    : { kind: "conflict", reason: "same-revision-different-content" };
}

export function createOfflineAssetDescriptor(input: {
  assetId: string;
  assetVersion: number;
  checksum: string | null;
  verifiedChecksum?: string | null;
  revisionContentHash: string;
  mediaType: string;
  width: number;
  height: number;
  source: JsonValue;
  offlineReady?: boolean;
}): OfflineAssetDescriptor {
  if (!isNonEmptyString(input.assetId)) throw new Error("assetId is required");
  if (!isPositiveInteger(input.assetVersion)) throw new Error("assetVersion must be a positive integer");
  if (!isSha256(input.revisionContentHash)) throw new Error("revisionContentHash must be a SHA-256 hash");
  if (!isNonEmptyString(input.mediaType)) throw new Error("mediaType is required");
  if (!isPositiveInteger(input.width) || !isPositiveInteger(input.height)) throw new Error("asset dimensions are invalid");
  const verified = isSha256(input.checksum)
    && input.verifiedChecksum === input.checksum;
  return deepFreeze({
    descriptorVersion: OFFLINE_CACHE_DESCRIPTOR_VERSION,
    assetId: input.assetId,
    assetVersion: input.assetVersion,
    checksum: input.checksum,
    revisionContentHash: input.revisionContentHash,
    mediaType: input.mediaType,
    width: input.width,
    height: input.height,
    source: copyJson(input.source),
    offlineReady: Boolean(input.offlineReady ?? true) && verified,
  });
}

export function assertValidOfflineAssetDescriptor(value: unknown): asserts value is OfflineAssetDescriptor {
  if (!isRecord(value)) throw new Error("offline asset descriptor must be an object");
  if (value.descriptorVersion !== OFFLINE_CACHE_DESCRIPTOR_VERSION) throw new Error("unsupported offline asset descriptor version");
  if (!isNonEmptyString(value.assetId)) throw new Error("assetId is required");
  if (!isPositiveInteger(value.assetVersion)) throw new Error("assetVersion must be a positive integer");
  if (value.checksum !== null && !isSha256(value.checksum)) throw new Error("checksum is invalid");
  if (!isSha256(value.revisionContentHash)) throw new Error("revisionContentHash must be a SHA-256 hash");
  if (!isNonEmptyString(value.mediaType)) throw new Error("mediaType is required");
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) throw new Error("asset dimensions are invalid");
  if (!Object.prototype.hasOwnProperty.call(value, "source")) throw new Error("source is required");
  if (typeof value.offlineReady !== "boolean") throw new Error("offlineReady is required");
  if (value.offlineReady && !isSha256(value.checksum)) throw new Error("offlineReady requires a verified checksum");
}

export function isOfflineAssetReady(descriptor: OfflineAssetDescriptor, observedChecksum?: string | null): boolean {
  try {
    assertValidOfflineAssetDescriptor(descriptor);
  } catch {
    return false;
  }
  if (!descriptor.offlineReady || !isSha256(descriptor.checksum)) return false;
  return observedChecksum === undefined || observedChecksum === descriptor.checksum;
}

export function assertValidServerIssuedOfflineInstance(value: unknown): asserts value is ServerIssuedOfflineInstance {
  if (!isRecord(value)) throw new Error("offline instance descriptor must be an object");
  if (value.descriptorVersion !== OFFLINE_INSTANCE_DESCRIPTOR_VERSION) throw new Error("unsupported offline instance descriptor version");
  for (const field of ["instanceId", "learnerId", "projectId", "issuedAt", "objectiveId"]) {
    if (!isNonEmptyString(value[field])) throw new Error(`${field} is required`);
  }
  if (!isSha256(value.presentationHash)) throw new Error("presentationHash must be a SHA-256 hash");
  if (!isRecord(value.revision) || !isNonEmptyString(value.revision.revisionId) || !isSha256(value.revision.revisionContentHash)) {
    throw new Error("revision reference is invalid");
  }
  if (!Object.prototype.hasOwnProperty.call(value, "presentation")) throw new Error("presentation is required");
  if (!isPositiveInteger(value.objectiveVersion)) throw new Error("objectiveVersion must be a positive integer");
  try {
    assertValidObjectiveSrsEpoch(value.srsEpoch);
  } catch {
    throw new Error("srsEpoch must be a positive integer");
  }
  if (value.evidenceUse !== "srs" && value.evidenceUse !== "practice-only") throw new Error("evidenceUse is invalid");
  if (!Array.isArray(value.assets)) throw new Error("assets must be an array");
  for (const asset of value.assets) {
    assertValidOfflineAssetDescriptor(asset);
  }
  if (!isRecord(value.scopeSnapshot) || !isNonEmptyString(value.scopeSnapshot.snapshotId) || !isPositiveInteger(value.scopeSnapshot.generation)) {
    throw new Error("scope snapshot reference is invalid");
  }
}

export function freezeServerIssuedOfflineInstance(value: ServerIssuedOfflineInstance): ServerIssuedOfflineInstance {
  assertValidServerIssuedOfflineInstance(value);
  return deepFreeze(value);
}

function validateScopeEvidence(value: unknown, authority: IssuanceScopeEvidence["authority"] | AttemptAcceptanceScopeEvidence["authority"]): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["scope evidence must be an object"];
  if (value.authority !== authority) errors.push("scope evidence authority is invalid");
  for (const field of ["sourceReadStartedAt", "sourceReadCompletedAt"]) {
    if (!isNonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  if (!(["eligible", "ineligible", "unknown"] as const).includes(value.status as ScopeEvidenceStatus)) {
    errors.push("scope status is invalid");
  }
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((reason) => !isNonEmptyString(reason))) {
    errors.push("reasonCodes must be an array of non-empty strings");
  }
  if (typeof value.complete !== "boolean") errors.push("complete is required");
  if (value.snapshotId !== undefined && !isNonEmptyString(value.snapshotId)) errors.push("snapshotId is invalid");
  return errors;
}

export function assertValidIssuanceScopeEvidence(value: unknown): asserts value is IssuanceScopeEvidence {
  const errors = validateScopeEvidence(value, "server-issuance");
  if (errors.length > 0) throw new Error("Invalid issuance Scope evidence: " + errors.join("; "));
}

export function assertValidAttemptAcceptanceScopeEvidence(value: unknown): asserts value is AttemptAcceptanceScopeEvidence {
  const errors = validateScopeEvidence(value, "server-first-acceptance");
  if (errors.length > 0) throw new Error("Invalid acceptance Scope evidence: " + errors.join("; "));
}

/** Issuance/client snapshots are never sufficient to authorize SRS. */
export function scopeEvidenceProvesEligibility(value: AttemptAcceptanceScopeEvidence): boolean {
  try {
    assertValidAttemptAcceptanceScopeEvidence(value);
  } catch {
    return false;
  }
  return value.complete && value.status === "eligible";
}

/** Validate and retain an authoritative receipt without deriving any fields from a current request. */
export function createOfflineReceiptRecord(
  kind: OfflineReceiptKind,
  receipt: unknown,
  expectedInstanceId: string,
  expectedAttemptId?: string,
): OfflineReceiptRecord {
  if (!isRecord(receipt)) throw new Error("stored_receipt_incomplete");
  let restored: StoredPilotReceiptResult;
  try {
    restored = kind === "legacy"
      ? resultFromStoredReceipt(receipt, expectedInstanceId)
      : resultFromStoredObjectiveReceipt(receipt, expectedInstanceId);
  } catch {
    throw new Error("stored_receipt_incomplete");
  }
  if (expectedAttemptId !== undefined && restored.attemptId !== expectedAttemptId) {
    throw new Error("stored_receipt_attempt_mismatch");
  }
  return deepFreeze({
    descriptorVersion: OFFLINE_RECEIPT_DESCRIPTOR_VERSION,
    kind,
    receipt: copyJson(receipt as JsonValue),
  });
}

export function authoritativeReceiptResult(record: OfflineReceiptRecord, expectedInstanceId: string): StoredPilotReceiptResult {
  if (
    record.descriptorVersion !== OFFLINE_RECEIPT_DESCRIPTOR_VERSION
    || (record.kind !== "legacy" && record.kind !== "objective")
  ) throw new Error("stored_receipt_incomplete");
  return record.kind === "legacy"
    ? resultFromStoredReceipt(record.receipt, expectedInstanceId)
    : resultFromStoredObjectiveReceipt(record.receipt, expectedInstanceId);
}
