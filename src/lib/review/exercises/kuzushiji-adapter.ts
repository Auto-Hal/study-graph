import type { Character, ReviewItem } from "../../notion/kuzushiji";
import type { StudyProjectDefinition } from "../../projects/registry";
import type { ReviewAsset, ReviewCard } from "../types";
import { assertValidExerciseDefinition } from "./validation.ts";
import { kuzushijiPilotAsset, kuzushijiPilotAssets, kuzushijiPilotExercise } from "./kuzushiji-pilot.ts";

export const KUZUSHIJI_PILOT_LEGACY_EXERCISE_ID_SUFFIX =
  "visual-reading:eitaigura-u3042-00032-1:v1";

export function legacyKuzushijiExerciseId(characterId: string) {
  return characterId + ":" + KUZUSHIJI_PILOT_LEGACY_EXERCISE_ID_SUFFIX;
}

export function acceptedKuzushijiValues(value: string) {
  const candidates = value.split(/[、,，/／・\n]/g).map((entry) => entry.trim()).filter(Boolean);
  return Array.from(new Set([value.trim(), ...candidates].filter(Boolean)));
}

function toReviewAsset(): ReviewAsset {
  return {
    type: "image",
    src: kuzushijiPilotAsset.src,
    alt: kuzushijiPilotAsset.alt,
    width: kuzushijiPilotAsset.width,
    height: kuzushijiPilotAsset.height,
    presentation: "full",
  };
}

export function createKuzushijiPilotReviewCard(
  project: Pick<StudyProjectDefinition, "id">,
  character: Character,
  item: ReviewItem,
): ReviewCard | null {
  const readings = acceptedKuzushijiValues(character.reading);
  if (!readings.includes(kuzushijiPilotExercise.answerSpec.acceptedAnswers[0])) return null;

  assertValidExerciseDefinition(kuzushijiPilotExercise, kuzushijiPilotAssets);

  return {
    id: character.id,
    // This is the legacy ReviewCard/Supabase identifier. The stable definition
    // identity is kuzushijiPilotExercise.exerciseId and is intentionally separate.
    exerciseId: legacyKuzushijiExerciseId(character.id),
    projectId: project.id,
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "VISUAL",
    label: "くずし字1字",
    prompt: kuzushijiPilotExercise.prompt,
    front: kuzushijiPilotExercise.front,
    frontStyle: "title",
    reason: item.reason,
    asset: toReviewAsset(),
    answer: {
      type: "text",
      acceptedAnswers: [...kuzushijiPilotExercise.answerSpec.acceptedAnswers],
      placeholder: kuzushijiPilotExercise.answerSpec.placeholder,
    },
    answerRows: [
      { label: "正解", value: kuzushijiPilotExercise.answerSpec.acceptedAnswers[0] },
      { label: "字母", value: "阿" },
      { label: "学習項目", value: character.glyph },
      { label: "資料", value: kuzushijiPilotAsset.source.title },
      { label: "原字形", value: kuzushijiPilotAsset.source.image ?? "" },
      { label: "出典", value: kuzushijiPilotAsset.source.attribution },
      { label: "ライセンス", value: kuzushijiPilotAsset.source.license },
      { label: "学習ポイント", value: kuzushijiPilotExercise.explanation.summary },
    ],
    sourceUrl: kuzushijiPilotAsset.source.url,
  };
}
