import { unstable_cache } from "next/cache";
import type { GraphAdapter, GraphData } from "@/src/lib/graph/types";
import { defaultStudyProjectId, getStudyProject, studyProjects } from "@/src/lib/projects/registry";
import { getKuzushijiGraph } from "@/src/lib/notion/kuzushiji-graph";
import { loadSnapshotProjectGraph } from "@/src/lib/projects/read-runtime";

/**
 * The legacy live reader remains the Kuzushiji compatibility path.  Art and
 * Philosophy are loaded by the neutral snapshot runtime below, so this
 * registry must never dispatch them to their old Notion Graph adapters.
 */
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
      scope: { sourceState: "unavailable", anchors: [] },
      edges: graph.edges,
    };
  },
};

const legacyGraphAdapters: Record<string, GraphAdapter> = {
  kuzushiji: kuzushijiAdapter,
};

const graphProjectIds = new Set(["kuzushiji", "western-art-history", "philosophy"]);

const cachedKuzushijiGraph = unstable_cache(
  () => kuzushijiAdapter.load(),
  ["study-graph:notion-graph:kuzushiji:v1"],
  { revalidate: 300 },
);

export function getGraphProject(projectId: string | undefined | null) {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  if (requested?.status === "active" && graphProjectIds.has(requested.id)) return requested;
  return getStudyProject(defaultStudyProjectId)!;
}

export function listGraphProjects() {
  return studyProjects.map((project) => ({ ...project, graphAvailable: project.status === "active" && graphProjectIds.has(project.id) }));
}

export async function loadProjectGraph(
  projectId: string | undefined | null,
  options: { cache?: boolean } = {},
): Promise<GraphData> {
  const project = getGraphProject(projectId);
  if (project.id === "western-art-history" || project.id === "philosophy") {
    // Snapshot-backed projects intentionally bypass the legacy GraphData
    // adapters.  This remains a read-only GET path and performs no refresh.
    return loadSnapshotProjectGraph(project.id);
  }
  const adapter = legacyGraphAdapters[project.id];
  if (!adapter) return { projectId: project.id, mode: "demo", nodes: [], edges: [] };
  if (options.cache === false) return adapter.load();
  return cachedKuzushijiGraph();
}
