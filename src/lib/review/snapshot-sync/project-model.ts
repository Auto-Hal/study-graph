import type { JsonValue } from "../canonical-json.ts";
import {
  createScopeKnowledgeSnapshot,
  isScopeKnowledgeSnapshotHashValid,
} from "../offline/snapshot.ts";
import type { ScopeKnowledgeSnapshot } from "../offline/snapshot-content.ts";
import type { PhilosophySnapshotSource } from "../../notion/philosophy-snapshot-source.ts";
import type { WesternArtHistorySnapshotSource } from "../../notion/western-art-history-snapshot-source.ts";
import type {
  PhilosophyV1Projection,
  ProjectKnowledgeRelation,
  ProjectProjectionCompleteness,
  WesternArtHistoryV1Projection,
} from "../../projects/project-projections.ts";
import {
  decodePhilosophyV1Projection,
  decodeWesternArtHistoryV1Projection,
} from "../../projects/project-projections.ts";
import { NO_OBJECTIVE_SCOPE_POLICY_VERSION } from "../../projects/read-contract.ts";

export const WESTERN_ART_HISTORY_PROJECT_ID = "western-art-history" as const;
export const WESTERN_ART_HISTORY_KNOWLEDGE_PROJECTION_VERSION = "western-art-history-v1" as const;
export const PHILOSOPHY_PROJECT_ID = "philosophy" as const;
export const PHILOSOPHY_KNOWLEDGE_PROJECTION_VERSION = "philosophy-v1" as const;
const VALIDITY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type ProjectSnapshotBuildInput<TSource> = Readonly<{
  source: TSource;
  snapshotId: string;
  generation: number;
  sourceReadStartedAt: string;
  sourceReadCompletedAt: string;
  publishedAt: string;
}>;

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

function assertSource(source: { paginationComplete: true; relationCompleteness: true }) {
  if (source.paginationComplete !== true) throw new Error("snapshot source pagination is incomplete");
  if (source.relationCompleteness !== true) throw new Error("snapshot source relation evidence is incomplete");
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortById<T extends { id: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

function sortBySequence<T extends { id: string; sequence: number | null }>(items: readonly T[]) {
  return [...items].sort((left, right) =>
    (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER)
    || compareStrings(left.id, right.id));
}

function sortStrings(items: readonly string[]) {
  return [...items].sort(compareStrings);
}

function relationCompletenessKey(value: Pick<ProjectProjectionCompleteness["relationProperties"][number], "ownerKind" | "sourceEntityId" | "propertyName" | "relationKind">) {
  return [value.ownerKind, value.sourceEntityId, value.propertyName, value.relationKind].join("\u0000");
}

function sortRelations(items: readonly ProjectKnowledgeRelation[]) {
  return [...items].sort((left, right) => compareStrings(left.id, right.id));
}

function sortCompleteness(value: ProjectProjectionCompleteness): ProjectProjectionCompleteness {
  const relationProperties = [...value.relationProperties];
  const relationKeys = new Set<string>();
  for (const relation of relationProperties) {
    const key = relationCompletenessKey(relation);
    if (relationKeys.has(key)) throw new Error("relation completeness evidence is duplicated");
    relationKeys.add(key);
  }
  relationProperties.sort((left, right) => compareStrings(relationCompletenessKey(left), relationCompletenessKey(right)));
  return {
    dataSources: [...value.dataSources].sort((left, right) => compareStrings(left.sourceIdentifier, right.sourceIdentifier)),
    relationProperties,
    unresolvedTargets: sortStrings(value.unresolvedTargets),
  };
}

/**
 * Notion may return pages and multi-select values in different orders. Sort
 * every unordered collection before handing it to the historical hash
 * envelope so equal semantic observations produce equal content hashes.
 */
function normalizeWesternArtProjection(value: WesternArtHistoryV1Projection): WesternArtHistoryV1Projection {
  return {
    lectures: sortBySequence(value.lectures),
    artists: sortById(value.artists),
    artworks: sortById(value.artworks).map((item) => {
      const subjects = sortStrings(item.subjects);
      return {
        ...item,
        subjects,
        reviewText: subjects.length > 0 ? subjects.slice(0, 2).join("・") : null,
      };
    }),
    movements: sortById(value.movements),
    terms: sortById(value.terms),
    periods: sortById(value.periods),
    culture: sortById(value.culture),
    museums: sortById(value.museums),
    relations: sortRelations(value.relations),
    completeness: sortCompleteness(value.completeness),
  };
}

function normalizePhilosophyProjection(value: PhilosophyV1Projection): PhilosophyV1Projection {
  return {
    lectures: sortBySequence(value.lectures),
    philosophers: sortById(value.philosophers).map((item) => ({
      ...item,
      schools: sortStrings(item.schools),
      regions: sortStrings(item.regions),
    })),
    terms: sortById(value.terms).map((item) => ({ ...item, fields: sortStrings(item.fields) })),
    problems: sortById(value.problems).map((item) => ({ ...item, fields: sortStrings(item.fields) })),
    works: sortById(value.works),
    culture: sortById(value.culture),
    periods: sortById(value.periods),
    thoughtNotes: sortById(value.thoughtNotes),
    relations: sortRelations(value.relations),
    completeness: sortCompleteness(value.completeness),
  };
}

function buildProjectSnapshot<TSource extends {
  projection: unknown;
  sourceIdentifiers: readonly string[];
  paginationComplete: true;
  relationCompleteness: true;
}>(
  input: ProjectSnapshotBuildInput<TSource>,
  projectId: string,
  projectionVersion: string,
): ScopeKnowledgeSnapshot {
  assertNonEmpty(input.snapshotId, "snapshotId");
  assertGeneration(input.generation);
  assertTimestamp(input.sourceReadStartedAt, "sourceReadStartedAt");
  assertTimestamp(input.sourceReadCompletedAt, "sourceReadCompletedAt");
  assertTimestamp(input.publishedAt, "publishedAt");
  if (Date.parse(input.sourceReadCompletedAt) < Date.parse(input.sourceReadStartedAt)) {
    throw new Error("sourceReadCompletedAt must not precede sourceReadStartedAt");
  }
  assertSource(input.source);

  const snapshot = createScopeKnowledgeSnapshot({
    snapshotId: input.snapshotId,
    projectId,
    generation: input.generation,
    sourceReadStartedAt: input.sourceReadStartedAt,
    sourceReadCompletedAt: input.sourceReadCompletedAt,
    publishedAt: input.publishedAt,
    validUntil: new Date(Date.parse(input.sourceReadCompletedAt) + VALIDITY_WINDOW_MS).toISOString(),
    scopePolicyVersion: NO_OBJECTIVE_SCOPE_POLICY_VERSION,
    knowledgeProjectionVersion: projectionVersion,
    sourceEvidence: {
      sourceIdentifiers: [...input.source.sourceIdentifiers],
      paginationComplete: input.source.paginationComplete,
      relationCompleteness: input.source.relationCompleteness,
    },
    // Art History and Philosophy do not participate in Objective Scope in this
    // slice. An empty array is a non-participation marker, never a decision.
    scopeDecisions: [],
    // The strict project source readers return JSON-safe, versioned
    // projections.  The historical envelope stores that payload as JsonValue;
    // the corresponding versioned decoder is the trust boundary on read.
    knowledgeProjection: input.source.projection as JsonValue,
  });
  if (!isScopeKnowledgeSnapshotHashValid(snapshot)) throw new Error("snapshot content hash validation failed");
  return snapshot;
}

export function createWesternArtHistoryScopeKnowledgeSnapshot(
  input: ProjectSnapshotBuildInput<WesternArtHistorySnapshotSource>,
): ScopeKnowledgeSnapshot {
  const projection = normalizeWesternArtProjection(input.source.projection);
  decodeWesternArtHistoryV1Projection(projection);
  return buildProjectSnapshot({
    ...input,
    source: { ...input.source, projection },
  }, WESTERN_ART_HISTORY_PROJECT_ID, WESTERN_ART_HISTORY_KNOWLEDGE_PROJECTION_VERSION);
}

export function createPhilosophyScopeKnowledgeSnapshot(
  input: ProjectSnapshotBuildInput<PhilosophySnapshotSource>,
): ScopeKnowledgeSnapshot {
  const projection = normalizePhilosophyProjection(input.source.projection);
  decodePhilosophyV1Projection(projection);
  return buildProjectSnapshot({
    ...input,
    source: { ...input.source, projection },
  }, PHILOSOPHY_PROJECT_ID, PHILOSOPHY_KNOWLEDGE_PROJECTION_VERSION);
}
