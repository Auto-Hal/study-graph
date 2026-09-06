"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GraphEdge, GraphNode, GraphNodeKind } from "@/src/lib/notion/kuzushiji-graph";

const kindOrder: GraphNodeKind[] = ["character", "mistake", "lecture", "source", "expression"];

const kindLabels: Record<GraphNodeKind, string> = {
  lecture: "講義",
  character: "文字",
  mistake: "誤読",
  source: "資料",
  expression: "表現",
};

const columnX: Record<GraphNodeKind, number> = {
  character: 130,
  mistake: 365,
  lecture: 600,
  source: 835,
  expression: 1070,
};

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export default function GraphExplorer({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [selectedId, setSelectedId] = useState(nodes.find((node) => node.kind === "lecture")?.id ?? nodes[0]?.id ?? "");
  const [focusKind, setFocusKind] = useState<GraphNodeKind | "all">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    return kindOrder.reduce<Record<GraphNodeKind, number>>(
      (acc, kind) => {
        acc[kind] = nodes.filter((node) => node.kind === kind).length;
        return acc;
      },
      { lecture: 0, character: 0, mistake: 0, source: 0, expression: 0 },
    );
  }, [nodes]);

  const canvasHeight = useMemo(() => {
    const maxCount = Math.max(1, ...kindOrder.map((kind) => counts[kind]));
    return Math.max(700, maxCount * 96 + 160);
  }, [counts]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();

    for (const kind of kindOrder) {
      const group = nodes.filter((node) => node.kind === kind);
      group.forEach((node, index) => {
        map.set(node.id, {
          x: columnX[kind],
          y: (canvasHeight / (group.length + 1)) * (index + 1),
        });
      });
    }

    return map;
  }, [canvasHeight, nodes]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");

  const nodeMatches = (node: GraphNode) => {
    const kindMatch = focusKind === "all" || node.kind === focusKind;
    const queryMatch =
      normalizedQuery.length === 0 || `${node.label} ${node.meta}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery);
    return kindMatch && queryMatch;
  };

  const connectedIds = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      edges.flatMap((edge) => {
        if (edge.source === selected.id) return [edge.target];
        if (edge.target === selected.id) return [edge.source];
        return [];
      }),
    );
  }, [edges, selected]);

  const connectedNodes = useMemo(() => {
    if (!selected) return [];
    const ids = unique(
      edges.flatMap((edge) => {
        if (edge.source === selected.id) return [edge.target];
        if (edge.target === selected.id) return [edge.source];
        return [];
      }),
    );
    return ids.flatMap((id) => {
      const node = nodes.find((item) => item.id === id);
      return node ? [node] : [];
    });
  }, [edges, nodes, selected]);

  const selectedEdges = selected
    ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id)
    : [];

  return (
    <section className="graph-workspace" aria-label="Knowledge Graph">
      <div className="graph-toolbar">
        <label className="graph-search">
          <span>検索</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="講義・文字・資料・表現を検索"
            type="search"
          />
        </label>

        <div className="graph-kind-filters" aria-label="ノード種類の強調">
          <button className={focusKind === "all" ? "active" : undefined} onClick={() => setFocusKind("all")} type="button">
            すべて <span>{nodes.length}</span>
          </button>
          {kindOrder.map((kind) => (
            <button
              className={focusKind === kind ? `active kind-${kind}` : `kind-${kind}`}
              key={kind}
              onClick={() => setFocusKind(kind)}
              type="button"
            >
              {kindLabels[kind]} <span>{counts[kind]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="graph-main-grid">
        <div className="graph-canvas-card">
          <div className="graph-canvas-heading">
            <div>
              <p className="eyebrow">RELATION MAP</p>
              <h2>くずし字 Knowledge Graph</h2>
            </div>
            <span>{edges.length} relations</span>
          </div>

          <div className="graph-canvas-scroll" tabIndex={0} aria-label="グラフ表示領域。横方向にスクロールできます。">
            <svg
              className="graph-svg"
              viewBox={`0 0 1200 ${canvasHeight}`}
              role="img"
              aria-label={`${nodes.length}個のノードと${edges.length}本のRelationを表示`}
            >
              <g className="graph-edges" aria-hidden="true">
                {edges.map((edge) => {
                  const source = positions.get(edge.source);
                  const target = positions.get(edge.target);
                  if (!source || !target) return null;
                  const isConnected = Boolean(selected && (edge.source === selected.id || edge.target === selected.id));
                  const sourceNode = nodes.find((node) => node.id === edge.source);
                  const targetNode = nodes.find((node) => node.id === edge.target);
                  const isDimmed = Boolean(
                    sourceNode && targetNode && (!nodeMatches(sourceNode) || !nodeMatches(targetNode)) && !isConnected,
                  );

                  return (
                    <line
                      className={`${isConnected ? "selected" : ""} ${isDimmed ? "dimmed" : ""}`}
                      key={edge.id}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                    />
                  );
                })}
              </g>

              <g className="graph-nodes">
                {nodes.map((node) => {
                  const position = positions.get(node.id);
                  if (!position) return null;
                  const isSelected = node.id === selectedId;
                  const isConnected = connectedIds.has(node.id);
                  const isDimmed = !nodeMatches(node) && !isSelected && !isConnected;

                  return (
                    <g
                      className={`graph-node kind-${node.kind} ${isSelected ? "selected" : ""} ${isConnected ? "connected" : ""} ${isDimmed ? "dimmed" : ""}`}
                      key={node.id}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(node.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      transform={`translate(${position.x} ${position.y})`}
                      aria-label={`${kindLabels[node.kind]} ${node.label}`}
                    >
                      <title>{`${kindLabels[node.kind]}: ${node.label}${node.meta ? ` / ${node.meta}` : ""}`}</title>
                      <rect x="-92" y="-37" width="184" height="74" rx="18" />
                      <text className="node-kind" x="0" y="-13" textAnchor="middle">{kindLabels[node.kind]}</text>
                      <text className="node-label" x="0" y="8" textAnchor="middle">{truncate(node.label, 15)}</text>
                      <text className="node-meta" x="0" y="27" textAnchor="middle">{truncate(node.meta, 20)}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="graph-legend" aria-label="凡例">
            {kindOrder.map((kind) => (
              <span className={`kind-${kind}`} key={kind}><i />{kindLabels[kind]}</span>
            ))}
          </div>
        </div>

        <aside className="graph-detail-card" aria-live="polite">
          {selected ? (
            <>
              <p className="eyebrow">SELECTED NODE</p>
              <span className={`graph-detail-kind kind-${selected.kind}`}>{kindLabels[selected.kind]}</span>
              <h2>{selected.label}</h2>
              <p className="graph-detail-meta">{selected.meta || "補足情報は未登録です。"}</p>

              <dl className="graph-detail-stats">
                <div><dt>接続ノード</dt><dd>{connectedNodes.length}</dd></div>
                <div><dt>Relation</dt><dd>{selectedEdges.length}</dd></div>
              </dl>

              {selectedEdges.length > 0 && (
                <div className="graph-relation-labels">
                  {unique(selectedEdges.map((edge) => edge.label)).map((label) => <span key={label}>{label}</span>)}
                </div>
              )}

              <div className="graph-connected-list">
                <h3>つながっている知識</h3>
                {connectedNodes.length > 0 ? connectedNodes.map((node) => (
                  <button key={node.id} onClick={() => setSelectedId(node.id)} type="button">
                    <span className={`graph-connected-kind kind-${node.kind}`}>{kindLabels[node.kind]}</span>
                    <strong>{node.label}</strong>
                  </button>
                )) : <p>Relationはまだありません。</p>}
              </div>

              <div className="graph-detail-actions">
                {selected.href ? (
                  <Link className="graph-primary-action" href={selected.href}>Study Graphで詳細を見る</Link>
                ) : selected.notionUrl !== "#" ? (
                  <a className="graph-primary-action" href={selected.notionUrl} target="_blank" rel="noreferrer">Notionで原本を開く</a>
                ) : null}
                {selected.href && selected.notionUrl !== "#" && (
                  <a href={selected.notionUrl} target="_blank" rel="noreferrer">Notionで開く</a>
                )}
              </div>
            </>
          ) : (
            <p className="graph-detail-empty">ノードを選択すると、Relationと詳細がここに表示されます。</p>
          )}
        </aside>
      </div>
    </section>
  );
}
