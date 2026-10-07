import "server-only";

import { getKuzushijiDashboard, type ReviewItem } from "@/src/lib/notion/kuzushiji";
import { defaultStudyProjectId, getActiveStudyProjects, getStudyProject, type StudyProjectDefinition } from "@/src/lib/projects/registry";
import { reviewAssetProvider } from "@/src/lib/review/assets/manifest";
import { attachReviewAssets } from "@/src/lib/review/assets/provider";
import { createKuzushijiPilotReviewCard } from "@/src/lib/review/exercises/kuzushiji-adapter";
import { isPilotIssuanceEnabled } from "@/src/lib/review/pilot-operations";
import { isKuzushijiPilotDefinition, issueKuzushijiPilotReview } from "@/src/lib/review/pilot-runtime";
import { ObjectiveRuntimeError } from "@/src/lib/review/objective-runtime-core";
import { philosophyObjectiveScopeSubjectIds } from "@/src/lib/review/philosophy-objective-registry";
import { isPhilosophyPilotIssuanceEnabled, issuePhilosophyObjectiveCards } from "@/src/lib/review/philosophy-pilot-runtime";
import { westernArtObjectiveScopeSubjectIds } from "@/src/lib/review/western-art-objective-registry";
import { isWesternArtPilotIssuanceEnabled, issueWesternArtObjectiveCards } from "@/src/lib/review/western-art-pilot-runtime";
import { buildGraphScopeSnapshot, buildKuzushijiScopeSnapshot } from "@/src/lib/review/scope";
import type { ReviewCard, ReviewPersistenceMode, ReviewSessionContext } from "@/src/lib/review/types";
import { getReviewStates, isReviewPersistenceConfigured, type ReviewState } from "@/src/lib/supabase/review";
import { getKuzushijiPilotObjectiveState, getPilotRuntimeConfig } from "@/src/lib/supabase/pilot";
import { loadReviewGraphPracticeSource } from "./graph-practice-source";
import { kuzushijiVisualCandidates, graphLegacyCandidates } from "./candidates";

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
  const visualCandidates = kuzushijiVisualCandidates(project, data, scope);

  // Phase 4D-4: this pilot no longer consults legacy review_state for queue
  // authority. No Objective state means the approved no-seed cutover is unseen;
  // an existing Objective state is eligible only when its own due_at arrives.
  let persistence: ReviewPersistenceMode = "fallback";
  let objectiveState: Awaited<ReturnType<typeof getKuzushijiPilotObjectiveState>> = null;
  let objectiveScheduleReady = false;
  if (data.mode === "notion" && getPilotRuntimeConfig()) {
    try {
      objectiveState = await getKuzushijiPilotObjectiveState();
      objectiveScheduleReady = true;
      persistence = "supabase";
    } catch (error) {
      console.error("Study Graph: Kuzushiji Objective schedule unavailable", error);
    }
  }

  const dueAt = objectiveState ? new Date(objectiveState.due_at).getTime() : null;
  const objectiveDue = objectiveScheduleReady && (
    !objectiveState || (dueAt !== null && Number.isFinite(dueAt) && dueAt <= Date.now())
  );
  const selected: ReviewItem[] = objectiveDue ? visualCandidates.slice(0, 1) : [];

  const cards: ReviewCard[] = [];
  let pilotIssued = false;
  for (const item of selected) {
    const character = data.characters.find((candidate) => candidate.id === item.id);
    const card = character ? createKuzushijiPilotReviewCard(project, character, item) : null;
    if (!card || !character) continue;
    const selectedCharacter = character;

    if (isKuzushijiPilotDefinition(card.definitionId)) {
      // A failed or operationally disabled Objective issue never falls back to
      // the legacy writer. One Objective is issued at most once per session.
      if (pilotIssued) continue;
      pilotIssued = true;
      if (data.mode !== "notion" || scope.sourceState !== "ready" || !getPilotRuntimeConfig() || !isPilotIssuanceEnabled()) continue;
      try {
        const issued = await issueKuzushijiPilotReview({
          character: selectedCharacter,
          item,
          scope,
          legacyExerciseId: card.exerciseId,
        });
        const asset = issued.presentation.asset;
        cards.push({
          ...card,
          prompt: issued.presentation.prompt,
          front: issued.presentation.front,
          asset: {
            type: "image",
            src: asset.src,
            alt: asset.alt,
            width: asset.width,
            height: asset.height,
            presentation: "full",
            attribution: asset.source.attribution,
            sourceUrl: asset.source.url,
            license: asset.source.license,
          },
          sourceUrl: asset.source.url,
          instanceId: issued.instanceId,
        });
      } catch (error) {
        console.error("Study Graph: Kuzushiji pilot instance issue failed", error);
      }
      continue;
    }

    cards.push(card);
  }

  return {
    project,
    projects: getActiveStudyProjects(),
    cards,
    persistence,
    sourceMode: data.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: objectiveState ? "scheduled" : "practice",
      historyHref: "/projects/kuzushiji/progress",
      emptyReason: scope.sourceState === "ready" && objectiveScheduleReady ? "no-eligible-exercise" : "scope-unavailable",
    },
  };
}

export async function loadGraphPractice(
  project: StudyProjectDefinition,
  dependencies: {
    loadGraph?: typeof loadReviewGraphPracticeSource;
    issuePhilosophyCards?: typeof issuePhilosophyObjectiveCards;
    issueWesternArtCards?: typeof issueWesternArtObjectiveCards;
  } = {},
): Promise<ReviewProjectPayload> {
  const graph = await (dependencies.loadGraph ?? loadReviewGraphPracticeSource)(project.id as "philosophy" | "western-art-history");
  const scope = buildGraphScopeSnapshot(project.id as "philosophy" | "western-art-history", graph);
  const philosophyPilotOn = project.id === "philosophy" && isPhilosophyPilotIssuanceEnabled();
  const westernArtPilotOn = project.id === "western-art-history" && isWesternArtPilotIssuanceEnabled();
  // Selected Objective subjects never return to the legacy queue.
  const excludedIds = philosophyPilotOn ? philosophyObjectiveScopeSubjectIds
    : westernArtPilotOn ? westernArtObjectiveScopeSubjectIds : [];
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

  const now = Date.now();
  const legacyCards = graphLegacyCandidates({ project, graph, scope, excludedIds,
    states, persisted: persistence === "supabase" })
    .filter(({ state }) => !state || Date.parse(state.due_at) <= now)
    .map(({ card }) => card)
    .slice(0, project.review.sessionSize);
  let philosophyCards: ReviewCard[] = [];
  if (philosophyPilotOn && graph.mode === "notion" && scope.sourceState === "ready") {
    try {
      philosophyCards = await (dependencies.issuePhilosophyCards ?? issuePhilosophyObjectiveCards)(scope);
    } catch (error) {
      console.warn("Study Graph: Philosophy Objective issuance unavailable", {
        code: "philosophy_pilot_unavailable",
      });
    }
  }
  let westernArtCards: ReviewCard[] = [];
  if (westernArtPilotOn && graph.mode === "notion" && scope.sourceState === "ready") {
    try {
      westernArtCards = await (dependencies.issueWesternArtCards ?? issueWesternArtObjectiveCards)(scope);
    } catch (error) {
      if (!(error instanceof ObjectiveRuntimeError && error.code === "objective_not_due")) {
        console.warn("Study Graph: Western Art Objective issuance unavailable", {
          code: error instanceof ObjectiveRuntimeError ? error.code : "western_art_pilot_unavailable",
        });
      }
    }
  }
  const cards = (
    project.id === "philosophy"
      ? [...philosophyCards, ...legacyCards]
      : [...westernArtCards, ...legacyCards]
  ).slice(0, project.review.sessionSize);
  const objectiveCardCount =
    project.id === "philosophy" ? philosophyCards.length : westernArtCards.length;
  return {
    project,
    projects: getActiveStudyProjects(),
    cards: attachReviewAssets(cards, reviewAssetProvider),
    persistence: objectiveCardCount > 0 ? "supabase" : persistence,
    sourceMode: graph.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: objectiveCardCount > 0 ? "scheduled" : "practice",
      emptyReason: scope.sourceState === "ready" ? "no-eligible-exercise" : "scope-unavailable",
    },
  };
}

export async function loadReviewProject(projectId: string | undefined | null): Promise<ReviewProjectPayload> {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  const project = requested?.status === "active" ? requested : getStudyProject(defaultStudyProjectId)!;
  return project.review.strategy === "notion-queue" ? loadKuzushijiReview(project) : loadGraphPractice(project);
}
