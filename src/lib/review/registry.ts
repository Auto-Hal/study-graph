import "server-only";

import { loadProjectGraph } from "@/src/lib/graph/registry";
import type { GraphNode } from "@/src/lib/graph/types";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { defaultStudyProjectId, getActiveStudyProjects, getStudyProject, type StudyProjectDefinition } from "@/src/lib/projects/registry";
import { reviewAssetProvider } from "@/src/lib/review/assets/manifest";
import { attachReviewAssets } from "@/src/lib/review/assets/provider";
import { createDomainExercise } from "@/src/lib/review/domain-exercises";
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

function displayGlyph(value: string) {
  return value.replace(/（.*?）/g, "").trim() || value || "?";
}

function acceptedValues(value: string) {
  const candidates = value.split(/[、,，/／・\n]/g).map((entry) => entry.trim()).filter(Boolean);
  return Array.from(new Set([value.trim(), ...candidates].filter(Boolean)));
}

async function loadKuzushijiReview(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const data = await getKuzushijiDashboard();
  const scheduled = data.mode === "notion"
    ? await getDueReviewItems(data.reviewQueue)
    : { items: data.reviewQueue, persistence: "fallback" as const };
  const cards: ReviewCard[] = [];

  for (const item of scheduled.items.slice(0, project.review.sessionSize)) {
    if (item.kind === "character") {
      const character = data.characters.find((candidate) => candidate.id === item.id);
      if (!character) continue;
      cards.push({
        id: character.id,
        exerciseId: `${character.id}:reading`,
        projectId: project.id,
        kind: "character",
        kindLabel: "文字",
        eyebrow: "CHARACTER",
        label: character.glyph,
        prompt: "この文字の読みを入力してください。",
        front: displayGlyph(character.glyph),
        frontStyle: "glyph",
        reason: item.reason,
        answer: { type: "text", acceptedAnswers: acceptedValues(character.reading), placeholder: "読みを入力" },
        answerRows: [
          { label: "登録名", value: character.glyph },
          { label: "読み", value: character.reading },
          { label: "字母", value: character.mother },
          { label: "習得状態", value: character.mastery },
        ],
        sourceUrl: character.url,
      });
      continue;
    }

    const mistake = data.mistakes.find((candidate) => candidate.id === item.id);
    if (!mistake) continue;
    cards.push({
      id: mistake.id,
      exerciseId: `${mistake.id}:correct-answer`,
      projectId: project.id,
      kind: "mistake",
      kindLabel: "誤読",
      eyebrow: "MISTAKE",
      label: mistake.title,
      prompt: "この誤読に対する正しい読み・判断を入力してください。",
      front: mistake.title || "誤読記録",
      frontStyle: "title",
      reason: item.reason,
      answer: { type: "text", acceptedAnswers: acceptedValues(mistake.correctAnswer), placeholder: "正しい読み・判断を入力" },
      answerRows: [
        { label: "自分の回答", value: mistake.answer },
        { label: "正解", value: mistake.correctAnswer },
        { label: "原因", value: mistake.cause },
      ],
      sourceUrl: mistake.url,
    });
  }

  return {
    project,
    projects: getActiveStudyProjects(),
    cards: attachReviewAssets(cards, reviewAssetProvider),
    persistence: scheduled.persistence,
    sourceMode: data.mode,
    session: { projectId: project.id, projectTitle: project.title, projectHref: project.href, mode: "scheduled", historyHref: "/projects/kuzushiji/progress" },
  };
}

async function loadGraphPractice(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const graph = await loadProjectGraph(project.id);
  const eligibleKinds = new Set(project.review.eligibleKinds);
  const eligibleNodes = graph.nodes.filter((node) => eligibleKinds.has(node.kind));
  let persistence: ReviewPersistenceMode = "fallback";
  let states: ReviewState[] = [];

  if (graph.mode === "notion" && isReviewPersistenceConfigured()) {
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
    ? [...dueTracked.map((entry) => ({ node: entry.node, state: entry.state })), ...unseen.map((node) => ({ node, state: undefined }))].slice(0, project.review.sessionSize)
    : eligibleNodes.slice(0, project.review.sessionSize).map((node) => ({ node, state: undefined }));

  const cards = selected.map(({ node, state }) => createDomainExercise(project, graph, node, state));
  return {
    project,
    projects: getActiveStudyProjects(),
    cards: attachReviewAssets(cards, reviewAssetProvider),
    persistence,
    sourceMode: graph.mode,
    session: { projectId: project.id, projectTitle: project.title, projectHref: project.href, mode: "practice" },
  };
}

export async function loadReviewProject(projectId: string | undefined | null): Promise<ReviewProjectPayload> {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  const project = requested?.status === "active" ? requested : getStudyProject(defaultStudyProjectId)!;
  return project.review.strategy === "notion-queue" ? loadKuzushijiReview(project) : loadGraphPractice(project);
}
