import "server-only";

import { loadProjectGraph } from "@/src/lib/graph/registry";
import type { GraphNode } from "@/src/lib/graph/types";
import { getKuzushijiDashboard, type Character, type ReviewItem } from "@/src/lib/notion/kuzushiji";
import { defaultStudyProjectId, getActiveStudyProjects, getStudyProject, type StudyProjectDefinition } from "@/src/lib/projects/registry";
import { reviewAssetProvider } from "@/src/lib/review/assets/manifest";
import { attachReviewAssets } from "@/src/lib/review/assets/provider";
import { createDomainExercise } from "@/src/lib/review/domain-exercises";
import type { ReviewAsset, ReviewCard, ReviewPersistenceMode, ReviewSessionContext } from "@/src/lib/review/types";
import { getDueReviewItems, getReviewStates, isReviewPersistenceConfigured, type ReviewState } from "@/src/lib/supabase/review";

export type ReviewProjectPayload = {
  project: StudyProjectDefinition;
  projects: StudyProjectDefinition[];
  cards: ReviewCard[];
  persistence: ReviewPersistenceMode;
  sourceMode: "notion" | "demo";
  session: ReviewSessionContext;
};

type KuzushijiVisualExercise = {
  asset: ReviewAsset;
  reading: string;
  mother: string;
  sourceTitle: string;
  sourceImage: string;
  sourceUrl: string;
  attribution: string;
  license: string;
  learningPoint: string;
};

// A visual exercise owns its image-specific reading, mother character and provenance.
// Notion remains the learned-scope authority, but generic Notion character metadata is
// not reused as if it described a particular historical glyph image.
const kuzushijiVisualExercises: Record<string, KuzushijiVisualExercise> = {
  "あ": {
    asset: {
      type: "image",
      src: "/assets/kuzushiji/a-eitaigura-hires.png",
      alt: "『日本永代蔵』から切り出したくずし字1字",
      width: 222,
      height: 290,
      presentation: "full",
    },
    reading: "あ",
    mother: "阿",
    sourceTitle: "日本永代蔵",
    sourceImage: "U+3042_200015843_00032_1_X1086_Y1894.jpg（原字形 93×127px）",
    sourceUrl: "https://codh.rois.ac.jp/char-shape/book/200015843/",
    attribution: "『日本古典籍くずし字データセット』（国文研所蔵／CODH加工） doi:10.20676/00000340",
    license: "CC BY-SA 4.0",
    learningPoint: "字母「阿」由来の「あ」。実資料の筆線・連綿・崩し方を一字形として認識する",
  },
};

function acceptedValues(value: string) {
  const candidates = value.split(/[、,，/／・\n]/g).map((entry) => entry.trim()).filter(Boolean);
  return Array.from(new Set([value.trim(), ...candidates].filter(Boolean)));
}

function visualExerciseForCharacter(character: Character) {
  const readings = acceptedValues(character.reading);
  return readings.map((reading) => kuzushijiVisualExercises[reading]).find(Boolean);
}

function visualCharacterCard(project: StudyProjectDefinition, character: Character, item: ReviewItem): ReviewCard | null {
  const exercise = visualExerciseForCharacter(character);
  if (!exercise) return null;

  return {
    id: character.id,
    exerciseId: `${character.id}:visual-reading:eitaigura-u3042-00032-1:v1`,
    projectId: project.id,
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "VISUAL",
    label: "くずし字1字",
    prompt: `江戸期『${exercise.sourceTitle}』の実資料から切り出したくずし字1字を、ひらがなで読んでください。`,
    front: "1字形から読む",
    frontStyle: "title",
    reason: item.reason,
    asset: exercise.asset,
    answer: { type: "text", acceptedAnswers: acceptedValues(exercise.reading), placeholder: "読みを入力" },
    answerRows: [
      { label: "正解", value: exercise.reading },
      { label: "字母", value: exercise.mother },
      { label: "学習項目", value: character.glyph },
      { label: "資料", value: exercise.sourceTitle },
      { label: "原字形", value: exercise.sourceImage },
      { label: "出典", value: exercise.attribution },
      { label: "ライセンス", value: exercise.license },
      { label: "学習ポイント", value: exercise.learningPoint },
    ],
    sourceUrl: exercise.sourceUrl,
  };
}

async function loadKuzushijiReview(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const data = await getKuzushijiDashboard();
  const visualCandidates = data.reviewQueue.filter((item) => {
    if (item.kind !== "character") return false;
    const character = data.characters.find((candidate) => candidate.id === item.id);
    return Boolean(character && visualExerciseForCharacter(character));
  });

  const scheduled = data.mode === "notion"
    ? await getDueReviewItems(visualCandidates)
    : { items: visualCandidates, persistence: "fallback" as const };

  const selected: ReviewItem[] = [...scheduled.items];
  const selectedIds = new Set(selected.map((item) => item.id));
  for (const item of visualCandidates) {
    if (selected.length >= project.review.sessionSize) break;
    if (selectedIds.has(item.id)) continue;
    selected.push(item);
    selectedIds.add(item.id);
  }

  const cards: ReviewCard[] = selected
    .slice(0, project.review.sessionSize)
    .map((item) => {
      const character = data.characters.find((candidate) => candidate.id === item.id);
      return character ? visualCharacterCard(project, character, item) : null;
    })
    .filter((card): card is ReviewCard => Boolean(card));

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
      mode: scheduled.items.length > 0 ? "scheduled" : "practice",
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
