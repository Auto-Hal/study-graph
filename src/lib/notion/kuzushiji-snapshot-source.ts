import { nextCursorOrThrow } from "./pagination.ts";
import type { Character, Lecture, Mistake, ReviewItem } from "./kuzushiji.ts";

/**
 * This reader is deliberately separate from getKuzushijiDashboard().  The
 * dashboard reader is allowed to show demo data for a screen; a snapshot is
 * an authority-bearing server observation and must fail closed instead.
 */
export const KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS = Object.freeze({
  lectures: "1da45577-aa7d-44e1-a304-9e33e5feb9e2",
  characters: "4a9814ba-7c44-47ec-8c46-e5d558a62085",
  mistakes: "12c37554-c7fa-424f-9590-f2f756bf284a",
});

export const KUZUSHIJI_SNAPSHOT_SOURCE_IDENTIFIERS = Object.freeze([
  `notion:data-source:${KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures}`,
  `notion:data-source:${KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters}`,
  `notion:data-source:${KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.mistakes}`,
] as const);

export const KUZUSHIJI_NOTION_API_VERSION = "2026-03-11" as const;

type NotionProperty = {
  type?: unknown;
  title?: unknown;
  rich_text?: unknown;
  number?: unknown;
  select?: unknown;
  date?: unknown;
  checkbox?: unknown;
};

type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

type NotionQueryResponse = {
  results: unknown[];
  has_more: boolean;
  next_cursor: string | null;
};

export type KuzushijiSnapshotSource = Readonly<{
  lectures: Lecture[];
  characters: Character[];
  mistakes: Mistake[];
  /** The strict reader can only return complete pagination. */
  paginationComplete: boolean;
  /** True because this projection does not read Notion relation properties. */
  relationCompleteness: boolean;
  sourceIdentifiers: readonly string[];
}>;

export class KuzushijiSnapshotSourceError extends Error {
  readonly code:

    | "notion-token-missing"
    | "http-error"
    | "malformed-response"
    | "pagination-incomplete"
    | "pagination-cycle";

  constructor(
    code: KuzushijiSnapshotSourceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "KuzushijiSnapshotSourceError";
    this.code = code;
  }
}

function getNotionToken() {
  const token = process.env.NOTION_TOKEN?.trim() || process.env.StudyGraph_NOTION_TOKEN?.trim();
  return token || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePage(value: unknown, source: string): NotionPage {
  if (!isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.url) || !isRecord(value.properties)) {
    throw new KuzushijiSnapshotSourceError(
      "malformed-response",
      `${source} returned a malformed page`,
    );
  }
  return {
    id: value.id,
    url: value.url,
    properties: value.properties as Record<string, NotionProperty>,
  };
}

function parseQueryResponse(value: unknown, source: string): NotionQueryResponse {
  if (
    !isRecord(value)
    || !Array.isArray(value.results)
    || typeof value.has_more !== "boolean"
    || !Object.prototype.hasOwnProperty.call(value, "next_cursor")
    || (value.next_cursor !== null && !nonEmptyString(value.next_cursor))
  ) {
    throw new KuzushijiSnapshotSourceError(
      "malformed-response",
      `${source} returned a malformed pagination response`,
    );
  }
  return {
    results: value.results,
    has_more: value.has_more,
    next_cursor: value.next_cursor,
  };
}

async function queryAllDataSource(dataSourceId: string, token: string, label: string): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  const seenPageIds = new Set<string>();
  const seenCursors = new Set<string>();
  let startCursor: string | null = null;

  while (true) {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": KUZUSHIJI_NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor === null ? {} : { start_cursor: startCursor }),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new KuzushijiSnapshotSourceError(
        "http-error",
        `${label} query failed with HTTP ${response.status}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new KuzushijiSnapshotSourceError(
        "malformed-response",
        `${label} response was not valid JSON`,
      );
    }

    const payload = parseQueryResponse(parsed, label);
    for (const result of payload.results) {
      const page = parsePage(result, label);
      if (seenPageIds.has(page.id)) {
        throw new KuzushijiSnapshotSourceError(
          "malformed-response",
          `${label} returned a duplicate page`,
        );
      }
      seenPageIds.add(page.id);
      results.push(page);
    }

    if (!payload.has_more) return results;

    let nextCursor: string;
    try {
      nextCursor = nextCursorOrThrow(payload, label) as string;
    } catch (error) {
      throw new KuzushijiSnapshotSourceError(
        "pagination-incomplete",
        error instanceof Error ? error.message : `${label} pagination is incomplete`,
      );
    }
    if (seenCursors.has(nextCursor)) {
      throw new KuzushijiSnapshotSourceError(
        "pagination-cycle",
        `${label} pagination cursor repeated`,
      );
    }
    seenCursors.add(nextCursor);
    startCursor = nextCursor;
  }
}

function textItems(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => isRecord(item) && typeof item.plain_text === "string" ? item.plain_text : "")
    .join("");
}

function text(property?: NotionProperty): string {
  if (!property) return "";
  return property.type === "title" ? textItems(property.title) : textItems(property.rich_text);
}

function number(property?: NotionProperty): number | null {
  return typeof property?.number === "number" && Number.isFinite(property.number)
    ? property.number
    : null;
}

function select(property?: NotionProperty): string {
  return isRecord(property?.select) && typeof property.select.name === "string"
    ? property.select.name
    : "";
}

function date(property?: NotionProperty): string | null {
  return isRecord(property?.date) && typeof property.date.start === "string"
    ? property.date.start
    : null;
}

function checkbox(property?: NotionProperty): boolean {
  return typeof property?.checkbox === "boolean" ? property.checkbox : false;
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortLectures(lectures: Lecture[]) {
  return [...lectures].sort((left, right) => left.sequence - right.sequence || compareStrings(left.id, right.id));
}

function sortCharacters(characters: Character[]) {
  return [...characters].sort((left, right) => compareStrings(left.id, right.id));
}

function sortMistakes(mistakes: Mistake[]) {
  return [...mistakes].sort((left, right) => compareStrings(left.id, right.id));
}

/** Same queue business rule as the screen reader, with a snapshot-only tie-break. */
export function buildKuzushijiReviewQueue(
  characters: readonly Character[],
  mistakes: readonly Mistake[],
): ReviewItem[] {
  const retryMistakes: ReviewItem[] = sortMistakes([...mistakes])
    .filter((item) => item.retry && !item.resolved)
    .map((item) => ({
      id: item.id,
      kind: "mistake" as const,
      label: item.title || item.correctAnswer || "誤読記録",
      reason: item.cause || "再出題対象",
    }));

  const weakCharacters: ReviewItem[] = sortCharacters([...characters])
    .filter((item) => item.mastery !== "即読")
    .sort((left, right) => right.errorCount - left.errorCount || compareStrings(left.id, right.id))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      kind: "character" as const,
      label: item.glyph || item.reading || "文字",
      reason: [item.mastery, item.importance ? `重要度${item.importance}` : ""]
        .filter(Boolean)
        .join("・"),
    }));

  return [...retryMistakes, ...weakCharacters].slice(0, 12);
}

function mapLecture(page: NotionPage): Lecture {
  return {
    id: page.id,
    url: page.url,
    title: text(page.properties["講義名"]),
    sequence: number(page.properties["回次"]) ?? 0,
    theme: text(page.properties["学習テーマ"]),
    status: select(page.properties["状態"]),
    completedAt: date(page.properties["実施日"]),
    reviewAccuracy: number(page.properties["復習正答率"]),
    newCharactersCount: number(page.properties["新規字数"]),
  };
}

function mapCharacter(page: NotionPage): Character {
  return {
    id: page.id,
    url: page.url,
    glyph: text(page.properties["文字"]),
    reading: text(page.properties["読み"]),
    mother: text(page.properties["字母"]),
    category: select(page.properties["分類"]),
    mastery: select(page.properties["習得状態"]),
    importance: select(page.properties["重要度"]),
    errorCount: number(page.properties["誤読回数"]) ?? 0,
    lastReviewedAt: date(page.properties["最終復習日"]),
  };
}

function mapMistake(page: NotionPage): Mistake {
  return {
    id: page.id,
    url: page.url,
    title: text(page.properties["誤読項目"]),
    answer: text(page.properties["自分の回答"]),
    correctAnswer: text(page.properties["正解"]),
    cause: select(page.properties["原因"]),
    retry: checkbox(page.properties["再出題"]),
    resolved: checkbox(page.properties["克服済み"]),
    errorDate: date(page.properties["誤読日"]),
  };
}

/** Read all three Kuzushiji databases without demo or partial-result fallback. */
export async function readKuzushijiSnapshotSource(): Promise<KuzushijiSnapshotSource> {
  const token = getNotionToken();
  if (!token) {
    throw new KuzushijiSnapshotSourceError(
      "notion-token-missing",
      "NOTION_TOKEN is required for a snapshot sync",
    );
  }

  const [lecturePages, characterPages, mistakePages] = await Promise.all([
    queryAllDataSource(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures, token, "Kuzushiji lectures"),
    queryAllDataSource(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters, token, "Kuzushiji characters"),
    queryAllDataSource(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.mistakes, token, "Kuzushiji mistakes"),
  ]);

  const lectures = sortLectures(lecturePages.map(mapLecture));
  const characters = sortCharacters(characterPages.map(mapCharacter));
  const mistakes = sortMistakes(mistakePages.map(mapMistake));

  return {
    lectures,
    characters,
    mistakes,
    paginationComplete: true,
    // The current projection only uses Character.mastery and the scalar
    // fields above.  This does not claim that every Notion relation was read.
    relationCompleteness: true,
    sourceIdentifiers: [...KUZUSHIJI_SNAPSHOT_SOURCE_IDENTIFIERS],
  };
}
