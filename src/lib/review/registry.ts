import "server-only";

import { loadProjectGraph } from "@/src/lib/graph/registry";
import type { GraphNode } from "@/src/lib/graph/types";
import { getKuzushijiDashboard, type ReviewItem } from "@/src/lib/notion/kuzushiji";
import { defaultStudyProjectId, getActiveStudyProjects, getStudyProject, type StudyProjectDefinition } from "@/src/lib/projects/registry";
import { reviewAssetProvider } from "@/src/lib/review/assets/manifest";
import { attachReviewAssets } from "@/src/lib/review/assets/provider";
import { createDomainExercise } from "@/src/lib/review/domain-exercises";
import { createKuzushijiPilotReviewCard } from "@/src/lib/review/exercises/kuzushiji-adapter";
import { buildGraphScopeSnapshot, buildKuzushijiScopeSnapshot, eligibleNodeIds } from "@/src/lib/review/scope";
import type { ReviewCard, ReviewPersistenceMode, ReviewSessionContext } from "@/src/lib/review/types";
import { getDueReviewItems, getReviewStates, isReviewPersistenceConfigured, type ReviewState } from "@/src/lib/supabase/review";

export type ReviewProjectPayload = {
  project: StudyProjectDefinition;
  projects: StudyProjectDefinition[];
  cards: ReviewCard[];
  persistence: ReviewPersistenceMode;
  sourceMode: "notion" | "demo";
  session: ReviewSessionContext;
};

async function loadKuzushijiReview(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const data = await getKuzushijiDashboard();
  const scope = buildKuzushijiScopeSnapshot(data);
  const visualCandidates = data.reviewQueue.filter((item) => {
    if (item.kind !== "character") return false;
    const character = data.characters.find((candidate) => candidate.id === item.id);
    return Boolean(
      character &&
      scope.decisions[character.id]?.status === "eligible" &&
      createKuzushijiPilotReviewCard(project, character, item),
    );
  });

  const scheduled = data.mode === "notion"
    ? await getDueReviewItems(visualCandidates)
    : { items: visualCandidates, persistence: "fallback" as const };

  const selected: ReviewItem[] = [...scheduled.items];
  const selectedIds = new Set(selected.map((item) => item.id));
  for (const item of visualCandidates) {
    if (selected.length >= project.review.sessionSize) break;
    if (selectedIds.has(item.id)) continue;
    selected.push(item);
    selectedIds.add(item.id);
  }

  const cards: ReviewCard[] = selected
    .slice(0, project.review.sessionSize)
    .map((item) => {
      const character = data.characters.find((candidate) => candidate.id === item.id);
      return character ? createKuzushijiPilotReviewCard(project, character, item) : null;
    })
    .filter((card): card is ReviewCard => Boolean(card));

  return {
    project,
    projects: getActiveStudyProjects(),
    cards,
    persistence: scheduled.persistence,
    sourceMode: data.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: scheduled.items.length > 0 ? "scheduled" : "practice",
      historyHref: "/projects/kuzushiji/progress",
      emptyReason: scope.sourceState === "ready" ? "no-eligible-exercise" : "scope-unavailable",
    },
  };
}

async function loadGraphPractice(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const graph = await loadProjectGraph(project.id, { cache: false });
  const scope = buildGraphScopeSnapshot(project.id as "philosophy" | "western-art-history", graph);
  const eligibleIds = eligibleNodeIds(scope);
  const eligibleKinds = new Set(project.review.eligibleKinds);
  const eligibleNodes = graph.nodes.filter((node) => eligibleKinds.has(node.kind) && eligibleIds.has(node.id));
  let persistence: ReviewPersistenceMode = "fallback";
  let states: ReviewState[] = [];

  if (graph.mode === "notion" && scope.sourceState === "ready" && isReviewPersistenceConfigured()) {
    try {
      states = await getReviewStates();
      persistence = "supabase";
    } catch (error) {
      console.error(`Study Graph: ${project.id} review states unavailable`, error);
    }
  }

  const statesById = new Map(states.map((state) => [state.item_id, state]));
  const now = Date.now();
  const dueTracked = eligibleNodes
    .map((node) => ({ node, state: statesById.get(node.id) }))
    .filter((entry): entry is { node: GraphNode; state: ReviewState } => Boolean(entry.state) && new Date(entry.state!.due_at).getTime() <= now)
    .sort((a, b) => new Date(a.state.due_at).getTime() - new Date(b.state.due_at).getTime());
  const unseen = eligibleNodes.filter((node) => !statesById.has(node.id));
  const selected = persistence === "supabase"
    ? [...dueTracked.map((entry) => ({ node: entry.node, state: entry.state })), ...unseen.map((node) => ({ node, state: undefined }))]
    : eligibleNodes.map((node) => ({ node, state: undefined }));

  const cards = selected
    .map(({ node, state }) => createDomainExercise(project, graph, node, state, eligibleIds))
    .filter((card): card is ReviewCard => Boolean(card))
    .slice(0, project.review.sessionSize);
  return {
    project,
    projects: getActiveStudyProjects(),
    cards: attachReviewAssets(cards, reviewAssetProvider),
    persistence,
    sourceMode: graph.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: "practice",
      emptyReason: scope.sourceState === "ready" ? "no-eligible-exercise" : "scope-unavailable",
    },
  };
}

export async function loadReviewProject(projectId: string | undefined | null): Promise<ReviewProjectPayload> {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  const project = requested?.status === "active" ? requested : getStudyProject(defaultStudyProjectId)!;
  return project.review.strategy === "notion-queue" ? loadKuzushijiReview(project) : loadGraphPractice(project);
}
