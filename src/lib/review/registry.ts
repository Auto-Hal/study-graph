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

function acceptedValues(value: string) {
  const candidates = value
    .split(/[、,，/／・\n]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set([value.trim(), ...candidates].filter(Boolean)));
}

function graphKindLabel(project: StudyProjectDefinition, kind: string) {
  return project.graphNodeKinds.find((entry) => entry.id === kind)?.label ?? kind;
}

function hashValue(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function connectedKnowledge(graph: GraphData, node: GraphNode) {
  const nodesById = new Map(graph.nodes.map((candidate) => [candidate.id, candidate]));
  const neighbors: Array<{ node: GraphNode; relation: string }> = [];
  const relations: string[] = [];
  const labels: string[] = [];

  for (const edge of graph.edges) {
    if (edge.source !== node.id && edge.target !== node.id) continue;
    const otherId = edge.source === node.id ? edge.target : edge.source;
    const other = nodesById.get(otherId);
    if (other && !labels.includes(other.label)) labels.push(other.label);
    if (other && !neighbors.some((entry) => entry.node.id === other.id)) {
      neighbors.push({ node: other, relation: edge.label });
    }
    if (!relations.includes(edge.label)) relations.push(edge.label);
  }

  return {
    labels: labels.slice(0, 6),
    relations: relations.slice(0, 5),
    neighbors,
  };
}

function choiceOptions(graph: GraphData, node: GraphNode, correct: GraphNode) {
  const connectedIds = new Set([node.id, correct.id]);
  for (const edge of graph.edges) {
    if (edge.source === node.id) connectedIds.add(edge.target);
    if (edge.target === node.id) connectedIds.add(edge.source);
  }

  const distractors = graph.nodes
    .filter((candidate) => candidate.id !== correct.id && !connectedIds.has(candidate.id))
    .sort((a, b) => hashValue(`${node.id}:${a.id}`) - hashValue(`${node.id}:${b.id}`))
    .slice(0, 3);

  const options = [correct, ...distractors]
    .map((candidate) => ({ id: candidate.id, label: candidate.label }))
    .sort((a, b) => hashValue(`${node.id}:${a.id}:option`) - hashValue(`${node.id}:${b.id}:option`));

  return options;
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
  const cycle = state?.repetitions ?? 0;
  const neighbor = connected.neighbors.length > 0
    ? connected.neighbors[cycle % connected.neighbors.length]
    : undefined;

  if (neighbor && graph.nodes.length >= 4) {
    return {
      id: node.id,
      exerciseId: `${node.id}:relation:${neighbor.node.id}`,
      projectId: project.id,
      kind: "knowledge",
      kindLabel: graphKindLabel(project, node.kind),
      eyebrow: "RELATION",
      label: node.label,
      prompt: `「${node.label}」とNotion上で直接Relationがある知識を選んでください。`,
      front: node.label,
      frontStyle: "title",
      reason,
      answer: {
        type: "single-choice",
        options: choiceOptions(graph, node, neighbor.node),
        correctOptionId: neighbor.node.id,
      },
      answerRows: [
        { label: "正解", value: neighbor.node.label },
        { label: "Relation", value: neighbor.relation || "関連" },
        { label: "概要", value: node.meta || "Notionに概要未登録" },
      ],
      sourceUrl: node.notionUrl,
    };
  }

  if (node.meta.trim()) {
    return {
      id: node.id,
      exerciseId: `${node.id}:summary-to-label`,
      projectId: project.id,
      kind: "knowledge",
      kindLabel: graphKindLabel(project, node.kind),
      eyebrow: "IDENTIFY",
      label: node.label,
      prompt: "この概要に対応する知識名を入力してください。",
      front: node.meta,
      frontStyle: "title",
      reason,
      answer: {
        type: "text",
        acceptedAnswers: [node.label],
        placeholder: "知識名を入力",
      },
      answerRows: [
        { label: "正解", value: node.label },
        {
          label: "関連知識",
          value: connected.labels.length > 0 ? connected.labels.join(" / ") : "Relation未登録",
        },
      ],
      sourceUrl: node.notionUrl,
    };
  }

  return {
    id: node.id,
    exerciseId: `${node.id}:label-confirmation`,
    projectId: project.id,
    kind: "knowledge",
    kindLabel: graphKindLabel(project, node.kind),
    eyebrow: node.kind.replace(/-/g, " ").toUpperCase(),
    label: node.label,
    prompt: "表示された知識名を入力して確認してください。",
    front: node.label,
    frontStyle: "title",
    reason,
    answer: { type: "text", acceptedAnswers: [node.label], placeholder: "知識名を入力" },
    answerRows: [
      { label: "概要", value: node.meta || "Notionに概要未登録" },
      {
        label: "関連知識",
        value: connected.labels.length > 0 ? connected.labels.join(" / ") : "Relation未登録",
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
        answer: {
          type: "text",
          acceptedAnswers: acceptedValues(character.reading),
          placeholder: "読みを入力",
        },
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
      answer: {
        type: "text",
        acceptedAnswers: acceptedValues(mistake.correctAnswer),
        placeholder: "正しい読み・判断を入力",
      },
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
