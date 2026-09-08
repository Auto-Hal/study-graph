import assert from "node:assert/strict";
import test from "node:test";
import {
  KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS,
  KuzushijiSnapshotSourceError,
  readKuzushijiSnapshotSource,
} from "./kuzushiji-snapshot-source.ts";

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const originalFetch = globalThis.fetch;
const originalNotionToken = process.env.NOTION_TOKEN;
const originalStudyGraphNotionToken = process.env.StudyGraph_NOTION_TOKEN;

function response(payload: unknown, status = 200): FetchResponse {
  const body = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => body,
  };
}

function property(type: string, value: unknown) {
  if (type === "title" || type === "rich_text") return { type, [type]: [{ plain_text: value }] };
  if (type === "select") return { type, select: value === "" ? null : { name: value } };
  if (type === "date") return { type, date: value === null ? null : { start: value } };
  if (type === "number") return { type, number: value };
  if (type === "checkbox") return { type, checkbox: value };
  return { type };
}

function page(id: string, overrides: Record<string, unknown> = {}) {
  return {
    object: "page",
    id,
    url: `https://notion.example/${id}`,
    properties: {
      "講義名": property("title", overrides.title ?? "講義"),
      "回次": property("number", overrides.sequence ?? 1),
      "学習テーマ": property("rich_text", overrides.theme ?? "テーマ"),
      "状態": property("select", overrides.status ?? "完了"),
      "実施日": property("date", overrides.completedAt ?? "2030-01-01"),
      "復習正答率": property("number", null),
      "新規字数": property("number", null),
      "文字": property("rich_text", overrides.glyph ?? "あ"),
      "読み": property("rich_text", overrides.reading ?? "あ"),
      "字母": property("rich_text", overrides.mother ?? "安"),
      "分類": property("select", overrides.category ?? "変体仮名"),
      "習得状態": property("select", overrides.mastery ?? "学習中"),
      "重要度": property("select", overrides.importance ?? "A"),
      "誤読回数": property("number", overrides.errorCount ?? 0),
      "最終復習日": property("date", null),
      "誤読項目": property("rich_text", overrides.mistakeTitle ?? ""),
      "自分の回答": property("rich_text", ""),
      "正解": property("rich_text", overrides.correctAnswer ?? ""),
      "原因": property("select", ""),
      "再出題": property("checkbox", overrides.retry ?? false),
      "克服済み": property("checkbox", overrides.resolved ?? false),
      "誤読日": property("date", null),
    },
  };
}

function setToken(value: string | undefined) {
  if (value === undefined) delete process.env.NOTION_TOKEN;
  else process.env.NOTION_TOKEN = value;
  delete process.env.StudyGraph_NOTION_TOKEN;
}

function installFetch(handler: (url: string, cursor: string | null) => FetchResponse) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { start_cursor?: string } : {};
    return handler(url, body.start_cursor ?? null) as unknown as Response;
  }) as typeof fetch;
}

function onePageResponse(results: unknown[]) {
  return { results, has_more: false, next_cursor: null };
}

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalNotionToken === undefined) delete process.env.NOTION_TOKEN;
  else process.env.NOTION_TOKEN = originalNotionToken;
  if (originalStudyGraphNotionToken === undefined) delete process.env.StudyGraph_NOTION_TOKEN;
  else process.env.StudyGraph_NOTION_TOKEN = originalStudyGraphNotionToken;
}

test("strict source reads one complete page from all three data sources", async () => {
  try {
    setToken("test-token");
    installFetch((url) => {
      if (url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures)) return response(onePageResponse([page("lecture-1")]));
      if (url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters)) return response(onePageResponse([page("character-1")]));
      return response(onePageResponse([page("mistake-1", { retry: true })]));
    });
    const source = await readKuzushijiSnapshotSource();
    assert.equal(source.lectures.length, 1);
    assert.equal(source.characters[0]?.mastery, "学習中");
    assert.equal(source.mistakes[0]?.retry, true);
    assert.equal(source.paginationComplete, true);
    assert.equal(source.relationCompleteness, true);
  } finally {
    restoreEnvironment();
  }
});

test("strict source follows every pagination cursor", async () => {
  try {
    setToken("test-token");
    const calls: Array<{ source: string; cursor: string | null }> = [];
    installFetch((url, cursor) => {
      const source = url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures)
        ? "lectures"
        : url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters) ? "characters" : "mistakes";
      calls.push({ source, cursor });
      if (source === "characters" && cursor === null) return response({ results: [page("character-1")], has_more: true, next_cursor: "cursor-1" });
      if (source === "characters" && cursor === "cursor-1") return response(onePageResponse([page("character-2", { glyph: "い", reading: "い" })]));
      return response(onePageResponse([]));
    });
    const source = await readKuzushijiSnapshotSource();
    assert.deepEqual(source.characters.map((item) => item.id), ["character-1", "character-2"]);
    assert.deepEqual(calls.filter((call) => call.source === "characters").map((call) => call.cursor), [null, "cursor-1"]);
  } finally {
    restoreEnvironment();
  }
});

test("has_more without a cursor fails closed", async () => {
  try {
    setToken("test-token");
    installFetch((url) => url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures)
      ? response({ results: [], has_more: true, next_cursor: null })
      : response(onePageResponse([])));
    await assert.rejects(readKuzushijiSnapshotSource(), (error: unknown) =>
      error instanceof KuzushijiSnapshotSourceError && error.code === "pagination-incomplete");
  } finally {
    restoreEnvironment();
  }
});

test("a middle page HTTP failure fails the whole strict read", async () => {
  try {
    setToken("test-token");
    installFetch((url, cursor) => {
      if (url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters) && cursor === "cursor-1") return response({ error: "temporary" }, 503);
      if (url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.characters)) return response({ results: [page("character-1")], has_more: true, next_cursor: "cursor-1" });
      return response(onePageResponse([]));
    });
    await assert.rejects(readKuzushijiSnapshotSource(), (error: unknown) =>
      error instanceof KuzushijiSnapshotSourceError && error.code === "http-error");
  } finally {
    restoreEnvironment();
  }
});

test("malformed response and malformed page fail closed", async () => {
  try {
    setToken("test-token");
    installFetch((url) => url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures)
      ? response({ results: [], has_more: false })
      : response(onePageResponse([])));
    await assert.rejects(readKuzushijiSnapshotSource(), (error: unknown) =>
      error instanceof KuzushijiSnapshotSourceError && error.code === "malformed-response");

    installFetch((url) => url.includes(KUZUSHIJI_SNAPSHOT_DATA_SOURCE_IDS.lectures)
      ? response(onePageResponse([{ id: "missing-properties", url: "https://notion.example/missing" }]))
      : response(onePageResponse([])));
    await assert.rejects(readKuzushijiSnapshotSource(), (error: unknown) =>
      error instanceof KuzushijiSnapshotSourceError && error.code === "malformed-response");
  } finally {
    restoreEnvironment();
  }
});

test("missing Notion token never uses demo data", async () => {
  try {
    setToken(undefined);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return response(onePageResponse([])) as unknown as Response;
    }) as typeof fetch;
    await assert.rejects(readKuzushijiSnapshotSource(), (error: unknown) =>
      error instanceof KuzushijiSnapshotSourceError && error.code === "notion-token-missing");
    assert.equal(called, false);
  } finally {
    restoreEnvironment();
  }
});
