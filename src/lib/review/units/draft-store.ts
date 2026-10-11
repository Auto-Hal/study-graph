import type { ReviewCard } from "../types.ts";

export type UnitDraftScope = Readonly<{ unitId: string; runId: string }>;
export type UnitAnswerDraft = Readonly<UnitDraftScope & {
  schemaVersion: 1;
  instanceId: string;
  exerciseId: string;
  rawAnswer: string;
  revealed: boolean;
  responseMs: number;
}>;

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const PREFIX = "study-graph-unit-draft-v1:";
const MAX_LENGTH = 2000;

function browserStorage(): DraftStorage {
  // The getter itself can throw when browser storage is disabled.
  if (!globalThis.localStorage) throw new Error("unit_draft_storage_unavailable");
  return globalThis.localStorage;
}

function key(scope: UnitDraftScope, card: ReviewCard): string {
  if (!scope.unitId || !scope.runId || !card.instanceId || !card.exerciseId
    || card.persistenceKind !== "versioned-pilot") throw new Error("unit_draft_identity_invalid");
  return PREFIX + JSON.stringify([scope.unitId, scope.runId, card.instanceId]);
}

export function matchesUnitAnswerDraft(value: unknown, scope: UnitDraftScope, card: ReviewCard): value is UnitAnswerDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as UnitAnswerDraft;
  return draft.schemaVersion === 1 && draft.unitId === scope.unitId && draft.runId === scope.runId
    && draft.instanceId === card.instanceId && draft.exerciseId === card.exerciseId
    && typeof draft.rawAnswer === "string" && draft.rawAnswer.length <= MAX_LENGTH
    && typeof draft.revealed === "boolean" && (!draft.revealed || Boolean(draft.rawAnswer.trim()))
    && Number.isSafeInteger(draft.responseMs) && draft.responseMs >= 0
    && (card.answer.type !== "single-choice" || draft.rawAnswer === ""
      || card.answer.options.some((option) => option.id === draft.rawAnswer));
}

export function readUnitAnswerDraft(scope: UnitDraftScope, card: ReviewCard, storage?: DraftStorage): UnitAnswerDraft | null {
  const value = (storage ?? browserStorage()).getItem(key(scope, card));
  if (value === null) return null;
  const draft: unknown = JSON.parse(value);
  // Never silently replace an unreadable draft with an empty input.
  if (!matchesUnitAnswerDraft(draft, scope, card)) throw new Error("unit_draft_invalid");
  return draft;
}

export function writeUnitAnswerDraft(scope: UnitDraftScope, card: ReviewCard,
  input: Pick<UnitAnswerDraft, "rawAnswer" | "revealed" | "responseMs">, storage?: DraftStorage): void {
  const draft: UnitAnswerDraft = { schemaVersion: 1, unitId: scope.unitId, runId: scope.runId,
    instanceId: card.instanceId ?? "", exerciseId: card.exerciseId, rawAnswer: input.rawAnswer,
    revealed: input.revealed, responseMs: input.responseMs };
  if (!matchesUnitAnswerDraft(draft, scope, card)) throw new Error("unit_draft_invalid");
  // Small synchronous writes in the input event preserve the last edit even
  // when navigation/reload follows immediately; no debounce/unload race.
  (storage ?? browserStorage()).setItem(key(scope, card), JSON.stringify(draft));
}

export function clearUnitAnswerDraft(scope: UnitDraftScope, card: ReviewCard, storage?: DraftStorage): void {
  (storage ?? browserStorage()).removeItem(key(scope, card));
}
