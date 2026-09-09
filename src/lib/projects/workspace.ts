import { getStudyProject, type StudyProjectDefinition } from "@/src/lib/projects/registry";

export type WorkspaceProjectId = "western-art-history" | "philosophy";
export type WorkspaceSectionGroup = "learning" | "knowledge";

export type WorkspaceSectionDefinition = {
  slug: string;
  kind: string;
  label: string;
  group: WorkspaceSectionGroup;
};

export type WorkspaceProjectDefinition = {
  id: WorkspaceProjectId;
  title: string;
  shortLabel: string;
  context: string;
  graphContext: string;
  graphHref: string;
  sections: readonly WorkspaceSectionDefinition[];
  sourceProject: StudyProjectDefinition;
};

const workspaceSections: Record<WorkspaceProjectId, readonly WorkspaceSectionDefinition[]> = {
  "western-art-history": [
    { slug: "lectures", kind: "lecture", label: "講義", group: "learning" },
    { slug: "artists", kind: "artist", label: "作家", group: "knowledge" },
    { slug: "artworks", kind: "artwork", label: "作品", group: "knowledge" },
    { slug: "movements", kind: "movement", label: "様式・運動", group: "knowledge" },
    { slug: "terms", kind: "term", label: "用語", group: "knowledge" },
    { slug: "periods", kind: "period", label: "時代", group: "knowledge" },
    { slug: "culture", kind: "culture", label: "文化・歴史", group: "knowledge" },
    { slug: "museums", kind: "museum", label: "美術館・建築", group: "knowledge" },
  ],
  philosophy: [
    { slug: "lectures", kind: "lecture", label: "講義", group: "learning" },
    { slug: "philosophers", kind: "philosopher", label: "哲学者", group: "knowledge" },
    { slug: "works", kind: "work", label: "原典・著作", group: "knowledge" },
    { slug: "terms", kind: "term", label: "用語", group: "knowledge" },
    { slug: "problems", kind: "problem", label: "哲学的問題", group: "knowledge" },
    { slug: "periods", kind: "period", label: "時代", group: "knowledge" },
    { slug: "culture", kind: "culture", label: "文化", group: "knowledge" },
    { slug: "thought-notes", kind: "thought-note", label: "思考ノート", group: "knowledge" },
  ],
};

const workspaceContexts: Record<WorkspaceProjectId, string> = {
  "western-art-history": "作品と時代の関係を学ぶ",
  philosophy: "思想・人物・著作のつながりを学ぶ",
};

const workspaceGraphContexts: Record<WorkspaceProjectId, string> = {
  "western-art-history": "作品・人物・時代の関係を見る",
  philosophy: "思想・人物・著作の関係を見る",
};

function isWorkspaceProjectId(value: string | undefined | null): value is WorkspaceProjectId {
  return value === "western-art-history" || value === "philosophy";
}

export function getWorkspaceProject(projectId: string | undefined | null): WorkspaceProjectDefinition | null {
  if (!isWorkspaceProjectId(projectId)) return null;
  const sourceProject = getStudyProject(projectId);
  if (!sourceProject || sourceProject.status !== "active") return null;
  return {
    id: projectId,
    title: sourceProject.title,
    shortLabel: sourceProject.shortLabel,
    context: workspaceContexts[projectId],
    graphContext: workspaceGraphContexts[projectId],
    graphHref: `/graph?project=${encodeURIComponent(projectId)}`,
    sections: workspaceSections[projectId],
    sourceProject,
  };
}

export function getWorkspaceSection(
  projectId: string | undefined | null,
  slug: string | undefined | null,
): WorkspaceSectionDefinition | null {
  const workspace = getWorkspaceProject(projectId);
  if (!workspace || !slug) return null;
  return workspace.sections.find((section) => section.slug === slug) ?? null;
}

export function getWorkspaceSectionForKind(
  projectId: string | undefined | null,
  kind: string | undefined | null,
): WorkspaceSectionDefinition | null {
  const workspace = getWorkspaceProject(projectId);
  if (!workspace || !kind) return null;
  return workspace.sections.find((section) => section.kind === kind) ?? null;
}

/**
 * Graph metadata is trusted content, but phase/source implementation labels are
 * not useful in the learner workspace. Keep the underlying graph unchanged and
 * remove only those presentation fragments here.
 */
export function learnerGraphMeta(meta: string | undefined | null) {
  return (meta ?? "")
    .split("・")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = part.toLocaleLowerCase("ja-JP");
      return !(
        normalized.includes("phase")
        || part.includes("フェーズ")
        || normalized.includes("adapter")
        || normalized.includes("notion")
        || normalized.includes("rpc")
        || normalized.includes("rls")
      );
    })
    .join("・");
}

export function workspaceNodeHref(projectId: string, kind: string, nodeId: string) {
  const section = getWorkspaceSectionForKind(projectId, kind);
  return section ? `/projects/${projectId}/${section.slug}/${encodeURIComponent(nodeId)}` : null;
}
