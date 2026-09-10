import {
  canonicalizeJson,
  type JsonValue,
} from "../review/canonical-json.ts";
import type {
  Character,
  Lecture,
  Mistake,
  ReviewItem,
} from "../notion/kuzushiji.ts";
import type {
  ScopeKnowledgeSnapshot,
  ScopeKnowledgeSnapshotDecision,
  ScopeKnowledgeSnapshotSourceEvidence,
} from "../review/offline/snapshot-content.ts";
import { assertValidScopeKnowledgeSnapshot } from "../review/offline/snapshot-content.ts";

/**
 * Application-layer envelope version.  The persisted name
 * `ScopeKnowledgeSnapshot` remains a historical storage contract; this
 * neutral shape is the boundary that future Project Workspace readers use.
 */
export const PROJECT_READ_SCHEMA_VERSION = 1 as const;

/** The only projection currently understood by this foundation slice. */
export const KUZUSHIJI_PROJECT_ID = "kuzushiji" as const;
export const KUZUSHIJI_V1_PROJECTION_VERSION = "kuzushiji-v1" as const;
const KNOWN_PROJECT_IDS = [KUZUSHIJI_PROJECT_ID, "western-art-history", "philosophy"] as const;
type KnownProjectId = (typeof KNOWN_PROJECT_IDS)[number];

/**
 * Keep the three historical hash-covered evidence fields unchanged. In
 * particular, `relationCompleteness` is not a claim that every graph
 * relation was crawled; a future projection must carry any richer evidence
 * in its own versioned, hash-covered payload.
 */
export type ProjectReadSourceEvidence = Readonly<{
  sourceIdentifiers: readonly string[];
  paginationComplete: boolean;
  relationCompleteness: boolean;
}>;

/**
 * A generic observation of project knowledge. `validUntil` is display freshness
 * only and `generation` only orders observations for adoption.
 * This shape does not itself authorize Scope or SRS; local replicas remain
 * non-authoritative as well.
 */
export type ProjectReadSnapshot<TProjection = JsonValue> = Readonly<{
  schemaVersion: typeof PROJECT_READ_SCHEMA_VERSION;
  snapshotId: string;
  projectId: string;
  generation: number;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  publishedAt: string;
  validUntil: string;
  policyVersion: string;
  projectionVersion: string;
  sourceEvidence: ProjectReadSourceEvidence;
  subjectObservations: readonly ProjectReadSubjectObservation[];
  projection: TProjection;
  contentHash: string;
}>;

/** Alias for callers that use observation terminology. */
export type ProjectKnowledgeObservation<TProjection = JsonValue> = ProjectReadSnapshot<TProjection>;

/** Compatibility alias for readers that call the envelope an observation. */
export type ProjectReadObservation<TProjection = JsonValue> = ProjectReadSnapshot<TProjection>;

export type ProjectReadSubjectObservation = Readonly<{
  subjectId: string;
  status: "eligible" | "ineligible" | "unknown";
  reasonCodes: readonly string[];
  anchorReferences: readonly string[];
}>;

export type KuzushijiV1Projection = Readonly<{
  lectures: readonly Lecture[];
  characters: readonly Character[];
  mistakes: readonly Mistake[];
  reviewQueue: readonly ReviewItem[];
}>;

export type SupportedProjectReadSnapshot = ProjectReadSnapshot<KuzushijiV1Projection> & Readonly<{
  projectId: typeof KUZUSHIJI_PROJECT_ID;
  projectionVersion: typeof KUZUSHIJI_V1_PROJECTION_VERSION;
}>;

export type ProjectReadValidationCode =
  | "invalid-envelope"
  | "unsupported-project"
  | "unsupported-projection-version"
  | "project-projection-mismatch"
  | "invalid-kuzushiji-v1-projection";

export class ProjectReadContractError extends Error {
  readonly code: ProjectReadValidationCode;

  constructor(code: ProjectReadValidationCode, message: string) {
    super(message);
    this.name = "ProjectReadContractError";
    this.code = code;
  }
}

export type ProjectReadState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T; dataStatus: "available" | "authoritative-empty" }
  | { kind: "stale"; data: T; dataStatus: "available" | "authoritative-empty"; staleSince?: string }
  | { kind: "verified-local-replica"; data: T; dataStatus: "available" | "authoritative-empty" }
  | { kind: "missing"; reason: "not-yet-published" }
  | { kind: "unavailable"; errorCode?: string }
  | { kind: "invalid-candidate"; errorCode?: string }
  | { kind: "conflict"; errorCode?: string };

export type ProjectCapabilitySlot =
  | "learning"
  | "knowledge"
  | "connections"
  | "media"
  | "review"
  | "progress"
  | "offline";

export type ProjectCapability = Readonly<{
  /** Whether the product understands the capability's semantics. */
  semanticSupport: "supported" | "unsupported" | "unknown";
  /** Whether formally published content is known to exist. */
  publishedContent: "available" | "not-published" | "unknown";
  /** Whether the required server/read dependency is currently reachable. */
  runtimeAvailability: "available" | "unavailable" | "unknown";
  /** Whether this device has completed the local preparation, if applicable. */
  deviceReadiness: "ready" | "not-ready" | "unknown";
}>;

export type ProjectWorkspaceCapabilities = Readonly<Record<ProjectCapabilitySlot, ProjectCapability>>;

type ProjectReadEnvelope = Omit<ProjectReadSnapshot, "projection"> & { projection: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isKnownProjectId(value: string): value is KnownProjectId {
  return (KNOWN_PROJECT_IDS as readonly string[]).includes(value);
}

function validateStringArray(value: unknown, field: string, errors: string[]) {
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) {
    errors.push(`${field} must be an array of non-empty strings`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`${field} must not contain duplicates`);
}

function validateSourceEvidence(value: unknown, errors: string[]) {
  if (!isRecord(value)) {
    errors.push("sourceEvidence is required");
    return;
  }
  validateStringArray(value.sourceIdentifiers, "sourceEvidence.sourceIdentifiers", errors);
  if (typeof value.paginationComplete !== "boolean") errors.push("sourceEvidence.paginationComplete is required");
  if (typeof value.relationCompleteness !== "boolean") errors.push("sourceEvidence.relationCompleteness is required");
}

function validateSubjectObservations(value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push("subjectObservations is required");
    return;
  }
  const subjectIds = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      errors.push(`subjectObservations[${index}] must be an object`);
      continue;
    }
    if (!nonEmptyString(item.subjectId)) errors.push(`subjectObservations[${index}].subjectId is required`);
    else if (subjectIds.has(item.subjectId)) errors.push(`subjectObservations[${index}].subjectId must be unique`);
    else subjectIds.add(item.subjectId);
    if (item.status !== "eligible" && item.status !== "ineligible" && item.status !== "unknown") {
      errors.push(`subjectObservations[${index}].status is invalid`);
    }
    validateStringArray(item.reasonCodes, `subjectObservations[${index}].reasonCodes`, errors);
    validateStringArray(item.anchorReferences, `subjectObservations[${index}].anchorReferences`, errors);
  }
}

function validateEnvelope(value: unknown): { errors: string[]; envelope: ProjectReadEnvelope | null } {
  if (!isRecord(value)) return { errors: ["project read snapshot must be an object"], envelope: null };
  const errors: string[] = [];
  for (const field of [
    "snapshotId",
    "projectId",
    "sourceReadStartedAt",
    "sourceReadCompletedAt",
    "publishedAt",
    "validUntil",
    "policyVersion",
    "projectionVersion",
  ]) {
    if (!nonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  if (value.schemaVersion !== PROJECT_READ_SCHEMA_VERSION) errors.push("schemaVersion is unsupported");
  if (typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation <= 0) {
    errors.push("generation must be a positive integer");
  }
  validateSourceEvidence(value.sourceEvidence, errors);
  validateSubjectObservations(value.subjectObservations, errors);
  if (!Object.prototype.hasOwnProperty.call(value, "projection")) {
    errors.push("projection is required");
  } else {
    try {
      canonicalizeJson(value.projection);
    } catch {
      errors.push("projection must be JSON data");
    }
  }
  if (typeof value.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(value.contentHash)) {
    errors.push("contentHash is invalid");
  }
  if (errors.length > 0) return { errors, envelope: null };
  return { errors, envelope: value as ProjectReadEnvelope };
}

function readString(value: Record<string, unknown>, field: string, errors: string[]) {
  if (!nonEmptyString(value[field])) {
    errors.push(`${field} is required`);
    return "";
  }
  return value[field] as string;
}

function readNullableString(value: Record<string, unknown>, field: string, errors: string[]) {
  if (value[field] !== null && typeof value[field] !== "string") errors.push(`${field} must be a string or null`);
  return value[field] as string | null;
}

function readNumber(value: Record<string, unknown>, field: string, errors: string[]) {
  if (typeof value[field] !== "number" || !Number.isFinite(value[field])) errors.push(`${field} must be a number`);
  return value[field] as number;
}

function readNullableNumber(value: Record<string, unknown>, field: string, errors: string[]) {
  if (value[field] !== null && (typeof value[field] !== "number" || !Number.isFinite(value[field]))) {
    errors.push(`${field} must be a number or null`);
  }
  return value[field] as number | null;
}

function decodeLecture(value: unknown, index: number, errors: string[]): Lecture | null {
  if (!isRecord(value)) {
    errors.push(`projection.lectures[${index}] must be an object`);
    return null;
  }
  return {
    id: readString(value, "id", errors),
    url: readString(value, "url", errors),
    title: readString(value, "title", errors),
    sequence: readNumber(value, "sequence", errors),
    theme: readString(value, "theme", errors),
    status: readString(value, "status", errors),
    completedAt: readNullableString(value, "completedAt", errors),
    reviewAccuracy: readNullableNumber(value, "reviewAccuracy", errors),
    newCharactersCount: readNullableNumber(value, "newCharactersCount", errors),
  };
}

function decodeCharacter(value: unknown, index: number, errors: string[]): Character | null {
  if (!isRecord(value)) {
    errors.push(`projection.characters[${index}] must be an object`);
    return null;
  }
  return {
    id: readString(value, "id", errors),
    url: readString(value, "url", errors),
    glyph: readString(value, "glyph", errors),
    reading: readString(value, "reading", errors),
    mother: readString(value, "mother", errors),
    category: readString(value, "category", errors),
    mastery: readString(value, "mastery", errors),
    importance: readString(value, "importance", errors),
    errorCount: readNumber(value, "errorCount", errors),
    lastReviewedAt: readNullableString(value, "lastReviewedAt", errors),
  };
}

function decodeMistake(value: unknown, index: number, errors: string[]): Mistake | null {
  if (!isRecord(value)) {
    errors.push(`projection.mistakes[${index}] must be an object`);
    return null;
  }
  if (typeof value.retry !== "boolean") errors.push(`projection.mistakes[${index}].retry must be boolean`);
  if (typeof value.resolved !== "boolean") errors.push(`projection.mistakes[${index}].resolved must be boolean`);
  return {
    id: readString(value, "id", errors),
    url: readString(value, "url", errors),
    title: readString(value, "title", errors),
    answer: readString(value, "answer", errors),
    correctAnswer: readString(value, "correctAnswer", errors),
    cause: readString(value, "cause", errors),
    retry: value.retry as boolean,
    resolved: value.resolved as boolean,
    errorDate: readNullableString(value, "errorDate", errors),
  };
}

function decodeReviewItem(value: unknown, index: number, errors: string[]): ReviewItem | null {
  if (!isRecord(value)) {
    errors.push(`projection.reviewQueue[${index}] must be an object`);
    return null;
  }
  if (value.kind !== "character" && value.kind !== "mistake") errors.push(`projection.reviewQueue[${index}].kind is invalid`);
  return {
    id: readString(value, "id", errors),
    kind: value.kind as ReviewItem["kind"],
    label: readString(value, "label", errors),
    reason: readString(value, "reason", errors),
  };
}

/** Strict decoder for the currently supported Kuzushiji projection. */
export function decodeKuzushijiV1Projection(value: unknown): KuzushijiV1Projection {
  const errors: string[] = [];
  if (!isRecord(value)) throw new ProjectReadContractError("invalid-kuzushiji-v1-projection", "Kuzushiji v1 projection must be an object");
  if (!Array.isArray(value.lectures)) errors.push("projection.lectures must be an array");
  if (!Array.isArray(value.characters)) errors.push("projection.characters must be an array");
  if (!Array.isArray(value.mistakes)) errors.push("projection.mistakes must be an array");
  if (!Array.isArray(value.reviewQueue)) errors.push("projection.reviewQueue must be an array");
  const lectures = Array.isArray(value.lectures)
    ? value.lectures.map((item, index) => decodeLecture(item, index, errors)).filter((item): item is Lecture => item !== null)
    : [];
  const characters = Array.isArray(value.characters)
    ? value.characters.map((item, index) => decodeCharacter(item, index, errors)).filter((item): item is Character => item !== null)
    : [];
  const mistakes = Array.isArray(value.mistakes)
    ? value.mistakes.map((item, index) => decodeMistake(item, index, errors)).filter((item): item is Mistake => item !== null)
    : [];
  const reviewQueue = Array.isArray(value.reviewQueue)
    ? value.reviewQueue.map((item, index) => decodeReviewItem(item, index, errors)).filter((item): item is ReviewItem => item !== null)
    : [];
  if (errors.length > 0) throw new ProjectReadContractError("invalid-kuzushiji-v1-projection", errors.join("; "));
  return { lectures, characters, mistakes, reviewQueue };
}

/**
 * Wrap the historical storage model without changing its bytes, hash, or
 * adoption metadata.  Hash verification remains the responsibility of the
 * existing snapshot/hash boundary.
 */
export function adaptScopeKnowledgeSnapshot(snapshot: ScopeKnowledgeSnapshot): ProjectReadSnapshot {
  assertValidScopeKnowledgeSnapshot(snapshot);
  return Object.freeze({
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    projectId: snapshot.projectId,
    generation: snapshot.generation,
    sourceReadStartedAt: snapshot.sourceReadStartedAt,
    sourceReadCompletedAt: snapshot.sourceReadCompletedAt,
    publishedAt: snapshot.publishedAt,
    validUntil: snapshot.validUntil,
    policyVersion: snapshot.scopePolicyVersion,
    projectionVersion: snapshot.knowledgeProjectionVersion,
    sourceEvidence: snapshot.sourceEvidence,
    subjectObservations: snapshot.scopeDecisions,
    projection: snapshot.knowledgeProjection,
    contentHash: snapshot.contentHash,
  });
}

/** Neutral-name alias for callers that do not need to mention legacy storage. */
export const toProjectReadSnapshot = adaptScopeKnowledgeSnapshot;

/** Reverse adapter used only when a legacy snapshot consumer is required. */
export function toScopeKnowledgeSnapshot(snapshot: ProjectReadSnapshot): ScopeKnowledgeSnapshot {
  return {
    snapshotId: snapshot.snapshotId,
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.projectId,
    generation: snapshot.generation,
    sourceReadStartedAt: snapshot.sourceReadStartedAt,
    sourceReadCompletedAt: snapshot.sourceReadCompletedAt,
    publishedAt: snapshot.publishedAt,
    validUntil: snapshot.validUntil,
    scopePolicyVersion: snapshot.policyVersion,
    knowledgeProjectionVersion: snapshot.projectionVersion,
    sourceEvidence: snapshot.sourceEvidence as ScopeKnowledgeSnapshotSourceEvidence,
    scopeDecisions: snapshot.subjectObservations as readonly ScopeKnowledgeSnapshotDecision[],
    knowledgeProjection: snapshot.projection,
    contentHash: snapshot.contentHash,
  };
}

/** Return generic and projection-specific errors without coercing unknown data. */
export function validateProjectReadSnapshot(value: unknown): string[] {
  const { errors, envelope } = validateEnvelope(value);
  if (!envelope) return errors;
  return validateProjectReadProjection(envelope.projectId, envelope.projectionVersion, envelope.projection);
}

/** Validate a projection only after the explicit project/version pair is selected. */
export function validateProjectReadProjection(
  projectId: string,
  projectionVersion: string,
  value: unknown,
): string[] {
  try {
    decodeProjectReadProjection(projectId, projectionVersion, value);
    return [];
  } catch (error) {
    if (error instanceof ProjectReadContractError) {
      if (error.code === "unsupported-project") return ["unsupported projectId"];
      if (error.code === "unsupported-projection-version") return ["unsupported projectionVersion"];
      if (error.code === "project-projection-mismatch") return ["project/projection version mismatch"];
      return [error.message];
    }
    return ["invalid project projection"];
  }
}

/** Explicit project/version dispatch for projection payloads. */
export function decodeProjectReadProjection(
  projectId: string,
  projectionVersion: string,
  value: unknown,
): KuzushijiV1Projection {
  if (!isKnownProjectId(projectId)) {
    throw new ProjectReadContractError("unsupported-project", `unsupported projectId: ${projectId}`);
  }
  if (projectId !== KUZUSHIJI_PROJECT_ID && projectionVersion === KUZUSHIJI_V1_PROJECTION_VERSION) {
    throw new ProjectReadContractError("project-projection-mismatch", `project ${projectId} cannot use ${projectionVersion}`);
  }
  if (projectionVersion !== KUZUSHIJI_V1_PROJECTION_VERSION) {
    throw new ProjectReadContractError("unsupported-projection-version", `unsupported projectionVersion: ${projectionVersion}`);
  }
  return decodeKuzushijiV1Projection(value);
}

/**
 * Strict project/version dispatch.  Adding another project requires an
 * explicit branch/decoder; unknown pairs cannot be silently interpreted.
 */
export function decodeProjectReadSnapshot(value: unknown): SupportedProjectReadSnapshot {
  const { errors, envelope } = validateEnvelope(value);
  if (!envelope) throw new ProjectReadContractError("invalid-envelope", errors.join("; "));
  const projection = decodeProjectReadProjection(envelope.projectId, envelope.projectionVersion, envelope.projection);
  return Object.freeze({
    schemaVersion: envelope.schemaVersion,
    snapshotId: envelope.snapshotId,
    projectId: KUZUSHIJI_PROJECT_ID,
    generation: envelope.generation,
    sourceReadStartedAt: envelope.sourceReadStartedAt,
    sourceReadCompletedAt: envelope.sourceReadCompletedAt,
    publishedAt: envelope.publishedAt,
    validUntil: envelope.validUntil,
    policyVersion: envelope.policyVersion,
    projectionVersion: KUZUSHIJI_V1_PROJECTION_VERSION,
    sourceEvidence: envelope.sourceEvidence,
    subjectObservations: envelope.subjectObservations,
    projection,
    contentHash: envelope.contentHash,
  });
}

/** Alias for callers that prefer a parse verb. */
export const parseProjectReadSnapshot = decodeProjectReadSnapshot;
