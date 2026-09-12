import type {
  Character,
  KuzushijiDashboard,
  Lecture,
  Mistake,
  ReviewItem,
} from "../../notion/kuzushiji.ts";
import {
  assertValidScopeKnowledgeSnapshot,
  type ScopeKnowledgeSnapshot,
} from "../offline/snapshot-content.ts";
import {
  decodeKuzushijiV2Projection,
} from "../../projects/project-projections.ts";

// Keep this browser-facing adapter free of the server hash implementation.
// The current endpoint and IndexedDB cache verify the historical hash before
// this strict projection decoder is called.
const KUZUSHIJI_V1_PROJECTION_VERSION = "kuzushiji-v1";
const KUZUSHIJI_V2_PROJECTION_VERSION = "kuzushiji-v2";

export type KuzushijiSnapshotDashboard = Omit<KuzushijiDashboard, "mode" | "sourceState"> & {
  mode: "snapshot";
  sourceState: "ready";
  snapshotId: string;
  generation: number;
  publishedAt: string;
  validUntil: string;
};

export type SnapshotDisplaySelection = Readonly<{
  snapshot: ScopeKnowledgeSnapshot;
  source: "server" | "cache";
}>;

/**
 * A server response is the display source unless a verified local snapshot is
 * strictly newer.  This keeps provenance independent from structured-clone
 * object identity in IndexedDB.
 */
export function selectSnapshotForDisplay(
  serverSnapshot: ScopeKnowledgeSnapshot,
  cachedSnapshot: ScopeKnowledgeSnapshot | null,
): SnapshotDisplaySelection {
  if (cachedSnapshot && cachedSnapshot.generation > serverSnapshot.generation) {
    return { snapshot: cachedSnapshot, source: "cache" };
  }
  return { snapshot: serverSnapshot, source: "server" };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is invalid`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value !== null && typeof value !== "string") throw new Error(`${field} is invalid`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is invalid`);
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${field} is invalid`);
  return value;
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} is invalid`);
  return value;
}

function readLecture(value: unknown, index: number): Lecture {
  if (!record(value)) throw new Error(`lectures[${index}] is invalid`);
  return {
    id: string(value.id, `lectures[${index}].id`),
    url: string(value.url, `lectures[${index}].url`),
    title: string(value.title, `lectures[${index}].title`),
    sequence: number(value.sequence, `lectures[${index}].sequence`),
    theme: string(value.theme, `lectures[${index}].theme`),
    status: string(value.status, `lectures[${index}].status`),
    completedAt: nullableString(value.completedAt, `lectures[${index}].completedAt`),
    reviewAccuracy: nullableNumber(value.reviewAccuracy, `lectures[${index}].reviewAccuracy`),
    newCharactersCount: nullableNumber(value.newCharactersCount, `lectures[${index}].newCharactersCount`),
  };
}

function readCharacter(value: unknown, index: number): Character {
  if (!record(value)) throw new Error(`characters[${index}] is invalid`);
  return {
    id: string(value.id, `characters[${index}].id`),
    url: string(value.url, `characters[${index}].url`),
    glyph: string(value.glyph, `characters[${index}].glyph`),
    reading: string(value.reading, `characters[${index}].reading`),
    mother: string(value.mother, `characters[${index}].mother`),
    category: string(value.category, `characters[${index}].category`),
    mastery: string(value.mastery, `characters[${index}].mastery`),
    importance: string(value.importance, `characters[${index}].importance`),
    errorCount: number(value.errorCount, `characters[${index}].errorCount`),
    lastReviewedAt: nullableString(value.lastReviewedAt, `characters[${index}].lastReviewedAt`),
  };
}

function readMistake(value: unknown, index: number): Mistake {
  if (!record(value)) throw new Error(`mistakes[${index}] is invalid`);
  if (typeof value.retry !== "boolean") throw new Error(`mistakes[${index}].retry is invalid`);
  if (typeof value.resolved !== "boolean") throw new Error(`mistakes[${index}].resolved is invalid`);
  return {
    id: string(value.id, `mistakes[${index}].id`),
    url: string(value.url, `mistakes[${index}].url`),
    title: string(value.title, `mistakes[${index}].title`),
    answer: string(value.answer, `mistakes[${index}].answer`),
    correctAnswer: string(value.correctAnswer, `mistakes[${index}].correctAnswer`),
    cause: string(value.cause, `mistakes[${index}].cause`),
    retry: value.retry,
    resolved: value.resolved,
    errorDate: nullableString(value.errorDate, `mistakes[${index}].errorDate`),
  };
}

function readReviewItem(value: unknown, index: number): ReviewItem {
  if (!record(value)) throw new Error(`reviewQueue[${index}] is invalid`);
  if (value.kind !== "character" && value.kind !== "mistake") throw new Error(`reviewQueue[${index}].kind is invalid`);
  return {
    id: string(value.id, `reviewQueue[${index}].id`),
    kind: value.kind,
    label: string(value.label, `reviewQueue[${index}].label`),
    reason: string(value.reason, `reviewQueue[${index}].reason`),
  };
}

/** Convert the immutable projection to the screen view model without Notion fallback. */
export function dashboardFromScopeKnowledgeSnapshot(snapshot: ScopeKnowledgeSnapshot): KuzushijiSnapshotDashboard {
  assertValidScopeKnowledgeSnapshot(snapshot);
  if (snapshot.projectId !== "kuzushiji" || !record(snapshot.knowledgeProjection)) {
    throw new Error("Kuzushiji snapshot projection is invalid");
  }
  if (snapshot.knowledgeProjectionVersion === KUZUSHIJI_V2_PROJECTION_VERSION) {
    // v2 is a strict, hash-covered projection. The browser hash check happens
    // at the fetch/cache boundary; this parser validates the exact projection
    // shape without pulling the server-only hash implementation into a client
    // bundle. Sources, expressions, and relations remain in the snapshot.
    const projection = decodeKuzushijiV2Projection(snapshot.knowledgeProjection);
    return {
      mode: "snapshot",
      sourceState: "ready",
      snapshotId: snapshot.snapshotId,
      generation: snapshot.generation,
      publishedAt: snapshot.publishedAt,
      validUntil: snapshot.validUntil,
      lectures: [...projection.lectures],
      characters: [...projection.characters],
      mistakes: [...projection.mistakes],
      reviewQueue: [...projection.reviewQueue],
    };
  }
  if (snapshot.knowledgeProjectionVersion !== KUZUSHIJI_V1_PROJECTION_VERSION || !record(snapshot.knowledgeProjection)) {
    throw new Error("Kuzushiji snapshot projection is invalid");
  }
  const projection = snapshot.knowledgeProjection;
  return {
    mode: "snapshot",
    sourceState: "ready",
    snapshotId: snapshot.snapshotId,
    generation: snapshot.generation,
    publishedAt: snapshot.publishedAt,
    validUntil: snapshot.validUntil,
    lectures: readArray(projection.lectures, "lectures").map(readLecture),
    characters: readArray(projection.characters, "characters").map(readCharacter),
    mistakes: readArray(projection.mistakes, "mistakes").map(readMistake),
    reviewQueue: readArray(projection.reviewQueue, "reviewQueue").map(readReviewItem),
  };
}
