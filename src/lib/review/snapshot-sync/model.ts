import type { Character, Lecture, Mistake } from "../../notion/kuzushiji.ts";
import {
  buildKuzushijiReviewQueue,
  type KuzushijiSnapshotSource,
} from "../../notion/kuzushiji-snapshot-source.ts";
import type { KuzushijiV2SnapshotSource } from "../../notion/kuzushiji-v2-snapshot-source.ts";
import { buildKuzushijiScopeSnapshot } from "../scope.ts";
import {
  createScopeKnowledgeSnapshot,
  isScopeKnowledgeSnapshotHashValid,
  type ScopeKnowledgeSnapshot,
} from "../offline/snapshot.ts";
import type { JsonValue } from "../exercises/revision.ts";
import type { KuzushijiV2Projection, ProjectProjectionCompleteness } from "../../projects/project-projections.ts";
import { decodeKuzushijiV2Projection, KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from "../../projects/project-projections.ts";

export const KUZUSHIJI_SNAPSHOT_PROJECT_ID = "kuzushiji" as const;
export const KUZUSHIJI_SCOPE_POLICY_VERSION = "phase4b-v1" as const;
export const KUZUSHIJI_KNOWLEDGE_PROJECTION_VERSION = "kuzushiji-v1" as const;
export const KUZUSHIJI_V1_KNOWLEDGE_PROJECTION_VERSION = KUZUSHIJI_KNOWLEDGE_PROJECTION_VERSION;
export const KUZUSHIJI_V2_KNOWLEDGE_PROJECTION_VERSION = "kuzushiji-v2" as const;
export const KUZUSHIJI_V2_PROJECTION_VERSION = KUZUSHIJI_V2_KNOWLEDGE_PROJECTION_VERSION;

const VALIDITY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type KuzushijiSnapshotBuildInput = {
  source: KuzushijiSnapshotSource;
  snapshotId: string;
  generation: number;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  publishedAt: string;
};

export type KuzushijiV2SnapshotBuildInput = {
  source: KuzushijiV2SnapshotSource;
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

function createScopeDecisions(source: { characters: readonly Character[] }) {
  const scope = buildKuzushijiScopeSnapshot({
    sourceState: "ready",
    characters: [...source.characters],
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

function relationCompletenessKey(value: Pick<ProjectProjectionCompleteness["relationProperties"][number], "ownerKind" | "sourceEntityId" | "propertyName" | "relationKind">) {
  return [value.ownerKind, value.sourceEntityId, value.propertyName, value.relationKind].join("\u0000");
}

function normalizeKuzushijiV2Projection(value: KuzushijiV2Projection): KuzushijiV2Projection {
  const lectures = [...value.lectures].sort((left, right) => left.sequence - right.sequence || compareStrings(left.id, right.id));
  const characters = [...value.characters].sort((left, right) => compareStrings(left.id, right.id));
  const mistakes = [...value.mistakes].sort((left, right) => compareStrings(left.id, right.id));
  const sources = [...value.sources].sort((left, right) => compareStrings(left.id, right.id));
  const expressions = [...value.expressions].sort((left, right) => compareStrings(left.id, right.id));
  const relations = [...value.relations].sort((left, right) => compareStrings(left.id, right.id));
  const relationProperties = [...value.completeness.relationProperties];
  const relationKeys = new Set<string>();
  for (const relation of relationProperties) {
    const key = relationCompletenessKey(relation);
    if (relationKeys.has(key)) throw new Error("relation completeness evidence is duplicated");
    relationKeys.add(key);
  }
  relationProperties.sort((left, right) => compareStrings(relationCompletenessKey(left), relationCompletenessKey(right)));
  const unresolvedTargets = [...value.completeness.unresolvedTargets].sort(compareStrings);
  if (new Set(unresolvedTargets).size !== unresolvedTargets.length) throw new Error("unresolved relation targets are duplicated");
  const sourceIdentifiers = [...value.completeness.dataSources].sort((left, right) => compareStrings(left.sourceIdentifier, right.sourceIdentifier));
  const normalized: KuzushijiV2Projection = {
    lectures,
    characters,
    mistakes,
    sources,
    expressions,
    // The queue business rule is deliberately shared with the historical v1
    // projection and is not a second SRS authority.
    reviewQueue: buildKuzushijiReviewQueue(characters, mistakes),
    relations,
    completeness: {
      dataSources: sourceIdentifiers,
      relationProperties,
      unresolvedTargets,
    },
  };
  decodeKuzushijiV2Projection(normalized);
  return normalized;
}

export function createKuzushijiV2KnowledgeProjection(source: KuzushijiV2SnapshotSource): JsonValue {
  return normalizeKuzushijiV2Projection(source.projection) as unknown as JsonValue;
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

/** Build the relation-complete, hash-covered Kuzushiji v2 observation. */
export function createKuzushijiV2ScopeKnowledgeSnapshot(
  input: KuzushijiV2SnapshotBuildInput,
): ScopeKnowledgeSnapshot {
  assertNonEmpty(input.snapshotId, "snapshotId");
  assertGeneration(input.generation);
  assertTimestamp(input.sourceReadStartedAt, "sourceReadStartedAt");
  assertTimestamp(input.sourceReadCompletedAt, "sourceReadCompletedAt");
  assertTimestamp(input.publishedAt, "publishedAt");
  if (Date.parse(input.sourceReadCompletedAt) < Date.parse(input.sourceReadStartedAt)) {
    throw new Error("sourceReadCompletedAt must not precede sourceReadStartedAt");
  }
  if (input.source.paginationComplete !== true) throw new Error("snapshot source pagination is incomplete");
  if (input.source.relationCompleteness !== true) throw new Error("snapshot source relation evidence is incomplete");
  if (
    input.source.sourceIdentifiers.length !== KUZUSHIJI_V2_SOURCE_IDENTIFIERS.length
    || new Set(input.source.sourceIdentifiers).size !== input.source.sourceIdentifiers.length
    || input.source.sourceIdentifiers.some((id) => !(KUZUSHIJI_V2_SOURCE_IDENTIFIERS as readonly string[]).includes(id))
  ) {
    throw new Error("Kuzushiji v2 source identifiers are incomplete");
  }

  const projection = createKuzushijiV2KnowledgeProjection(input.source) as unknown as KuzushijiV2Projection;
  const projectionSourceIdentifiers = projection.completeness.dataSources.map((item) => item.sourceIdentifier);
  if (
    projectionSourceIdentifiers.length !== input.source.sourceIdentifiers.length
    || projectionSourceIdentifiers.some((id) => !input.source.sourceIdentifiers.includes(id))
  ) {
    throw new Error("Kuzushiji v2 source evidence does not match projection completeness");
  }
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
    knowledgeProjectionVersion: KUZUSHIJI_V2_KNOWLEDGE_PROJECTION_VERSION,
    sourceEvidence: {
      sourceIdentifiers: [...input.source.sourceIdentifiers].sort(compareStrings),
      paginationComplete: input.source.paginationComplete,
      relationCompleteness: input.source.relationCompleteness,
    },
    // Scope remains the existing Character-only phase4b-v1 policy. Sources,
    // expressions, and graph relations never add subjects or alter decisions.
    scopeDecisions: createScopeDecisions({ characters: projection.characters }),
    knowledgeProjection: projection as unknown as JsonValue,
  });
  if (!isScopeKnowledgeSnapshotHashValid(snapshot)) throw new Error("snapshot content hash validation failed");
  return snapshot;
}
