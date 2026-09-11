import "server-only";

import type { GraphData } from "@/src/lib/graph/types";
import { getPhilosophyGraph } from "@/src/lib/notion/philosophy-graph";
import { getWesternArtHistoryGraph } from "@/src/lib/notion/western-art-history-graph";
import { workspaceNodeHref } from "@/src/lib/projects/workspace";

export type ReviewGraphPracticeSource = Omit<GraphData, "mode"> & {
  mode: "notion" | "demo";
};

const westernArtPlaceholderLabels = new Set([
  "芸術家",
  "作品",
  "様式・運動",
  "用語",
  "時代",
  "文化・歴史",
  "美術館・建築",
]);

/**
 * Review compatibility keeps the pre-snapshot Art practice candidate set.
 * Blank-title neutral placeholders remain in the source observation but are
 * hidden from learner-facing practice, exactly as the former graph registry
 * adapter did before the Art/Philosophy snapshot cutover.
 */
function asReviewGraphPracticeSource(graph: GraphData): ReviewGraphPracticeSource {
  if (graph.mode !== "notion" && graph.mode !== "demo") {
    throw new Error(`unsupported Review graph source mode: ${graph.mode}`);
  }
  return { ...graph, mode: graph.mode };
}

function removeWesternArtPlaceholderNodes(graph: ReviewGraphPracticeSource): ReviewGraphPracticeSource {
  if (graph.mode !== "notion") return graph;

  const nodes = graph.nodes.filter(
    (node) => !(node.meta === "" && westernArtPlaceholderLabels.has(node.label)),
  );
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    ...graph,
    nodes,
    edges: graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

function addWorkspaceHrefs(graph: ReviewGraphPracticeSource, projectId: "western-art-history" | "philosophy") {
  if (graph.mode !== "notion") return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      href: node.href ?? workspaceNodeHref(projectId, node.kind, node.id),
    })),
  };
}

/**
 * Review-only compatibility source.
 *
 * Normal Art/Philosophy learner routes must use the verified snapshot runtime.
 * This legacy source exists only because the current Graph-practice Review
 * scope still depends on GraphScopeEvidence (lecture completion/date and
 * direct relation anchors) that is intentionally not part of the v1 snapshot.
 */
export async function loadReviewGraphPracticeSource(
  projectId: "western-art-history" | "philosophy",
): Promise<ReviewGraphPracticeSource> {
  if (projectId === "western-art-history") {
    const graph = removeWesternArtPlaceholderNodes(asReviewGraphPracticeSource(await getWesternArtHistoryGraph()));
    return addWorkspaceHrefs(graph, projectId);
  }

  return addWorkspaceHrefs(asReviewGraphPracticeSource(await getPhilosophyGraph()), projectId);
}
