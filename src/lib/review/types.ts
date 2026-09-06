export type ReviewItemKind = "character" | "mistake" | "knowledge";

export type TextAnswerSpec = {
  type: "text";
  acceptedAnswers: string[];
  placeholder?: string;
};

export type ChoiceAnswerSpec = {
  type: "single-choice";
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
};

export type ReviewAnswerSpec = TextAnswerSpec | ChoiceAnswerSpec;

export type ReviewAsset = {
  type: "image";
  src: string;
  alt: string;
  region?: { x: number; y: number; width: number; height: number };
};

export type ReviewCard = {
  id: string;
  exerciseId: string;
  projectId: string;
  kind: ReviewItemKind;
  kindLabel: string;
  eyebrow: string;
  label: string;
  prompt: string;
  front: string;
  frontStyle: "glyph" | "title";
  reason: string;
  answer: ReviewAnswerSpec;
  answerRows: Array<{ label: string; value: string }>;
  sourceUrl: string;
  asset?: ReviewAsset;
};

export type ReviewPersistenceMode = "supabase" | "fallback";

export type ReviewSessionMode = "scheduled" | "practice";

export type ReviewSessionContext = {
  projectId: string;
  projectTitle: string;
  projectHref: string;
  mode: ReviewSessionMode;
  historyHref?: string;
};
