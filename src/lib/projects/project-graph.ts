import type { GraphData, GraphEdge, GraphNode } from "../graph/types.ts";
import type {
  KuzushijiV2Projection,
  PhilosophyCulture,
  PhilosophyLecture,
  PhilosophyPeriod,
  PhilosophyPhilosopher,
  PhilosophyProblem,
  PhilosophyTerm,
  PhilosophyThoughtNote,
  PhilosophyV1Projection,
  PhilosophyWork,
  WesternArtHistoryArtist,
  WesternArtHistoryArtwork,
  WesternArtHistoryCulture,
  WesternArtHistoryLecture,
  WesternArtHistoryMovement,
  WesternArtHistoryMuseum,
  WesternArtHistoryPeriod,
  WesternArtHistoryTerm,
  WesternArtHistoryV1Projection,
} from "./project-projections.ts";
import type { SupportedProjectReadSnapshot } from "./read-contract.ts";
import { learnerGraphMeta, workspaceNodeHref } from "./workspace.ts";

function joinMeta(values: readonly (string | null | undefined)[]) {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join("・");
}

function node(
  projectId: string,
  entity: { id: string; url: string; label: string; reviewText?: string | null },
  kind: string,
  meta: string,
): GraphNode {
  return {
    id: entity.id,
    kind,
    label: entity.label,
    // The projection contains learner-safe scalar metadata.  Keep the graph
    // converter presentation-only and remove historical implementation words
    // from the displayed metadata without changing the snapshot payload.
    meta: learnerGraphMeta(meta),
    ...(entity.reviewText ? { reviewText: entity.reviewText } : {}),
    href: workspaceNodeHref(projectId, kind, entity.id),
    notionUrl: entity.url,
  };
}

function edgesFromProjection(
  relations: readonly { id: string; sourceEntityId: string; targetEntityId: string; kind: string; label: string }[],
  nodes: readonly GraphNode[],
): GraphEdge[] {
  const nodeIds = new Set(nodes.map((entry) => entry.id));
  return relations
    .filter((relation) => nodeIds.has(relation.sourceEntityId) && nodeIds.has(relation.targetEntityId))
    .map((relation) => ({
      id: relation.id,
      source: relation.sourceEntityId,
      target: relation.targetEntityId,
      kind: relation.kind,
      label: relation.label,
    }));
}

const westernArtPlaceholderLabels = new Set([
  "芸術家",
  "作品",
  "様式・運動",
  "用語",
  "時代",
  "文化・歴史",
  "美術館・建築",
]);

function artEntityMeta(entity:
  | WesternArtHistoryLecture
  | WesternArtHistoryArtist
  | WesternArtHistoryArtwork
  | WesternArtHistoryMovement
  | WesternArtHistoryTerm
  | WesternArtHistoryPeriod
  | WesternArtHistoryCulture
  | WesternArtHistoryMuseum) {
  if ("sequence" in entity) return joinMeta([
    entity.sequence === null ? null : `第${entity.sequence}回`,
    entity.phase,
    entity.theme,
    entity.status,
  ]);
  if ("lifespan" in entity && "technique" in entity) return joinMeta([
    entity.lifespan,
    entity.region,
    entity.importance,
    entity.technique,
  ]);
  if ("productionYear" in entity) return joinMeta([
    entity.productionYear,
    entity.genre,
    entity.country,
    entity.importance,
    entity.subjects.slice(0, 2).join("・"),
  ]);
  if ("features" in entity && "years" in entity) return joinMeta([
    entity.years,
    "region" in entity && typeof entity.region === "string" ? entity.region : null,
    "importance" in entity && typeof entity.importance === "string" ? entity.importance : null,
    entity.features,
  ]);
  if ("category" in entity) return joinMeta([entity.category, entity.importance, entity.meaning]);
  if ("type" in entity && "established" in entity) return joinMeta([
    entity.type,
    entity.city,
    entity.country,
    entity.established,
    entity.description,
  ]);
  return joinMeta([
    "years" in entity && typeof entity.years === "string" ? entity.years : null,
    "type" in entity && typeof entity.type === "string" ? entity.type : null,
    "region" in entity && typeof entity.region === "string" ? entity.region : null,
    "description" in entity && typeof entity.description === "string" ? entity.description : null,
  ]);
}

function artNodes(projection: WesternArtHistoryV1Projection) {
  const rawNodes: GraphNode[] = [
    ...projection.lectures.map((entry) => node("western-art-history", entry, "lecture", artEntityMeta(entry))),
    ...projection.artists.map((entry) => node("western-art-history", entry, "artist", artEntityMeta(entry))),
    ...projection.artworks.map((entry) => node("western-art-history", entry, "artwork", artEntityMeta(entry))),
    ...projection.movements.map((entry) => node("western-art-history", entry, "movement", artEntityMeta(entry))),
    ...projection.terms.map((entry) => node("western-art-history", entry, "term", artEntityMeta(entry))),
    ...projection.periods.map((entry) => node("western-art-history", entry, "period", artEntityMeta(entry))),
    ...projection.culture.map((entry) => node("western-art-history", entry, "culture", artEntityMeta(entry))),
    ...projection.museums.map((entry) => node("western-art-history", entry, "museum", artEntityMeta(entry))),
  ];

  // The publisher preserves valid blank-title pages so the immutable source
  // observation is not rewritten.  The learner graph keeps the established
  // behavior of hiding only neutral placeholders with no useful metadata.
  const visibleNodes = rawNodes.filter(
    (entry) => !(entry.meta === "" && westernArtPlaceholderLabels.has(entry.label)),
  );
  return { rawNodes, visibleNodes };
}

export function westernArtHistoryProjectionToGraph(projection: WesternArtHistoryV1Projection): GraphData {
  const { visibleNodes } = artNodes(projection);
  return {
    projectId: "western-art-history",
    mode: "snapshot",
    nodes: visibleNodes,
    edges: edgesFromProjection(projection.relations, visibleNodes),
  };
}

function philosophyEntityMeta(entity:
  | PhilosophyLecture
  | PhilosophyPhilosopher
  | PhilosophyTerm
  | PhilosophyProblem
  | PhilosophyWork
  | PhilosophyCulture
  | PhilosophyPeriod
  | PhilosophyThoughtNote) {
  if ("sequence" in entity) return joinMeta([
    entity.sequence === null ? null : `第${entity.sequence}回`,
    entity.status,
    entity.question,
  ]);
  if ("lifespan" in entity && "schools" in entity) return joinMeta([
    entity.lifespan,
    entity.schools.slice(0, 2).join("・"),
    entity.regions.slice(0, 2).join("・"),
    entity.memo,
  ]);
  if ("fields" in entity && "definition" in entity) return joinMeta([
    entity.fields.slice(0, 2).join("・"),
    entity.definition,
  ]);
  if ("fields" in entity && "overview" in entity) return joinMeta([
    entity.fields.slice(0, 2).join("・"),
    entity.overview,
    entity.currentUnderstanding,
  ]);
  if ("author" in entity) return joinMeta([
    entity.author,
    entity.years,
    entity.genre,
    entity.priority,
    entity.completed ? "読了" : null,
  ]);
  if ("authorOrDirector" in entity) return joinMeta([
    entity.type,
    entity.authorOrDirector,
    entity.years,
    entity.comment,
  ]);
  if ("date" in entity) return joinMeta([
    entity.date,
    entity.content,
    entity.corrected ? "後から修正" : null,
  ]);
  return joinMeta([entity.years, entity.features]);
}

export function philosophyProjectionToGraph(projection: PhilosophyV1Projection): GraphData {
  const nodes: GraphNode[] = [
    ...projection.lectures.map((entry) => node("philosophy", entry, "lecture", philosophyEntityMeta(entry))),
    ...projection.philosophers.map((entry) => node("philosophy", entry, "philosopher", philosophyEntityMeta(entry))),
    ...projection.terms.map((entry) => node("philosophy", entry, "term", philosophyEntityMeta(entry))),
    ...projection.problems.map((entry) => node("philosophy", entry, "problem", philosophyEntityMeta(entry))),
    ...projection.works.map((entry) => node("philosophy", entry, "work", philosophyEntityMeta(entry))),
    ...projection.culture.map((entry) => node("philosophy", entry, "culture", philosophyEntityMeta(entry))),
    ...projection.periods.map((entry) => node("philosophy", entry, "period", philosophyEntityMeta(entry))),
    ...projection.thoughtNotes.map((entry) => node("philosophy", entry, "thought-note", philosophyEntityMeta(entry))),
  ];
  return {
    projectId: "philosophy",
    mode: "snapshot",
    nodes,
    edges: edgesFromProjection(projection.relations, nodes),
  };
}

function kuzushijiEntityMeta(entity:
  | KuzushijiV2Projection["lectures"][number]
  | KuzushijiV2Projection["characters"][number]
  | KuzushijiV2Projection["mistakes"][number]
  | KuzushijiV2Projection["sources"][number]
  | KuzushijiV2Projection["expressions"][number]) {
  if ("sequence" in entity) return joinMeta([
    entity.sequence === null ? null : `第${entity.sequence}回`,
    entity.theme,
    entity.status,
  ]);
  if ("glyph" in entity) return joinMeta([
    entity.reading,
    entity.mother ? `字母 ${entity.mother}` : null,
    entity.category,
    entity.mastery,
    entity.importance ? `重要度 ${entity.importance}` : null,
  ]);
  if ("correctAnswer" in entity) return joinMeta([
    entity.cause,
    entity.errorDate,
    entity.resolved ? "克服済み" : entity.retry ? "再出題" : "記録中",
  ]);
  if ("usage" in entity) return joinMeta([
    entity.usage,
    entity.materialType,
    entity.difficulty,
    entity.period,
    entity.era,
    entity.institution,
  ]);
  return joinMeta([
    entity.reading,
    entity.category,
    entity.meaning,
    entity.mastery,
    entity.importance ? `重要度 ${entity.importance}` : null,
  ]);
}

/** Convert the strict Kuzushiji v2 observation without consulting live Notion. */
export function kuzushijiV2ProjectionToGraph(projection: KuzushijiV2Projection): GraphData {
  const nodes: GraphNode[] = [
    ...projection.lectures.map((entry) => node("kuzushiji", { ...entry, label: entry.title || "講義" }, "lecture", kuzushijiEntityMeta(entry))),
    ...projection.characters.map((entry) => node("kuzushiji", { ...entry, label: entry.glyph || entry.reading || "文字" }, "character", kuzushijiEntityMeta(entry))),
    ...projection.mistakes.map((entry) => node("kuzushiji", { ...entry, label: entry.title || entry.correctAnswer || "誤読記録" }, "mistake", kuzushijiEntityMeta(entry))),
    ...projection.sources.map((entry) => node("kuzushiji", { ...entry, label: entry.title || "資料" }, "source", kuzushijiEntityMeta(entry))),
    ...projection.expressions.map((entry) => node("kuzushiji", { ...entry, label: entry.expression || entry.reading || "表現" }, "expression", kuzushijiEntityMeta(entry))),
  ];
  return {
    projectId: "kuzushiji",
    mode: "snapshot",
    nodes,
    edges: edgesFromProjection(projection.relations, nodes),
  };
}

export function projectReadSnapshotToGraph(snapshot: SupportedProjectReadSnapshot): GraphData {
  if (snapshot.projectId === "kuzushiji" && snapshot.projectionVersion === "kuzushiji-v2") {
    return kuzushijiV2ProjectionToGraph(snapshot.projection);
  }
  if (snapshot.projectId === "western-art-history" && snapshot.projectionVersion === "western-art-history-v1") {
    return westernArtHistoryProjectionToGraph(snapshot.projection);
  }
  if (snapshot.projectId === "philosophy" && snapshot.projectionVersion === "philosophy-v1") {
    return philosophyProjectionToGraph(snapshot.projection);
  }
  throw new Error(`unsupported snapshot graph project: ${snapshot.projectId}/${snapshot.projectionVersion}`);
}
