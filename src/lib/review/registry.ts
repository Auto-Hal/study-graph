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

// Preview quality gate: render one glyph as its own image and serve it through
// Study Graph, so mobile Safari never has to request the CODH image directly.
const kuzushijiVisualAssets: Record<string, ReviewAsset> = {
  "あ": {
    type: "image",
    src: "/api/kuzushiji-glyph",
    alt: "『日本永代蔵』に現れる「あ」のくずし字1字形",
    width: 77,
    height: 97,
    presentation: "full",
  },
};

const KUZUSHIJI_SOURCE = "『日本永代蔵』／『日本古典籍くずし字データセット』（国文研所蔵／CODH加工）";
const KUZUSHIJI_SOURCE_URL = "https://codh.rois.ac.jp/char-shape/book/200015843/";

function acceptedValues(value: string) {
  const candidates = value.split(/[、,，/／・\n]/g).map((entry) => entry.trim()).filter(Boolean);
  return Array.from(new Set([value.trim(), ...candidates].filter(Boolean)));
}

function visualAssetForCharacter(character: Character) {
  const readings = acceptedValues(character.reading);
  return readings.map((reading) => kuzushijiVisualAssets[reading]).find(Boolean);
}

function visualCharacterCard(project: StudyProjectDefinition, character: Character, item: ReviewItem): ReviewCard | null {
  const asset = visualAssetForCharacter(character);
  if (!asset) return null;

  return {
    id: character.id,
    exerciseId: `${character.id}:visual-reading-v4`,
    projectId: project.id,
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "VISUAL",
    label: character.glyph,
    prompt: "この江戸期資料から切り出されたくずし字1字を、ひらがなで読んでください。",
    front: "1字形から読む",
    frontStyle: "title",
    reason: item.reason,
    asset,
    answer: { type: "text", acceptedAnswers: acceptedValues(character.reading), placeholder: "読みを入力" },
    answerRows: [
      { label: "正解", value: character.reading },
      { label: "字母", value: character.mother },
      { label: "登録名", value: character.glyph },
      { label: "資料", value: "日本永代蔵" },
      { label: "出典", value: KUZUSHIJI_SOURCE },
      { label: "ライセンス", value: "CC BY-SA 4.0" },
      { label: "学習ポイント", value: "一覧画像や現代仮名ではなく、江戸期の実資料に現れる一字形から読みを判断する" },
    ],
    sourceUrl: KUZUSHIJI_SOURCE_URL,
  };
}

async function loadKuzushijiReview(project: StudyProjectDefinition): Promise<ReviewProjectPayload> {
  const data = await getKuzushijiDashboard();
  const visualCandidates = data.reviewQueue.filter((item) => {
    if (item.kind !== "character") return false;
    const character = data.characters.find((candidate) => candidate.id === item.id);
    return Boolean(character && visualAssetForCharacter(character));
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
