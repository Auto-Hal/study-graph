/**
 * Graph observations can come from the legacy live reader, a demo fixture,
 * or the verified server snapshot read path.  `snapshot` is deliberately a
 * separate mode so callers cannot mistake an immutable snapshot observation
 * for a live Notion response.
 */
export type GraphMode = "notion" | "demo" | "snapshot";
export type GraphSourceState = "ready" | "demo" | "unavailable";
export type GraphSnapshotState = "ready" | "stale" | "missing" | "unavailable" | "invalid-candidate" | "conflict";

export type GraphScopeAnchor = {
  id: string;
  completion: "completed" | "incomplete" | "unknown";
  date: string | null;
  directRelations: Array<{ nodeId: string; kind: string }>;
};

export type GraphScopeEvidence = {
  sourceState: GraphSourceState;
  anchors: GraphScopeAnchor[];
};

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
  reviewText?: string;
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
  /** Present for snapshot-backed observations; freshness is display-only. */
  snapshotState?: GraphSnapshotState;
  scope?: GraphScopeEvidence;
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
