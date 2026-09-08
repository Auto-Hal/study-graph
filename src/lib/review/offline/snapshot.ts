import {
  canonicalizeJson,
  sha256Hex,
  type JsonValue,
} from "../exercises/revision.ts";
import { deepFreeze } from "./model.ts";

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;
/** Initial operational guidance; neither value is an SRS authority. */
export const SNAPSHOT_SYNC_TARGET_HOURS = 1 as const;
export const SNAPSHOT_VALIDITY_WINDOW_HOURS = 2 as const;
export const DEFAULT_SNAPSHOT_VALIDITY_HOURS = SNAPSHOT_VALIDITY_WINDOW_HOURS;

export type ScopeDecisionStatus = "eligible" | "ineligible" | "unknown";

export type ScopeKnowledgeSnapshotSourceEvidence = Readonly<{
  sourceIdentifiers: readonly string[];
  paginationComplete: boolean;
  relationCompleteness: boolean;
}>;

export type ScopeKnowledgeSnapshotDecision = Readonly<{
  subjectId: string;
  status: ScopeDecisionStatus;
  reasonCodes: readonly string[];
  anchorReferences: readonly string[];
}>;

/**
 * A server-observed, immutable projection of Notion. It is a display and
 * historical-evidence source; it is not itself current Scope authority.
 */
export type ScopeKnowledgeSnapshot = Readonly<{
  snapshotId: string;
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  projectId: string;
  generation: number;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  publishedAt: string;
  validUntil: string;
  scopePolicyVersion: string;
  knowledgeProjectionVersion: string;
  sourceEvidence: ScopeKnowledgeSnapshotSourceEvidence;
  scopeDecisions: readonly ScopeKnowledgeSnapshotDecision[];
  knowledgeProjection: JsonValue;
  contentHash: string;
}>;

export type ScopeKnowledgeSnapshotInput = Omit<ScopeKnowledgeSnapshot, "schemaVersion" | "contentHash"> & {
  schemaVersion?: typeof SNAPSHOT_SCHEMA_VERSION;
};

type SnapshotContent = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  projectId: string;
  scopePolicyVersion: string;
  knowledgeProjectionVersion: string;
  sourceEvidence: ScopeKnowledgeSnapshotSourceEvidence;
  scopeDecisions: readonly ScopeKnowledgeSnapshotDecision[];
  knowledgeProjection: JsonValue;
};

export type SnapshotAdoptionDecision =
  | { kind: "adopt"; reason: "no-current" | "newer-generation" }
  | { kind: "ignore"; reason: "older-generation" | "same-generation" | "same-generation-conflict" | "invalid-candidate" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validStatus(value: unknown): value is ScopeDecisionStatus {
  return value === "eligible" || value === "ineligible" || value === "unknown";
}

function validateStringArray(value: unknown, field: string, errors: string[]) {
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    errors.push(`${field} must be an array of non-empty strings`);
  }
}

export function validateScopeKnowledgeSnapshot(value: unknown, options: { requireContentHash?: boolean } = {}): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["ScopeKnowledgeSnapshot must be an object"];
  for (const field of [
    "snapshotId",
    "projectId",
    "sourceReadStartedAt",
    "sourceReadCompletedAt",
    "publishedAt",
    "validUntil",
    "scopePolicyVersion",
    "knowledgeProjectionVersion",
  ]) {
    if (!isNonEmptyString(value[field])) errors.push(`${field} is required`);
  }
  if ((options.requireContentHash ?? true) && !isNonEmptyString(value.contentHash)) errors.push("contentHash is required");
  if (value.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) errors.push("schemaVersion is unsupported");
  if (!isPositiveInteger(value.generation)) errors.push("generation must be a positive integer");
  if (!isRecord(value.sourceEvidence)) {
    errors.push("sourceEvidence is required");
  } else {
    validateStringArray(value.sourceEvidence.sourceIdentifiers, "sourceEvidence.sourceIdentifiers", errors);
    if (typeof value.sourceEvidence.paginationComplete !== "boolean") {
      errors.push("sourceEvidence.paginationComplete is required");
    }
    if (typeof value.sourceEvidence.relationCompleteness !== "boolean") {
      errors.push("sourceEvidence.relationCompleteness is required");
    }
  }
  if (!Array.isArray(value.scopeDecisions)) {
    errors.push("scopeDecisions is required");
  } else {
    for (const [index, decision] of value.scopeDecisions.entries()) {
      if (!isRecord(decision)) {
        errors.push(`scopeDecisions[${index}] must be an object`);
        continue;
      }
      if (!isNonEmptyString(decision.subjectId)) errors.push(`scopeDecisions[${index}].subjectId is required`);
      if (!validStatus(decision.status)) errors.push(`scopeDecisions[${index}].status is invalid`);
      validateStringArray(decision.reasonCodes, `scopeDecisions[${index}].reasonCodes`, errors);
      validateStringArray(decision.anchorReferences, `scopeDecisions[${index}].anchorReferences`, errors);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(value, "knowledgeProjection")) errors.push("knowledgeProjection is required");
  if (options.requireContentHash ?? true) {
    if (typeof value.contentHash === "string" && !/^[0-9a-f]{64}$/.test(value.contentHash)) errors.push("contentHash is invalid");
  }
  return errors;
}

export function assertValidScopeKnowledgeSnapshot(value: unknown): asserts value is ScopeKnowledgeSnapshot {
  const errors = validateScopeKnowledgeSnapshot(value);
  if (errors.length > 0) throw new Error("Invalid ScopeKnowledgeSnapshot: " + errors.join("; "));
}

/** Only semantic snapshot content participates in the hash. Observation metadata is excluded. */
function snapshotContentOf(value: ScopeKnowledgeSnapshot | ScopeKnowledgeSnapshotInput): SnapshotContent {
  const errors = validateScopeKnowledgeSnapshot(value, { requireContentHash: false });
  if (errors.length > 0) throw new Error("Invalid ScopeKnowledgeSnapshot content: " + errors.join("; "));
  return {
    schemaVersion: value.schemaVersion ?? SNAPSHOT_SCHEMA_VERSION,
    projectId: value.projectId,
    scopePolicyVersion: value.scopePolicyVersion,
    knowledgeProjectionVersion: value.knowledgeProjectionVersion,
    sourceEvidence: value.sourceEvidence,
    scopeDecisions: value.scopeDecisions,
    knowledgeProjection: value.knowledgeProjection,
  };
}

export function canonicalizeScopeKnowledgeSnapshotContent(value: ScopeKnowledgeSnapshot | ScopeKnowledgeSnapshotInput): string {
  return canonicalizeJson(snapshotContentOf(value));
}

export function hashScopeKnowledgeSnapshotContent(value: ScopeKnowledgeSnapshot | ScopeKnowledgeSnapshotInput): string {
  return sha256Hex(canonicalizeScopeKnowledgeSnapshotContent(value));
}

export function createScopeKnowledgeSnapshot(
  value: ScopeKnowledgeSnapshotInput,
): ScopeKnowledgeSnapshot {
  const candidate = {
    ...value,
    schemaVersion: value.schemaVersion ?? SNAPSHOT_SCHEMA_VERSION,
  };
  // Hash is computed only after the semantic fields have passed validation.
  const contentHash = hashScopeKnowledgeSnapshotContent(candidate);
  return deepFreeze({ ...candidate, contentHash });
}

export function isScopeKnowledgeSnapshotHashValid(value: ScopeKnowledgeSnapshot): boolean {
  try {
    assertValidScopeKnowledgeSnapshot(value);
    return value.contentHash === hashScopeKnowledgeSnapshotContent(value);
  } catch {
    return false;
  }
}

export function evaluateSnapshotAdoption(
  current: ScopeKnowledgeSnapshot | null,
  candidate: ScopeKnowledgeSnapshot,
): SnapshotAdoptionDecision {
  if (!isScopeKnowledgeSnapshotHashValid(candidate)) return { kind: "ignore", reason: "invalid-candidate" };
  if (current === null) return { kind: "adopt", reason: "no-current" };
  if (!isScopeKnowledgeSnapshotHashValid(current)) return { kind: "ignore", reason: "invalid-candidate" };
  if (candidate.generation > current.generation) return { kind: "adopt", reason: "newer-generation" };
  if (candidate.generation < current.generation) return { kind: "ignore", reason: "older-generation" };
  return candidate.contentHash === current.contentHash
    ? { kind: "ignore", reason: "same-generation" }
    : { kind: "ignore", reason: "same-generation-conflict" };
}

/** Generation, not validUntil, orders the current snapshot pointer. */
export function shouldAdoptSnapshot(current: ScopeKnowledgeSnapshot | null, candidate: ScopeKnowledgeSnapshot): boolean {
  return evaluateSnapshotAdoption(current, candidate).kind === "adopt";
}
