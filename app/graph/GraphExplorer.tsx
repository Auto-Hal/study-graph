"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GraphEdge, GraphNode, GraphNodeKindDefinition } from "@/src/lib/graph/types";

type ViewMode = "overview" | "focus";

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function kindClass(kind: string) {
  return `kind-${kind.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function GraphExplorer({
  projectId,
  kindDefinitions,
  nodes,
  edges,
  initialNodeId,
  initialRelation,
  initialView = "overview",
}: {
  projectId: string;
  kindDefinitions: GraphNodeKindDefinition[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  initialNodeId?: string;
  initialRelation?: string;
  initialView?: ViewMode;
}) {
  const orderedKinds = useMemo(() => [...kindDefinitions].sort((a, b) => a.order - b.order), [kindDefinitions]);
  const kindLabels = useMemo(() => new Map(orderedKinds.map((kind) => [kind.id, kind.label])), [orderedKinds]);
  const relationLabels = useMemo(() => unique(edges.map((edge) => edge.label)).sort((a, b) => a.localeCompare(b, "ja")), [edges]);
  const fallbackId = nodes.find((node) => node.kind === "lecture")?.id ?? nodes[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(nodes.some((node) => node.id === initialNodeId) ? initialNodeId! : fallbackId);
  const [focusKind, setFocusKind] = useState<string | "all">("all");
  const [relationFilter, setRelationFilter] = useState(initialRelation && relationLabels.includes(initialRelation) ? initialRelation : "all");
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const kind of orderedKinds) result[kind.id] = nodes.filter((node) => node.kind === kind.id).length;
    return result;
  }, [nodes, orderedKinds]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const filteredEdges = useMemo(() => relationFilter === "all" ? edges : edges.filter((edge) => edge.label === relationFilter), [edges, relationFilter]);
  const selectedEdges = selected ? filteredEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
  const connectedIds = useMemo(() => new Set(selectedEdges.flatMap((edge) => edge.source === selectedId ? [edge.target] : [edge.source])), [selectedEdges, selectedId]);
  const connectedNodes = useMemo(() => nodes.filter((node) => connectedIds.has(node.id)), [connectedIds, nodes]);

  const denseLevel = nodes.length > 100 ? 2 : nodes.length > 40 ? 1 : 0;
  const overviewHeight = useMemo(() => {
    const maxCount = Math.max(1, ...orderedKinds.map((kind) => counts[kind.id] ?? 0));
    const spacing = denseLevel === 2 ? 66 : denseLevel === 1 ? 78 : 96;
    return Math.max(700, maxCount * spacing + 160);
  }, [counts, denseLevel, orderedKinds]);
  const focusHeight = Math.max(700, 620 + Math.max(0, Math.ceil(connectedNodes.length / 10) - 1) * 150);
  const canvasHeight = viewMode === "focus" ? focusHeight : overviewHeight;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (viewMode === "focus" && selected) {
      map.set(selected.id, { x: 600, y: canvasHeight / 2 });
      connectedNodes.forEach((node, index) => {
        const ring = Math.floor(index / 10);
        const offset = ring * 10;
        const ringCount = Math.min(10, connectedNodes.length - offset);
        const positionInRing = index - offset;
        const angle = -Math.PI / 2 + (Math.PI * 2 * positionInRing) / Math.max(1, ringCount);
        const radiusX = Math.min(450, 330 + ring * 70);
        const radiusY = Math.min(canvasHeight / 2 - 80, 230 + ring * 55);
        map.set(node.id, { x: 600 + Math.cos(angle) * radiusX, y: canvasHeight / 2 + Math.sin(angle) * radiusY });
      });
      return map;
    }

    const kindCount = Math.max(1, orderedKinds.length);
    orderedKinds.forEach((kind, kindIndex) => {
      const x = kindCount === 1 ? 600 : 130 + (940 * kindIndex) / (kindCount - 1);
      const group = nodes.filter((node) => node.kind === kind.id);
      group.forEach((node, index) => map.set(node.id, { x, y: (canvasHeight / (group.length + 1)) * (index + 1) }));
    });
    return map;
  }, [canvasHeight, connectedNodes, nodes, orderedKinds, selected, viewMode]);

  const displayNodes = viewMode === "focus" && selected ? nodes.filter((node) => node.id === selected.id || connectedIds.has(node.id)) : nodes;
  const displayEdges = viewMode === "focus" && selected ? selectedEdges : filteredEdges;
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const nodeMatches = (node: GraphNode) => {
    const typeMatch = focusKind === "all" || node.kind === focusKind;
    const queryMatch = normalizedQuery.length === 0 || `${node.label} ${node.meta}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery);
    return typeMatch && queryMatch;
  };

  useEffect(() => {
    if (!selectedId || typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("project", projectId);
    params.set("node", selectedId);
    if (relationFilter !== "all") params.set("relation", relationFilter);
    if (viewMode === "focus") params.set("view", "focus");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [projectId, relationFilter, selectedId, viewMode]);

  async function copyCurrentUrl() {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const nodeWidth = denseLevel === 2 ? 142 : denseLevel === 1 ? 162 : 184;
  const nodeHeight = denseLevel === 2 ? 58 : denseLevel === 1 ? 66 : 74;

  return (
    <section className={`graph-workspace density-${denseLevel}`} aria-label="Knowledge Graph">
      <div className="graph-toolbar graph-toolbar-depth">
        <label className="graph-search"><span>検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="知識ノードを検索" type="search" /></label>
        <label className="graph-relation-filter"><span>Relation</span><select value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option value="all">すべてのRelation ({edges.length})</option>{relationLabels.map((label) => <option key={label} value={label}>{label} ({edges.filter((edge) => edge.label === label).length})</option>)}</select></label>
        <div className="graph-view-actions" aria-label="Graph表示モード"><button className={viewMode === "overview" ? "active" : undefined} onClick={() => setViewMode("overview")} type="button">全体</button><button className={viewMode === "focus" ? "active" : undefined} disabled={!selected} onClick={() => setViewMode("focus")} type="button">選択中心</button><button onClick={copyCurrentUrl} type="button">{copied ? "コピー済み" : "URLをコピー"}</button></div>
      </div>

      <div className="graph-kind-filters graph-kind-filters-secondary" aria-label="ノード種類の強調">
        <button className={focusKind === "all" ? "active" : undefined} onClick={() => setFocusKind("all")} type="button">すべて <span>{nodes.length}</span></button>
        {orderedKinds.map((kind) => <button className={focusKind === kind.id ? `active ${kindClass(kind.id)}` : kindClass(kind.id)} key={kind.id} onClick={() => setFocusKind(kind.id)} type="button">{kind.label} <span>{counts[kind.id] ?? 0}</span></button>)}
      </div>

      <div className="graph-main-grid">
        <div className="graph-canvas-card">
          <div className="graph-canvas-heading"><div><p className="eyebrow">{viewMode === "focus" ? "FOCUSED RELATIONS" : "RELATION MAP"}</p><h2>{viewMode === "focus" && selected ? `${selected.label} を中心に表示` : "Knowledge Graph"}</h2></div><span>{displayEdges.length} relations</span></div>
          <div className="graph-canvas-scroll" tabIndex={0} aria-label="グラフ表示領域。横方向にスクロールできます。">
            <svg className="graph-svg" viewBox={`0 0 1200 ${canvasHeight}`} role="img" aria-label={`${displayNodes.length}個のノードと${displayEdges.length}本のRelationを表示`}>
              <g className="graph-edges" aria-hidden="true">
                {displayEdges.map((edge) => {
                  const source = positions.get(edge.source); const target = positions.get(edge.target); if (!source || !target) return null;
                  const isConnected = Boolean(selected && (edge.source === selected.id || edge.target === selected.id));
                  const sourceNode = nodes.find((node) => node.id === edge.source); const targetNode = nodes.find((node) => node.id === edge.target);
                  const isDimmed = Boolean(sourceNode && targetNode && (!nodeMatches(sourceNode) || !nodeMatches(targetNode)) && !isConnected);
                  return <line className={`${isConnected ? "selected" : ""} ${isDimmed ? "dimmed" : ""}`} key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
                })}
              </g>
              <g className="graph-nodes">
                {displayNodes.map((node) => {
                  const position = positions.get(node.id); if (!position) return null;
                  const isSelected = node.id === selectedId; const isConnected = connectedIds.has(node.id); const isDimmed = !nodeMatches(node) && !isSelected && !isConnected;
                  const label = kindLabels.get(node.kind) ?? node.kind;
                  return <g className={`graph-node ${kindClass(node.kind)} ${isSelected ? "selected" : ""} ${isConnected ? "connected" : ""} ${isDimmed ? "dimmed" : ""}`} key={node.id} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(node.id); } }} role="button" tabIndex={0} transform={`translate(${position.x} ${position.y})`} aria-label={`${label} ${node.label}`}>
                    <title>{`${label}: ${node.label}${node.meta ? ` / ${node.meta}` : ""}`}</title><rect x={-nodeWidth / 2} y={-nodeHeight / 2} width={nodeWidth} height={nodeHeight} rx={denseLevel === 2 ? 14 : 18} /><text className="node-kind" x="0" y={denseLevel === 2 ? -9 : -13} textAnchor="middle">{label}</text><text className="node-label" x="0" y="8" textAnchor="middle">{truncate(node.label, denseLevel === 2 ? 11 : denseLevel === 1 ? 13 : 15)}</text><text className="node-meta" x="0" y={denseLevel === 2 ? 22 : 27} textAnchor="middle">{truncate(node.meta, denseLevel === 2 ? 14 : 20)}</text>
                  </g>;
                })}
              </g>
            </svg>
          </div>
          <div className="graph-legend" aria-label="凡例">{orderedKinds.map((kind) => <span className={kindClass(kind.id)} key={kind.id}><i />{kind.label}</span>)}</div>
        </div>

        <aside className="graph-detail-card" aria-live="polite">
          {selected ? <><p className="eyebrow">SELECTED NODE</p><span className={`graph-detail-kind ${kindClass(selected.kind)}`}>{kindLabels.get(selected.kind) ?? selected.kind}</span><h2>{selected.label}</h2><p className="graph-detail-meta">{selected.meta || "補足情報は未登録です。"}</p><dl className="graph-detail-stats"><div><dt>接続ノード</dt><dd>{connectedNodes.length}</dd></div><div><dt>表示Relation</dt><dd>{selectedEdges.length}</dd></div></dl>{selectedEdges.length > 0 && <div className="graph-relation-labels">{unique(selectedEdges.map((edge) => edge.label)).map((label) => <button key={label} onClick={() => setRelationFilter(label)} type="button">{label}</button>)}</div>}<div className="graph-connected-list"><h3>つながっている知識</h3>{connectedNodes.length > 0 ? connectedNodes.map((node) => <button key={node.id} onClick={() => setSelectedId(node.id)} type="button"><span className={`graph-connected-kind ${kindClass(node.kind)}`}>{kindLabels.get(node.kind) ?? node.kind}</span><strong>{node.label}</strong></button>) : <p>{relationFilter === "all" ? "Relationはまだありません。" : "このRelationでは接続がありません。"}</p>}</div><div className="graph-detail-actions">{selected.href && <Link className="graph-primary-action" href={selected.href}>Study Graphで詳細を見る</Link>}{selected.notionUrl !== "#" && <a href={selected.notionUrl} target="_blank" rel="noreferrer">Notionで開く</a>}</div></> : <p className="graph-detail-empty">ノードを選択すると、Relationと詳細がここに表示されます。</p>}
        </aside>
      </div>
    </section>
  );
}
