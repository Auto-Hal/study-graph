import { KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID } from "../exercises/kuzushiji-pilot.ts";
import type { ScopeKnowledgeSnapshot } from "./snapshot-content.ts";

export type SnapshotPilotCharacter = {
  id: string;
  glyph: string;
  reading: string;
  mastery: string;
};

type SnapshotProjection = {
  characters?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCharacter(value: unknown): value is SnapshotPilotCharacter {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.glyph === "string"
    && typeof value.reading === "string"
    && typeof value.mastery === "string";
}

/**
 * Resolve the one verified curriculum subject that this pilot represents.
 * Reading matches are deliberately ignored: another eligible あ character is
 * not evidence for the Eitaigura anchor.
 */
export function selectPilotCharacterFromSnapshot(snapshot: ScopeKnowledgeSnapshot): SnapshotPilotCharacter {
  const projection = snapshot.knowledgeProjection as SnapshotProjection;
  const characters = Array.isArray(projection?.characters)
    ? projection.characters.filter(isCharacter)
    : [];
  const candidate = characters.find((character) => character.id === KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID);
  const decision = candidate
    ? snapshot.scopeDecisions.find((entry) => entry.subjectId === KUZUSHIJI_PILOT_SCOPE_SUBJECT_ID)
    : undefined;
  if (!candidate || decision?.status !== "eligible") {
    throw new Error("pilot_scope_not_eligible");
  }
  return candidate;
}
