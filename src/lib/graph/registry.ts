import { unstable_cache } from "next/cache";
import type { GraphAdapter, GraphData } from "@/src/lib/graph/types";
import { defaultStudyProjectId, getStudyProject, studyProjects } from "@/src/lib/projects/registry";
import { getKuzushijiGraph } from "@/src/lib/notion/kuzushiji-graph";
import { getWesternArtHistoryGraph } from "@/src/lib/notion/western-art-history-graph";
import { getPhilosophyGraph } from "@/src/lib/notion/philosophy-graph";

const westernArtPlaceholderLabels = new Set([
  "芸術家",
  "作品",
  "様式・運動",
  "用語",
  "時代",
  "文化・歴史",
  "美術館・建築",
]);

function removeWesternArtPlaceholderNodes(graph: GraphData): GraphData {
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

const kuzushijiAdapter: GraphAdapter = {
  projectId: "kuzushiji",
  async load(): Promise<GraphData> {
    const graph = await getKuzushijiGraph();
    return {
      projectId: "kuzushiji",
      mode: graph.mode,
      nodes: graph.nodes.map((node) => ({
        ...node,
        href: node.href ?? (
          node.kind === "source"
            ? `/projects/kuzushiji/sources/${node.id}`
            : node.kind === "expression"
              ? `/projects/kuzushiji/expressions/${node.id}`
              : null
        ),
      })),
      edges: graph.edges,
    };
  },
};

const westernArtHistoryAdapter: GraphAdapter = {
  projectId: "western-art-history",
  async load(): Promise<GraphData> {
    return removeWesternArtPlaceholderNodes(await getWesternArtHistoryGraph());
  },
};

const philosophyAdapter: GraphAdapter = {
  projectId: "philosophy",
  load: getPhilosophyGraph,
};

const graphAdapters: Record<string, GraphAdapter> = {
  kuzushiji: kuzushijiAdapter,
  "western-art-history": westernArtHistoryAdapter,
  philosophy: philosophyAdapter,
};

const cachedGraphLoaders = Object.fromEntries(
  Object.entries(graphAdapters).map(([projectId, adapter]) => [
    projectId,
    unstable_cache(
      () => adapter.load(),
      [`study-graph:notion-graph:${projectId}:v1`],
      { revalidate: 300 },
    ),
  ]),
) as Record<string, () => Promise<GraphData>>;

export function getGraphProject(projectId: string | undefined | null) {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  if (requested?.status === "active" && graphAdapters[requested.id]) return requested;
  return getStudyProject(defaultStudyProjectId)!;
}

export function listGraphProjects() {
  return studyProjects.map((project) => ({ ...project, graphAvailable: Boolean(graphAdapters[project.id]) }));
}

export async function loadProjectGraph(projectId: string | undefined | null): Promise<GraphData> {
  const project = getGraphProject(projectId);
  return cachedGraphLoaders[project.id]();
}
