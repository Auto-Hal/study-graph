import type { GraphData } from "@/src/lib/graph/types";
import type { ReviewCard } from "./types";

export type QualityReport = {
  status: "pass" | "reject";
  reasonCodes: string[];
};

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function reject(...reasonCodes: string[]): QualityReport {
  return { status: "reject", reasonCodes };
}

export function evaluateReviewCardQuality(
  card: ReviewCard,
  graph: Pick<GraphData, "nodes">,
  eligibleIds: ReadonlySet<string>,
): QualityReport {
  const node = graph.nodes.find((candidate) => candidate.id === card.id);
  if (!node || !eligibleIds.has(card.id)) return reject("scope-not-eligible");
  if (new Set(["lecture", "assignment", "review", "thought-note"]).has(node.kind)) {
    return reject("admin-node-answer");
  }
  if (!normalize(card.prompt) || !normalize(card.front)) return reject("empty-visible-field");

  if (card.eyebrow === "VISUAL" && !card.asset) return reject("visual-asset-missing");
  const visible = [card.prompt, card.front, card.asset?.alt ?? ""].map(normalize);

  if (card.answer.type === "text") {
    const accepted = card.answer.acceptedAnswers.map(normalize).filter(Boolean);
    if (accepted.length === 0) return reject("empty-answer");
    if (accepted.some((answer) => visible.some((field) => field === answer))) {
      return reject("answer-visible");
    }
    return { status: "pass", reasonCodes: [] };
  }

  const choice = card.answer;
  if (choice.options.length !== 4) return reject("distractor-insufficient");
  const optionIds = choice.options.map((option) => normalize(option.id));
  const optionLabels = choice.options.map((option) => normalize(option.label));
  if (new Set(optionIds).size !== optionIds.length) return reject("duplicate-option-id");
  if (new Set(optionLabels).size !== optionLabels.length || optionLabels.some((label) => !label)) {
    return reject("duplicate-option-label");
  }
  if (!optionIds.includes(normalize(choice.correctOptionId))) return reject("correct-option-missing");
  if (choice.options.filter((option) => option.id === choice.correctOptionId).length !== 1) {
    return reject("correct-option-not-unique");
  }
  if (choice.options.some((option) => !eligibleIds.has(option.id))) {
    return reject("out-of-scope-option");
  }
  const correctLabel = normalize(
    choice.options.find((option) => option.id === choice.correctOptionId)?.label ?? "",
  );
  if (visible.some((field) => field === correctLabel)) return reject("answer-visible");
  return { status: "pass", reasonCodes: [] };
}
