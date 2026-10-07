import "server-only";

import type { KuzushijiDashboard, ReviewItem } from "@/src/lib/notion/kuzushiji";
import type { GraphData } from "@/src/lib/graph/types";
import type { StudyProjectDefinition } from "@/src/lib/projects/registry";
import type { ReviewState } from "@/src/lib/supabase/review";
import type { ReviewCard } from "./types";
import type { ScopeSnapshot } from "./scope";
import { eligibleNodeIds } from "./scope";
import { createDomainExercise } from "./domain-exercises";
import { createKuzushijiPilotReviewCard } from "./exercises/kuzushiji-adapter";

/** Shared by the read-only entry and the session; no archive/instance creation. */
export function kuzushijiVisualCandidates(project: StudyProjectDefinition, data: KuzushijiDashboard, scope: ScopeSnapshot): ReviewItem[] {
  return data.reviewQueue.filter((item) => {
    if (item.kind !== "character") return false;
    const character = data.characters.find((candidate) => candidate.id === item.id);
    return Boolean(character && scope.decisions[character.id]?.status === "eligible"
      && createKuzushijiPilotReviewCard(project, character, item));
  });
}

export function graphLegacyCandidates(input: {
  project: StudyProjectDefinition;
  graph: GraphData;
  scope: ScopeSnapshot;
  excludedIds: readonly string[];
  states: readonly ReviewState[];
  persisted: boolean;
}) {
  const ids = new Set(eligibleNodeIds(input.scope));
  for (const id of input.excludedIds) ids.delete(id);
  const kinds = new Set(input.project.review.eligibleKinds);
  const states = new Map(input.states.map((state) => [state.item_id, state]));
  return input.graph.nodes.filter((node) => ids.has(node.id) && kinds.has(node.kind))
    .map((node) => {
      const state = input.persisted ? states.get(node.id) : undefined;
      const card = createDomainExercise(input.project, input.graph, node, state, ids);
      return { card, state };
    })
    .filter((entry): entry is { card: ReviewCard; state: ReviewState | undefined } => Boolean(entry.card))
    .sort((a, b) => {
      // Tracked due items precede unseen, as in the existing Graph session.
      const rank = (state: ReviewState | undefined) => !state ? Infinity : Date.parse(state.due_at);
      return (rank(a.state) - rank(b.state)) || 0;
    });
}
