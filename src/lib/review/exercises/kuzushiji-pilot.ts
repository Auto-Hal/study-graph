import type { ExerciseDefinition, VisualAsset } from "./types";

export const KUZUSHIJI_PILOT_EXERCISE_ID = "kuzushiji.visual-reading.eitaigura-u3042-00032-1";
export const KUZUSHIJI_PILOT_ASSET_ID = "kuzushiji.glyph.eitaigura-u3042-00032-1";

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
