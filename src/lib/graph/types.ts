export type GraphMode = "notion" | "demo";

export type GraphNodeKindDefinition = {
  id: string;
  label: string;
  order: number;
};

export type GraphNode = {
  id: string;
  kind: string;
  label: string;
  meta: string;
  href: string | null;
  notionUrl: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
};

export type GraphData = {
  projectId: string;
  mode: GraphMode;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphLearningSignal = {
  lastGrade: "again" | "hard" | "good" | "easy";
  repetitions: number;
  intervalDays: number;
  lastReviewedAt: string;
  dueAt: string;
  due: boolean;
  weak: boolean;
  recent: boolean;
  weakNeighborCount: number;
};

export type GraphLearningOverlay = {
  mode: "supabase" | "unavailable";
  byNodeId: Record<string, GraphLearningSignal>;
  summary: {
    tracked: number;
    due: number;
    weak: number;
    recent: number;
    weakRelations: number;
  };
};

export interface GraphAdapter {
  projectId: string;
  load(): Promise<GraphData>;
}
