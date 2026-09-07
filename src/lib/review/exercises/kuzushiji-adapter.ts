import type { Character, ReviewItem } from "../../notion/kuzushiji";
import type { StudyProjectDefinition } from "../../projects/registry";
import type { ReviewAsset, ReviewCard } from "../types";
import { assertValidExerciseDefinition } from "./validation.ts";
import { kuzushijiPilotAssets, kuzushijiPilotRecord } from "./kuzushiji-pilot.ts";

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
    src: kuzushijiPilotRecord.asset.src,
    alt: kuzushijiPilotRecord.asset.alt,
    width: kuzushijiPilotRecord.asset.width,
    height: kuzushijiPilotRecord.asset.height,
    presentation: "full",
  };
}

export function createKuzushijiPilotReviewCard(
  project: Pick<StudyProjectDefinition, "id">,
  character: Character,
  item: ReviewItem,
): ReviewCard | null {
  const readings = acceptedKuzushijiValues(character.reading);
  if (!readings.includes(kuzushijiPilotRecord.exercise.answerSpec.acceptedAnswers[0])) return null;

  assertValidExerciseDefinition(kuzushijiPilotRecord.exercise, kuzushijiPilotAssets);

  return {
    id: character.id,
    // This is the legacy ReviewCard/Supabase identifier; it is separate from
    // the stable definition identity.
    exerciseId: legacyKuzushijiExerciseId(character.id),
    projectId: project.id,
    kind: "character",
    kindLabel: "実字形",
    eyebrow: "VISUAL",
    label: "くずし字1字",
    prompt: kuzushijiPilotRecord.exercise.prompt,
    front: kuzushijiPilotRecord.exercise.front,
    frontStyle: "title",
    reason: item.reason,
    asset: toReviewAsset(),
    answer: {
      type: "text",
      acceptedAnswers: [...kuzushijiPilotRecord.exercise.answerSpec.acceptedAnswers],
      placeholder: kuzushijiPilotRecord.exercise.answerSpec.placeholder,
    },
    answerRows: [
      { label: "正解", value: kuzushijiPilotRecord.exercise.answerSpec.acceptedAnswers[0] },
      { label: "字母", value: kuzushijiPilotRecord.metadata.motherCharacter.value },
      { label: "学習項目", value: character.glyph },
      { label: "資料", value: kuzushijiPilotRecord.asset.source.title },
      { label: "原字形", value: kuzushijiPilotRecord.asset.source.image ?? "" },
      { label: "出典", value: kuzushijiPilotRecord.asset.source.attribution },
      { label: "ライセンス", value: kuzushijiPilotRecord.asset.source.license },
      { label: "学習ポイント", value: kuzushijiPilotRecord.exercise.explanation.summary },
    ],
    sourceUrl: kuzushijiPilotRecord.asset.source.url,
  };
}
