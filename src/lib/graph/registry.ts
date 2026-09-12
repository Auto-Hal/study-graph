import type { GraphData } from "@/src/lib/graph/types";
import { defaultStudyProjectId, getStudyProject, studyProjects } from "@/src/lib/projects/registry";
import { loadSnapshotProjectGraph, type SnapshotBackedProjectId } from "@/src/lib/projects/read-runtime";

const graphProjectIds = new Set(["kuzushiji", "western-art-history", "philosophy"]);

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
  if (graphProjectIds.has(project.id)) {
    // The normal graph registry is snapshot-only for every active project.
    // Review keeps its separate live Notion compatibility source and does not
    // call this loader.
    return loadSnapshotProjectGraph(project.id as SnapshotBackedProjectId);
  }
  return { projectId: project.id, mode: "demo", nodes: [], edges: [] };
}
