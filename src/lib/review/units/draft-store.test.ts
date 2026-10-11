import assert from "node:assert/strict";
import { test } from "node:test";
import { clearUnitAnswerDraft, matchesUnitAnswerDraft, readUnitAnswerDraft, writeUnitAnswerDraft } from "./draft-store.ts";
import type { ReviewCard } from "../types.ts";

const scope = { unitId: "philosophy-change-2", runId: "run-first" };
const card = { instanceId: "instance-first", exerciseId: "exercise-first", persistenceKind: "versioned-pilot",
  answer: { type: "self-evaluation" } } as ReviewCard;
const input = { rawAnswer: "  流れる水は変わる。\n同じ川とも呼べる。　", revealed: false, responseMs: 4567 };
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("draft round trip preserves original whitespace, paraphrases and elapsed time without grading fields", () => {
  const storage = memoryStorage();
  writeUnitAnswerDraft(scope, card, input, storage);
  const draft = readUnitAnswerDraft(scope, card, storage)!;
  assert.equal(draft.rawAnswer, input.rawAnswer); assert.equal(draft.responseMs, 4567); assert.equal(draft.revealed, false);
  assert.equal("selfEvaluation" in draft, false); assert.equal("isCorrect" in draft, false); assert.equal("attemptId" in draft, false);
});

test("revealed but uncommitted answers can be restored without a new attempt", () => {
  const storage = memoryStorage(); writeUnitAnswerDraft(scope, card, { ...input, revealed: true }, storage);
  assert.equal(readUnitAnswerDraft(scope, card, storage)?.revealed, true);
});

test("drafts never mix units, runs, issued instances or exercise versions", () => {
  const storage = memoryStorage(); writeUnitAnswerDraft(scope, card, input, storage);
  assert.equal(readUnitAnswerDraft({ ...scope, unitId: "other" }, card, storage), null);
  assert.equal(readUnitAnswerDraft({ ...scope, runId: "run-second" }, card, storage), null);
  assert.equal(readUnitAnswerDraft(scope, { ...card, instanceId: "instance-second" }, storage), null);
  assert.throws(() => readUnitAnswerDraft(scope, { ...card, exerciseId: "different-version" }, storage), /unit_draft_invalid/);
});

test("clearing all input replaces the previous draft and clearing a committed card leaves other cards intact", () => {
  const storage = memoryStorage(), second = { ...card, instanceId: "second" };
  writeUnitAnswerDraft(scope, card, input, storage); writeUnitAnswerDraft(scope, second, input, storage);
  writeUnitAnswerDraft(scope, card, { ...input, rawAnswer: "" }, storage);
  assert.equal(readUnitAnswerDraft(scope, card, storage)?.rawAnswer, "");
  clearUnitAnswerDraft(scope, card, storage);
  assert.equal(readUnitAnswerDraft(scope, card, storage), null); assert.equal(readUnitAnswerDraft(scope, second, storage)?.rawAnswer, input.rawAnswer);
});

test("invalid draft contents are rejected and retained rather than silently overwritten", () => {
  const storage = memoryStorage(); writeUnitAnswerDraft(scope, card, input, storage);
  const [key, value] = [...storage.values.entries()][0];
  for (const corrupted of ["not-json", JSON.stringify({ ...JSON.parse(value), schemaVersion: 2 }),
    JSON.stringify({ ...JSON.parse(value), rawAnswer: "a".repeat(2001) }), JSON.stringify({ ...JSON.parse(value), responseMs: -1 }),
    JSON.stringify({ ...JSON.parse(value), responseMs: 0.5 }), JSON.stringify({ ...JSON.parse(value), rawAnswer: "　", revealed: true })]) {
    storage.setItem(key, corrupted); assert.throws(() => readUnitAnswerDraft(scope, card, storage));
    assert.equal(storage.getItem(key), corrupted);
  }
});

test("only valid single-choice option IDs are restored", () => {
  const choice = { ...card, answer: { type: "single-choice", options: [{ id: "first", label: "表示" }], correctOptionId: "first" } } as ReviewCard;
  const storage = memoryStorage(); writeUnitAnswerDraft(scope, choice, { ...input, rawAnswer: "first" }, storage);
  assert.equal(readUnitAnswerDraft(scope, choice, storage)?.rawAnswer, "first");
  assert.throws(() => writeUnitAnswerDraft(scope, choice, { ...input, rawAnswer: "表示" }, storage), /unit_draft_invalid/);
});

test("failed writes, reads and cleanup propagate; retry preserves the latest input", () => {
  const storage = memoryStorage(); writeUnitAnswerDraft(scope, card, input, storage);
  const broken = { ...storage, setItem: () => { throw new Error("QuotaExceededError"); },
    getItem: () => { throw new Error("SecurityError"); }, removeItem: () => { throw new Error("SecurityError"); } };
  assert.throws(() => writeUnitAnswerDraft(scope, card, { ...input, rawAnswer: "最新の文" }, broken), /QuotaExceededError/);
  assert.throws(() => readUnitAnswerDraft(scope, card, broken), /SecurityError/);
  assert.throws(() => clearUnitAnswerDraft(scope, card, broken), /SecurityError/);
  assert.equal(readUnitAnswerDraft(scope, card, storage)?.rawAnswer, input.rawAnswer);
  writeUnitAnswerDraft(scope, card, { ...input, rawAnswer: "最新の文" }, storage);
  assert.equal(readUnitAnswerDraft(scope, card, storage)?.rawAnswer, "最新の文");
});

test("storage cannot be used without a stable versioned instance identity", () => {
  const storage = memoryStorage();
  assert.throws(() => writeUnitAnswerDraft(scope, { ...card, instanceId: undefined }, input, storage));
  const valid = { schemaVersion: 1, ...scope, instanceId: card.instanceId, exerciseId: card.exerciseId, ...input };
  assert.equal(matchesUnitAnswerDraft(valid, scope, card), true);
  assert.equal(matchesUnitAnswerDraft({ ...valid, runId: "another" }, scope, card), false);
});
