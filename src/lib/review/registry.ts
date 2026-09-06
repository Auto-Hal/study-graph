import "server-only";

import { loadProjectGraph } from "@/src/lib/graph/registry";
import type { GraphData, GraphNode } from "@/src/lib/graph/types";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import {
  defaultStudyProjectId,
  getActiveStudyProjects,
  getStudyProject,
  type StudyProjectDefinition,
} from "@/src/lib/projects/registry";
import {
  getDueReviewItems,
  getReviewStates,
  isReviewPersistenceConfigured,
  type ReviewState,
} from "@/src/lib/supabase/review";
import type {
  ReviewCard,
  ReviewPersistenceMode,
  ReviewSessionContext,
} from "@/src/lib/review/types";

export type ReviewProjectPayload = {
  project: StudyProjectDefinition;
  projects: StudyProjectDefinition[];
  cards: ReviewCard[];
  persistence: ReviewPersistenceMode;
  sourceMode: "notion" | "demo";
  session: ReviewSessionContext;
};

const gradeLabels = {
  again: "もう一度",
  hard: "難しい",
  good: "できた",
  easy: "即答",
} as const;

function displayGlyph(value: string) {
  return value.replace(/（.*?）/g, "").trim() || value || "?";
}

function graphKindLabel(project: StudyProjectDefinition, kind: string) {
  return project.graphNodeKinds.find((entry) => entry.id === kind)?.label ?? kind;
}

function graphPrompt(projectId: string, kind: string) {
  if (projectId === "western-art-history") {
    switch (kind) {
      case "artwork":
        return "この作品の時代・様式・関連事項を思い出してください。";
      case "movement":
        return "この様式・運動の特徴と、時代・作品との関係を思い出してください。";
      case "period":
        return "この時代の特徴と、関連する作品・様式を思い出してください。";
      default:
        return "この用語の意味と、作品・様式・時代との関係を思い出してください。";
    }
  }

  switch (kind) {
    case "philosopher":
      return "この哲学者の主要概念・著作・哲学的問題との関係を思い出してください。";
    case "work":
      return "この著作と、哲学者・概念・問題との関係を思い出してください。";
    case "problem":
      return "この哲学的問題に関わる哲学者・用語・著作を思い出してください。";
    default:
      return "この用語の意味と、哲学者・問題・著作との関係を思い出してください。";
  }
}

function connectedKnowledge(graph: GraphData, node: GraphNode) {
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const relations: string[] = [];
  const labels: string[] = [];

  for (const edge of graph.edges) {
    if (edge.source !== node.id && edge.target !== node.id) continue;
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = nodesById.get(otherId);
    if (other && !labels.includes(other.label)) labels.push(other.label);
    if (!relations.includes(edge.label)) relations.push(edge.label);
  }

  return {
    labels: labels.slice(0, 6),
    relations: relations.slice(0, 5),
  };
}

function graphCard(
  project: StudyProjectDefinition,
  graph: GraphData,
  node: GraphNode,
  state: ReviewState | undefined,
): ReviewCard {
  const connected = connectedKnowledge(graph, node);
  const reason = state
    ? `復習期限到来 · 前回「${gradeLabels[state.last_grade]}」`
    : "初回Practice · まだ復習履歴なし";

  return {
    id: node.id,
    projectId: project.id,
    kind: "knowledge",
    kindLabel: graphKindLabel(project, node.kind),
    eyebrow: node.kind.replace(/-/g, " ").toUpperCase(),
    label: node.label,
    prompt: graphPrompt(project.id, node.kind),
    front: node.label,
    frontStyle: "title",
    reason,
    answerRows: [
      { label: "概要", value: node.meta || "Notionに概要未登録" },
      {
        label: "関連知識",
        value: connected.labels.length > 0 ? connected.labels.join(" / ") : "Relation未登録",
      },
      {
        label: "Relation",
        value: connected.relations.length > 0 ? connected.relations.join(" / ") : "Relation未登録",
      },
    ],
    sourceUrl: node.notionUrl,
  };
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
        projectId: project.id,
        kind: "character",
        kindLabel: "文字",
        eyebrow: "CHARACTER",
        label: character.glyph,
        prompt: "この文字の読みと字母を思い出してください。",
        front: displayGlyph(character.glyph),
        frontStyle: "glyph",
        reason: item.reason,
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
      projectId: project.id,
      kind: "mistake",
      kindLabel: "誤読",
      eyebrow: "MISTAKE",
      label: mistake.title,
      prompt: "この誤読の問題点と、正しい判断を思い出してください。",
      front: mistake.title || "誤読記録",
      frontStyle: "title",
      reason: item.reason,
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
    cards,
    persistence: scheduled.persistence,
    sourceMode: data.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: "scheduled",
      historyHref: "/projects/kuzushiji/progress",
    },
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
    .filter(
      (entry): entry is { node: GraphNode; state: ReviewState } =>
        Boolean(entry.state) && new Date(entry.state!.due_at).getTime() <= now,
    )
    .sort((a, b) => new Date(a.state.due_at).getTime() - new Date(b.state.due_at).getTime());
  const unseen = eligibleNodes.filter((node) => !statesById.has(node.id));

  const selected = persistence === "supabase"
    ? [
        ...dueTracked.map((entry) => ({ node: entry.node, state: entry.state })),
        ...unseen.map((node) => ({ node, state: undefined })),
      ].slice(0, project.review.sessionSize)
    : eligibleNodes.slice(0, project.review.sessionSize).map((node) => ({ node, state: undefined }));

  return {
    project,
    projects: getActiveStudyProjects(),
    cards: selected.map(({ node, state }) => graphCard(project, graph, node, state)),
    persistence,
    sourceMode: graph.mode,
    session: {
      projectId: project.id,
      projectTitle: project.title,
      projectHref: project.href,
      mode: "practice",
    },
  };
}

export async function loadReviewProject(projectId: string | undefined | null): Promise<ReviewProjectPayload> {
  const requested = getStudyProject(projectId ?? defaultStudyProjectId);
  const project = requested?.status === "active"
    ? requested
    : getStudyProject(defaultStudyProjectId)!;

  if (project.review.strategy === "notion-queue") {
    return loadKuzushijiReview(project);
  }

  return loadGraphPractice(project);
}
