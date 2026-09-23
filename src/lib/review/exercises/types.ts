export type ExerciseOrigin = "curated" | "deterministic-generated" | "template-generated";

export type ExerciseStatus = "draft" | "approved" | "retired" | "quarantined";

export type KnowledgeBinding = {
  source: "notion";
  externalId: string;
  role: "scope-subject" | "related";
};

export type LicensedExerciseSource = {
  title: string;
  image?: string;
  url: string;
  attribution: string;
  license: string;
};

export type TextReferenceSource = {
  kind: "text-reference";
  title: string;
  url: string;
  attribution: string;
};

export type ExerciseSource = LicensedExerciseSource | TextReferenceSource;

export type VisualAssetSource = LicensedExerciseSource & {
  originalFile?: string;
};

export type VisualAsset = {
  assetId: string;
  assetVersion: number;
  mediaType: "image/png" | "image/jpeg";
  src: string;
  width: number;
  height: number;
  alt: string;
  checksum: string | null;
  source: VisualAssetSource;
};

export type ExerciseStimulus = {
  assetId: string;
  assetVersion: number;
  role: "primary" | "secondary";
};

export type TextExerciseAnswerSpec = {
  type: "text";
  acceptedAnswers: string[];
  placeholder?: string;
};

export type ExerciseAnswerSpec = TextExerciseAnswerSpec;

export type ExerciseGradingSpec = {
  strategyId: "legacy-text-v1";
  strategyVersion: 1;
  normalization: "review-session-ja-v1";
};

export type ExerciseExplanation = {
  summary: string;
};

export type ExerciseProvenance = {
  status: "legacy-approved" | "curated";
  approvedFrom: "PR #27" | "manual-curation";
  note?: string;
};

export type ExerciseDefinition = {
  schemaVersion: 1;
  exerciseId: string;
  exerciseVersion: number;
  projectId: string;
  domain: string;
  objectiveId: string;
  skill: string;
  category: string;
  prompt: string;
  front: string;
  stimuli: ExerciseStimulus[];
  answerSpec: ExerciseAnswerSpec;
  gradingSpec: ExerciseGradingSpec;
  explanation: ExerciseExplanation;
  sources: ExerciseSource[];
  provenance: ExerciseProvenance;
  origin: "curated";
  status: ExerciseStatus;
  relatedKnowledgeBindings: KnowledgeBinding[];
};
