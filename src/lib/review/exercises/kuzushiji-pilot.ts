import type { ExerciseDefinition, VisualAsset } from "./types";

export const KUZUSHIJI_PILOT_EXERCISE_ID = "kuzushiji.visual-reading.eitaigura-u3042-00032-1";
export const KUZUSHIJI_PILOT_ASSET_ID = "kuzushiji.glyph.eitaigura-u3042-00032-1";
/**
 * Phase 4E-5 pins the bytes already tracked in Git.  The v1 asset keeps its
 * historical unknown checksum; this value is the measured SHA-256 of the
 * same repository file, used only by the new immutable v2 revision.
 */
export const KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM =
  "3cc8847155bddd0611da36ad4d972c3c7af7512bd62cfce72e460027ef84ad06" as const;

export type KuzushijiPilotMetadata = {
  motherCharacter: {
    value: string;
    status: "legacy-approved";
    approvedFrom: "PR #27";
  };
};

export const kuzushijiPilotAsset: VisualAsset = {
  assetId: KUZUSHIJI_PILOT_ASSET_ID,
  assetVersion: 1,
  mediaType: "image/png",
  src: "/assets/kuzushiji/a-eitaigura-hires.png",
  width: 222,
  height: 290,
  alt: "『日本永代蔵』から切り出したくずし字1字",
  // PR #27 did not record a byte checksum; keep the field explicit without inventing one.
  checksum: null,
  source: {
    title: "日本永代蔵",
    image: "U+3042_200015843_00032_1_X1086_Y1894.jpg（原字形 93×127px）",
    url: "https://codh.rois.ac.jp/char-shape/book/200015843/",
    attribution: "『日本古典籍くずし字データセット』（国文研所蔵／CODH加工） doi:10.20676/00000340",
    license: "CC BY-SA 4.0",
    originalFile: "U+3042_200015843_00032_1_X1086_Y1894.jpg",
  },
};

export const kuzushijiPilotExercise: ExerciseDefinition = {
  schemaVersion: 1,
  exerciseId: KUZUSHIJI_PILOT_EXERCISE_ID,
  exerciseVersion: 1,
  projectId: "kuzushiji",
  domain: "kuzushiji",
  objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
  skill: "reading",
  category: "visual-reading",
  prompt: "江戸期『日本永代蔵』の実資料から切り出したくずし字1字を、ひらがなで読んでください。",
  front: "1字形から読む",
  stimuli: [{ assetId: KUZUSHIJI_PILOT_ASSET_ID, assetVersion: 1, role: "primary" }],
  answerSpec: {
    type: "text",
    acceptedAnswers: ["あ"],
    placeholder: "読みを入力",
  },
  gradingSpec: {
    strategyId: "legacy-text-v1",
    strategyVersion: 1,
    normalization: "review-session-ja-v1",
  },
  explanation: {
    summary: "字母「阿」由来の「あ」。実資料の筆線・連綿・崩し方を一字形として認識する",
  },
  sources: [kuzushijiPilotAsset.source],
  provenance: {
    status: "legacy-approved",
    approvedFrom: "PR #27",
    note: "母字「阿」はPR #27で承認した既存値。外部資料による独立検証済みとは扱わない。",
  },
  origin: "curated",
  status: "approved",
  relatedKnowledgeBindings: [],
};

export const kuzushijiPilotMetadata: KuzushijiPilotMetadata = {
  motherCharacter: {
    value: "阿",
    status: "legacy-approved",
    approvedFrom: "PR #27",
  },
};

export const kuzushijiPilotRecord = {
  exercise: kuzushijiPilotExercise,
  asset: kuzushijiPilotAsset,
  metadata: kuzushijiPilotMetadata,
};

export const kuzushijiPilotAssets = new Map<string, VisualAsset>([
  [kuzushijiPilotAsset.assetId, kuzushijiPilotAsset],
]);

/**
 * Immutable v2 content boundary.  Only the asset checksum/version and the
 * revision version differ from v1; prompt, answer and objective semantics are
 * intentionally copied unchanged.
 */
export const kuzushijiPilotAssetV2: VisualAsset = {
  ...kuzushijiPilotAsset,
  assetVersion: 2,
  checksum: KUZUSHIJI_PILOT_ASSET_V2_CHECKSUM,
};

export const kuzushijiPilotExerciseV2: ExerciseDefinition = {
  ...kuzushijiPilotExercise,
  exerciseVersion: 2,
  stimuli: [{ ...kuzushijiPilotExercise.stimuli[0], assetVersion: 2 }],
};

export const kuzushijiPilotV2Record = {
  exercise: kuzushijiPilotExerciseV2,
  asset: kuzushijiPilotAssetV2,
  metadata: kuzushijiPilotMetadata,
};

export const kuzushijiPilotV2Assets = new Map<string, VisualAsset>([
  [kuzushijiPilotAssetV2.assetId, kuzushijiPilotAssetV2],
]);
