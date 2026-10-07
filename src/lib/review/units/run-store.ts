import type { ReviewCard, ReviewSessionContext } from "../types.ts";
import type { StudyUnit } from "./catalog.ts";

export type UnitRun = Readonly<{
  schemaVersion: 1;
  runId: string;
  unitId: string;
  version: 1;
  startedAt: string;
  cards: ReviewCard[];
  session: ReviewSessionContext;
}>;

const DB_NAME = "study-graph-unit-runs";
const STORE = "unit_runs";

function openRunStore(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error("unit_storage_unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE, { keyPath: "unitId" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("unit_storage_unavailable"));
    request.onblocked = () => reject(new Error("unit_storage_unavailable"));
  });
}

function validRun(value: unknown, unit: StudyUnit): value is UnitRun {
  if (!value || typeof value !== "object") return false;
  const run = value as UnitRun;
  return run.schemaVersion === 1 && run.unitId === unit.id && run.version === unit.version
    && typeof run.runId === "string" && typeof run.startedAt === "string"
    && run.session?.unitId === unit.id && run.session?.projectId === unit.projectId && run.session?.practiceOnly === true
    && Array.isArray(run.cards) && run.cards.length === unit.questionCount
    && new Set(run.cards.map((card) => card.instanceId)).size === run.cards.length
    && run.cards.every((card) => card.projectId === unit.projectId && card.persistenceKind === "versioned-pilot"
      && typeof card.instanceId === "string" && typeof card.exerciseId === "string" && Boolean(card.answer));
}

export async function readUnitRun(unit: StudyUnit): Promise<UnitRun | null> {
  const database = await openRunStore();
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = database.transaction(STORE, "readonly").objectStore(STORE).get(unit.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("unit_storage_unavailable"));
    });
    if (value === undefined) return null;
    if (!validRun(value, unit)) throw new Error("unit_run_invalid");
    return value;
  } finally { database.close(); }
}

export async function writeUnitRun(run: UnitRun, unit: StudyUnit): Promise<void> {
  if (!validRun(run, unit)) throw new Error("unit_run_invalid");
  const database = await openRunStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("unit_storage_unavailable"));
      transaction.onabort = () => reject(new Error("unit_storage_unavailable"));
      transaction.objectStore(STORE).put(run);
    });
  } finally { database.close(); }
}
