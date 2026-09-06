export type ReviewItemKind = "character" | "mistake" | "knowledge";

export type ReviewCard = {
  id: string;
  projectId: string;
  kind: ReviewItemKind;
  kindLabel: string;
  eyebrow: string;
  label: string;
  prompt: string;
  front: string;
  frontStyle: "glyph" | "title";
  reason: string;
  answerRows: Array<{ label: string; value: string }>;
  sourceUrl: string;
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
