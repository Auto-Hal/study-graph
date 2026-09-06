import "server-only";

import type { GraphEdge, GraphLearningOverlay, GraphLearningSignal, GraphNode } from "@/src/lib/graph/types";
import { getReviewStates, isReviewPersistenceConfigured } from "@/src/lib/supabase/review";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function emptyOverlay(): GraphLearningOverlay {
  return {
    mode: "unavailable",
    byNodeId: {},
    summary: {
      tracked: 0,
      due: 0,
      weak: 0,
      recent: 0,
      weakRelations: 0,
    },
  };
}

export async function getGraphLearningOverlay(nodes: GraphNode[], edges: GraphEdge[]): Promise<GraphLearningOverlay> {
  if (!isReviewPersistenceConfigured()) return emptyOverlay();

  try {
    const states = await getReviewStates();
    const nodeIds = new Set(nodes.map((node) => node.id));
    const now = Date.now();
    const byNodeId: Record<string, GraphLearningSignal> = {};

    for (const state of states) {
      if (!nodeIds.has(state.item_id)) continue;

      const dueAt = new Date(state.due_at).getTime();
      const lastReviewedAt = new Date(state.last_reviewed_at).getTime();

      byNodeId[state.item_id] = {
        lastGrade: state.last_grade,
        repetitions: state.repetitions,
        intervalDays: state.interval_days,
        lastReviewedAt: state.last_reviewed_at,
        dueAt: state.due_at,
        due: Number.isFinite(dueAt) && dueAt <= now,
        weak: state.last_grade === "again" || state.last_grade === "hard",
        recent: Number.isFinite(lastReviewedAt) && now - lastReviewedAt <= RECENT_WINDOW_MS,
        weakNeighborCount: 0,
      };
    }

    for (const edge of edges) {
      const source = byNodeId[edge.source];
      const target = byNodeId[edge.target];
      if (source && target?.weak) source.weakNeighborCount += 1;
      if (target && source?.weak) target.weakNeighborCount += 1;
    }

    const signals = Object.values(byNodeId);
    const weakNodeIds = new Set(Object.entries(byNodeId).filter(([, signal]) => signal.weak).map(([id]) => id));
    const weakRelations = edges.filter((edge) => weakNodeIds.has(edge.source) || weakNodeIds.has(edge.target)).length;

    return {
      mode: "supabase",
      byNodeId,
      summary: {
        tracked: signals.length,
        due: signals.filter((signal) => signal.due).length,
        weak: signals.filter((signal) => signal.weak).length,
        recent: signals.filter((signal) => signal.recent).length,
        weakRelations,
      },
    };
  } catch (error) {
    console.error("Study Graph: learning overlay fetch failed", error);
    return emptyOverlay();
  }
}
