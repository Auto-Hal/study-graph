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

export interface GraphAdapter {
  projectId: string;
  load(): Promise<GraphData>;
}
