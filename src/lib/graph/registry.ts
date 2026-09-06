import type { GraphAdapter, GraphData } from "@/src/lib/graph/types";
import { defaultStudyProjectId, getStudyProject, studyProjects } from "@/src/lib/projects/registry";
import { getKuzushijiGraph } from "@/src/lib/notion/kuzushiji-graph";
import { getWesternArtHistoryGraph } from "@/src/lib/notion/western-art-history-graph";

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
  load: getWesternArtHistoryGraph,
};

const graphAdapters: Record<string, GraphAdapter> = {
  kuzushiji: kuzushijiAdapter,
  "western-art-history": westernArtHistoryAdapter,
};

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
  return graphAdapters[project.id].load();
}
