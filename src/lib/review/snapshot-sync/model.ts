import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import {
  buildKuzushijiReviewQueue,
  type KuzushijiSnapshotSource,
} from "../../notion/kuzushiji-snapshot-source.ts";
import { buildKuzushijiScopeSnapshot } from "../scope.ts";
import {
  createScopeKnowledgeSnapshot,
  isScopeKnowledgeSnapshotHashValid,
  type ScopeKnowledgeSnapshot,
} from "../offline/snapshot.ts";
import type { JsonValue } from "../exercises/revision.ts";

export const KUZUSHIJI_SNAPSHOT_PROJECT_ID = "kuzushiji" as const;
export const KUZUSHIJI_SCOPE_POLICY_VERSION = "phase4b-v1" as const;
export const KUZUSHIJI_KNOWLEDGE_PROJECTION_VERSION = "kuzushiji-v1" as const;

const VALIDITY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type KuzushijiSnapshotBuildInput = {
  source: KuzushijiSnapshotSource;
  snapshotId: string;
  generation: number;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  publishedAt: string;
};

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNonEmpty(value: string, field: string) {
  if (value.trim().length === 0) throw new Error(`${field} is required`);
}

function assertTimestamp(value: string, field: string) {
  assertNonEmpty(value, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} is invalid`);
}

function assertGeneration(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("generation must be a positive integer");
}

function sortLectures(lectures: readonly Lecture[]) {
  return [...lectures].sort((left, right) => left.sequence - right.sequence || compareStrings(left.id, right.id));
}

function sortCharacters(characters: readonly Character[]) {
  return [...characters].sort((left, right) => compareStrings(left.id, right.id));
}

function sortMistakes(mistakes: readonly Mistake[]) {
  return [...mistakes].sort((left, right) => compareStrings(left.id, right.id));
}

/**
 * The projection is intentionally scalar and small.  It is enough to rebuild
 * the Kuzushiji dashboard/queue in a later phase, but contains no runtime
 * fallback mode or sourceState that could be mistaken for knowledge authority.
 */
export function createKuzushijiKnowledgeProjection(source: KuzushijiSnapshotSource): JsonValue {
  const lectures = sortLectures(source.lectures);
  const characters = sortCharacters(source.characters);
  const mistakes = sortMistakes(source.mistakes);
  const reviewQueue = buildKuzushijiReviewQueue(characters, mistakes);
  return {
    lectures,
    characters,
    mistakes,
    reviewQueue,
  } as unknown as JsonValue;
}

function createScopeDecisions(source: KuzushijiSnapshotSource) {
  const scope = buildKuzushijiScopeSnapshot({
    sourceState: "ready",
    characters: source.characters,
  });
  return Object.entries(scope.decisions)
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([subjectId, decision]) => ({
      subjectId,
      status: decision.status,
      reasonCodes: [...decision.reasonCodes],
      anchorReferences: [...decision.anchorIds],
    }));
}

/** Build a content-addressed snapshot without touching Notion or Supabase. */
export function createKuzushijiScopeKnowledgeSnapshot(
  input: KuzushijiSnapshotBuildInput,
): ScopeKnowledgeSnapshot {
  assertNonEmpty(input.snapshotId, "snapshotId");
  assertGeneration(input.generation);
  assertTimestamp(input.sourceReadStartedAt, "sourceReadStartedAt");
  assertTimestamp(input.sourceReadCompletedAt, "sourceReadCompletedAt");
  assertTimestamp(input.publishedAt, "publishedAt");
  if (Date.parse(input.sourceReadCompletedAt) < Date.parse(input.sourceReadStartedAt)) {
    throw new Error("sourceReadCompletedAt must not precede sourceReadStartedAt");
  }
  if (!input.source.paginationComplete) throw new Error("snapshot source pagination is incomplete");
  if (!input.source.relationCompleteness) throw new Error("snapshot source relation evidence is incomplete");

  const validUntil = new Date(Date.parse(input.sourceReadCompletedAt) + VALIDITY_WINDOW_MS).toISOString();
  const snapshot = createScopeKnowledgeSnapshot({
    snapshotId: input.snapshotId,
    projectId: KUZUSHIJI_SNAPSHOT_PROJECT_ID,
    generation: input.generation,
    sourceReadStartedAt: input.sourceReadStartedAt,
    sourceReadCompletedAt: input.sourceReadCompletedAt,
    publishedAt: input.publishedAt,
    validUntil,
    scopePolicyVersion: KUZUSHIJI_SCOPE_POLICY_VERSION,
    knowledgeProjectionVersion: KUZUSHIJI_KNOWLEDGE_PROJECTION_VERSION,
    sourceEvidence: {
      sourceIdentifiers: [...input.source.sourceIdentifiers],
      paginationComplete: input.source.paginationComplete,
      // This is true because this version's projection does not consume
      // Notion relations; it is not evidence of a complete relation crawl.
      relationCompleteness: input.source.relationCompleteness,
    },
    scopeDecisions: createScopeDecisions(input.source),
    knowledgeProjection: createKuzushijiKnowledgeProjection(input.source),
  });
  if (!isScopeKnowledgeSnapshotHashValid(snapshot)) throw new Error("snapshot content hash validation failed");
  return snapshot;
}
