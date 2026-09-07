import "server-only";

import type { GraphData, GraphNode } from "@/src/lib/graph/types";
import type { StudyProjectDefinition } from "@/src/lib/projects/registry";
import { reviewAssetProvider } from "@/src/lib/review/assets/manifest";
import type { ReviewCard } from "@/src/lib/review/types";
import type { ReviewState } from "@/src/lib/supabase/review";
import { evaluateReviewCardQuality } from "./quality";

const gradeLabels = { again: "もう一度", hard: "難しい", good: "できた", easy: "即答" } as const;

function hashValue(value: string) { let hash = 0; for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash; }
function kindLabel(project: StudyProjectDefinition, kind: string) { return project.graphNodeKinds.find((entry) => entry.id === kind)?.label ?? kind; }
function reasonFor(state?: ReviewState) { return state ? "復習期限到来 · 前回「" + gradeLabels[state.last_grade] + "」" : "初回Practice · まだ復習履歴なし"; }

function optionNodes(node: GraphNode, candidates: GraphNode[], correct: GraphNode) {
  const distractors = candidates
    .filter((candidate) => candidate.id !== correct.id)
    .filter((candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index)
    .sort((a, b) => hashValue(node.id + ":" + a.id) - hashValue(node.id + ":" + b.id))
    .slice(0, 3);
  return [correct, ...distractors].sort((a, b) => hashValue(node.id + ":" + a.id + ":option") - hashValue(node.id + ":" + b.id + ":option"));
}

function visualArtworkCard(
  project: StudyProjectDefinition,
  graph: GraphData,
  node: GraphNode,
  state: ReviewState | undefined,
  eligibleIds: ReadonlySet<string>,
): ReviewCard | null {
  if (project.id !== "western-art-history" || node.kind !== "artwork") return null;
  const exerciseId = node.id + ":visual-identify";
  const asset = reviewAssetProvider.resolve({ projectId: project.id, itemId: node.id, exerciseId });
  if (!asset) return null;
  const peers = graph.nodes.filter((candidate) =>
    candidate.kind === "artwork" && candidate.id !== node.id && eligibleIds.has(candidate.id),
  );
  if (peers.length < 3) return null;
  const selected = optionNodes(node, peers, node);
  return {
    id: node.id,
    exerciseId,
    projectId: project.id,
    kind: "knowledge",
    kindLabel: kindLabel(project, node.kind),
    eyebrow: "VISUAL",
    label: node.label,
    prompt: "画像を見て、作品・遺構名を選んでください。",
    front: "画像から識別",
    frontStyle: "title",
    reason: reasonFor(state),
    asset,
    answer: {
      type: "single-choice",
      options: selected.map((candidate) => ({ id: candidate.id, label: candidate.label })),
      correctOptionId: node.id,
    },
    answerRows: [
      { label: "正解", value: node.label },
      { label: "要点", value: node.reviewText ?? "" },
    ],
    sourceUrl: node.notionUrl,
  };
}

function descriptionCard(
  project: StudyProjectDefinition,
  graph: GraphData,
  node: GraphNode,
  state: ReviewState | undefined,
  eligibleIds: ReadonlySet<string>,
): ReviewCard | null {
  const reviewText = node.reviewText?.trim();
  if (!reviewText) return null;
  const peers = graph.nodes.filter((candidate) =>
    candidate.kind === node.kind &&
    candidate.id !== node.id &&
    Boolean(candidate.reviewText?.trim()) &&
    eligibleIds.has(candidate.id),
  );
  if (peers.length < 3) return null;
  const selected = optionNodes(node, peers, node);
  return {
    id: node.id,
    exerciseId: node.id + ":description-match",
    projectId: project.id,
    kind: "knowledge",
    kindLabel: kindLabel(project, node.kind),
    eyebrow: project.id === "western-art-history" ? "UNDERSTAND" : "CONCEPT",
    label: node.label,
    prompt: "「" + node.label + "」を最も適切に説明しているものを選んでください。",
    front: node.label,
    frontStyle: "title",
    reason: reasonFor(state),
    answer: {
      type: "single-choice",
      options: selected.map((candidate) => ({ id: candidate.id, label: candidate.reviewText?.trim() ?? "" })),
      correctOptionId: node.id,
    },
    answerRows: [
      { label: "要点", value: reviewText },
      { label: "学習対象", value: node.label },
    ],
    sourceUrl: node.notionUrl,
  };
}

function identifyCard(
  project: StudyProjectDefinition,
  graph: GraphData,
  node: GraphNode,
  state: ReviewState | undefined,
  eligibleIds: ReadonlySet<string>,
): ReviewCard | null {
  const reviewText = node.reviewText?.trim();
  if (!reviewText) return null;
  const peers = graph.nodes.filter((candidate) =>
    candidate.kind === node.kind &&
    candidate.id !== node.id &&
    Boolean(candidate.reviewText?.trim()) &&
    eligibleIds.has(candidate.id),
  );
  if (peers.length < 3) return null;
  const selected = optionNodes(node, peers, node);
  return {
    id: node.id,
    exerciseId: node.id + ":identify-from-context",
    projectId: project.id,
    kind: "knowledge",
    kindLabel: kindLabel(project, node.kind),
    eyebrow: "IDENTIFY",
    label: node.label,
    prompt: project.id === "western-art-history"
      ? "次の特徴に最もよく当てはまる作品・人物・様式・用語を選んでください。"
      : "次の説明に最もよく当てはまる哲学者・概念・問題・著作を選んでください。",
    front: reviewText,
    frontStyle: "title",
    reason: reasonFor(state),
    answer: {
      type: "single-choice",
      options: selected.map((candidate) => ({ id: candidate.id, label: candidate.label })),
      correctOptionId: node.id,
    },
    answerRows: [
      { label: "正解", value: node.label },
      { label: "要点", value: reviewText },
    ],
    sourceUrl: node.notionUrl,
  };
}

export function createDomainExercise(
  project: StudyProjectDefinition,
  graph: GraphData,
  node: GraphNode,
  state: ReviewState | undefined,
  eligibleIds: ReadonlySet<string>,
): ReviewCard | null {
  const visual = visualArtworkCard(project, graph, node, state, eligibleIds);
  if (visual && evaluateReviewCardQuality(visual, graph, eligibleIds).status === "pass") return visual;

  const cycle = state?.repetitions ?? 0;
  const builders = cycle % 2 === 0 ? [identifyCard, descriptionCard] : [descriptionCard, identifyCard];
  for (const build of builders) {
    const card = build(project, graph, node, state, eligibleIds);
    if (!card) continue;
    if (evaluateReviewCardQuality(card, graph, eligibleIds).status === "pass") return card;
  }
  return null;
}
