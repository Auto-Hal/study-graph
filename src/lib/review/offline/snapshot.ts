import { sha256Hex } from "../exercises/revision.ts";
import {
  assertValidScopeKnowledgeSnapshot,
  canonicalizeScopeKnowledgeSnapshotContent,
  compareVerifiedSnapshotAdoption,
  SNAPSHOT_SCHEMA_VERSION,
  type ScopeKnowledgeSnapshot,
  type ScopeKnowledgeSnapshotInput,
} from "./snapshot-content.ts";
import { freezeSnapshot } from "./snapshot-freeze.ts";

export * from "./snapshot-content.ts";

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
  return freezeSnapshot({ ...candidate, contentHash });
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
) {
  if (!isScopeKnowledgeSnapshotHashValid(candidate)) return { kind: "ignore", reason: "invalid-candidate" } as const;
  if (current !== null && !isScopeKnowledgeSnapshotHashValid(current)) return { kind: "ignore", reason: "invalid-candidate" } as const;
  return compareVerifiedSnapshotAdoption(current, candidate);
}

/** Generation, not validUntil, orders the current snapshot pointer. */
export function shouldAdoptSnapshot(current: ScopeKnowledgeSnapshot | null, candidate: ScopeKnowledgeSnapshot): boolean {
  return evaluateSnapshotAdoption(current, candidate).kind === "adopt";
}
