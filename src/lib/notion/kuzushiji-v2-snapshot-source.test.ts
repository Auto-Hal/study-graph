import assert from "node:assert/strict";
import test from "node:test";
import {
  KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS,
  KUZUSHIJI_V2_RELATION_DECLARATIONS,
  readKuzushijiV2SnapshotSource,
} from "./kuzushiji-v2-snapshot-source.ts";
import { StrictNotionSnapshotSourceError } from "./strict-snapshot-source.ts";

const originalFetch = globalThis.fetch;
const originalToken = process.env.NOTION_TOKEN;

function text(value: string, type: "title" | "rich_text" = "rich_text") {
  return { type, [type]: [{ plain_text: value }] };
}

function emptyText(type: "title" | "rich_text") {
  return { type, [type]: [] };
}

function select(value: string) {
  return { type: "select", select: value.length > 0 ? { name: value } : null };
}

function number(value: number | null) {
  return { type: "number", number: value };
}

function date(value: string | null) {
  return { type: "date", date: value === null ? null : { start: value } };
}

function checkbox(value: boolean) {
  return { type: "checkbox", checkbox: value };
}

const relationPropertyIds: Record<string, string> = {
  "重要・弱点字": "f%5C%5C%3Ap",
  "誤読記録": "lecture-mistake-property",
  "使用資料": "lecture-source-property",
  "頻出表現": "lecture-expression-property",
  "関連文字": "mistake-character-property",
  "関連資料": "mistake-source-property",
};

function relationProperties(kind: "lecture" | "mistake") {
  const names = KUZUSHIJI_V2_RELATION_DECLARATIONS.filter((item) => item.ownerKind === kind).map((item) => item.propertyName);
  return Object.fromEntries(names.map((name) => [name, {
    id: relationPropertyIds[name],
    type: "relation",
    relation: [],
  }]));
}

function page(kind: string, id: string) {
  const common = {
    object: "page",
    id,
    url: `https://notion.test/${id}`,
  };
  if (kind === "lecture") return {
    ...common,
    properties: {
      "講義名": text("第1回", "title"),
      "回次": number(1),
      "学習テーマ": text("字形と文脈"),
      "状態": select("公開"),
      "実施日": date("2030-01-01"),
      "復習正答率": number(null),
      "新規字数": number(2),
      ...relationProperties("lecture"),
    },
  };
  if (kind === "character") return {
    ...common,
    properties: {
      "文字": text(id === "character-a" ? "あ" : "い", "title"),
      "読み": text(id === "character-a" ? "あ" : "い"),
      "字母": text(id === "character-a" ? "安" : "以"),
      "分類": select("変体仮名"),
      "習得状態": select("学習中"),
      "重要度": select("A"),
      "誤読回数": number(0),
      "最終復習日": date(null),
    },
  };
  if (kind === "mistake") return {
    ...common,
    properties: {
      "誤読項目": text("誤読", "title"),
      "自分の回答": text("い"),
      "正解": text("あ"),
      "原因": select("字形"),
      "再出題": checkbox(true),
      "克服済み": checkbox(false),
      "誤読日": date(null),
      ...relationProperties("mistake"),
    },
  };
  if (kind === "source") return {
    ...common,
    properties: {
      "資料名": text("練習資料", "title"),
      "用途": select("教材"),
      "資料種別": select("版本"),
      "難易度": select("入門"),
      "時代": text("江戸"),
      "年代": text("18世紀"),
      "所蔵機関": text("研究資料館"),
      "参照URL": { type: "url", url: "https://example.test/source" },
      "読解率": number(null),
      "苦手ポイント": text(""),
    },
  };
  return {
    ...common,
    properties: {
      "表現": text("候", "title"),
      "読み": text("そうろう"),
      "分類": select("候文"),
      "意味": text("丁寧な表現"),
      "用例": text("参り候"),
      "注意点": text(""),
      "習得状態": select("学習中"),
      "重要度": select("A"),
    },
  };
}

const sourcePages: Record<string, unknown[]> = {
  [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures]: [page("lecture", "lecture-1")],
  [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.characters]: [page("character", "character-a"), page("character", "character-b")],
  [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.mistakes]: [page("mistake", "mistake-1")],
  [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources]: [page("source", "source-1")],
  [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.expressions]: [page("expression", "expression-1")],
};

function overridePageProperties(
  dataSourceId: string,
  pageId: string,
  overrides: Record<string, unknown>,
): Record<string, unknown[]> {
  return Object.fromEntries(Object.entries(sourcePages).map(([sourceId, pages]) => [
    sourceId,
    pages.map((item) => {
      if (sourceId !== dataSourceId || !item || typeof item !== "object" || Array.isArray(item)) return item;
      const record = item as Record<string, unknown>;
      if (record.id !== pageId || !record.properties || typeof record.properties !== "object" || Array.isArray(record.properties)) return item;
      const properties = record.properties as Record<string, unknown>;
      return { ...record, properties: { ...properties, ...overrides } };
    }),
  ]));
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

type FailureMode =
  | "missing-data-cursor"
  | "data-cursor-cycle"
  | "duplicate-data-page"
  | "missing-relation-cursor"
  | "relation-cursor-cycle"
  | "duplicate-relation-target";

function installFetch(
  reverse: boolean,
  requestedUrls: string[],
  failureMode?: FailureMode,
  pages: Record<string, unknown[]> = sourcePages,
) {
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/data_sources/") && url.endsWith("/query")) {
      const dataSourceId = url.split("/data_sources/")[1]!.split("/")[0]!;
      const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) as { start_cursor?: string } : {};
      const sourceCursor = requestBody.start_cursor ?? null;
      const results = [...(pages[dataSourceId] ?? [])];
      if (reverse) results.reverse();
      if (dataSourceId === KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures && failureMode === "missing-data-cursor") {
        return response({ results, has_more: true, next_cursor: null });
      }
      if (dataSourceId === KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures && failureMode === "data-cursor-cycle") {
        return response({ results, has_more: true, next_cursor: "source-cycle" });
      }
      if (dataSourceId === KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures && failureMode === "duplicate-data-page" && sourceCursor === "source-duplicate") {
        return response({ results, has_more: false, next_cursor: null });
      }
      if (dataSourceId === KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures && failureMode === "duplicate-data-page") {
        return response({ results, has_more: true, next_cursor: "source-duplicate" });
      }
      return response({ results, has_more: false, next_cursor: null });
    }
    const parsedUrl = new URL(url);
    const propertyPath = parsedUrl.pathname.split("/properties/")[1] ?? "";
    const propertyId = decodeURIComponent(propertyPath);
    const ownerId = url.split("/pages/")[1]!.split("/")[0]!;
    const cursor = parsedUrl.searchParams.get("start_cursor");
    let ids: string[] = [];
    const importantPropertyId = decodeURIComponent(relationPropertyIds["重要・弱点字"]);
    if (ownerId === "lecture-1" && propertyId === importantPropertyId && failureMode === "missing-relation-cursor") {
      return response({
        object: "list",
        type: "property_item",
        property_item: { type: "relation" },
        results: [],
        has_more: true,
        next_cursor: null,
      });
    }
    if (ownerId === "lecture-1" && propertyId === importantPropertyId && failureMode === "relation-cursor-cycle") {
      return response({
        object: "list",
        type: "property_item",
        property_item: { type: "relation" },
        results: [],
        has_more: true,
        next_cursor: "relation-cycle",
      });
    }
    if (ownerId === "lecture-1" && propertyId === importantPropertyId && failureMode === "duplicate-relation-target") {
      ids = ["character-a"];
    } else if (ownerId === "lecture-1" && propertyId === importantPropertyId && cursor === null) ids = [reverse ? "character-b" : "character-a"];
    else if (ownerId === "lecture-1" && propertyId === importantPropertyId && cursor === "relation-page-2") ids = [reverse ? "character-a" : "character-b"];
    else if (ownerId === "lecture-1" && propertyId === relationPropertyIds["誤読記録"]) ids = ["mistake-1"];
    else if (ownerId === "lecture-1" && propertyId === relationPropertyIds["使用資料"]) ids = ["source-1"];
    else if (ownerId === "lecture-1" && propertyId === relationPropertyIds["頻出表現"]) ids = ["expression-1"];
    else if (ownerId === "mistake-1" && propertyId === relationPropertyIds["関連文字"]) ids = ["character-a"];
    else if (ownerId === "mistake-1" && propertyId === relationPropertyIds["関連資料"]) ids = ["source-1"];
    const paginated = ownerId === "lecture-1" && propertyId === importantPropertyId && cursor === null;
    const relationCycle = ownerId === "lecture-1" && propertyId === importantPropertyId && failureMode === "relation-cursor-cycle";
    const duplicateRelation = ownerId === "lecture-1" && propertyId === importantPropertyId && failureMode === "duplicate-relation-target" && cursor === null;
    return response({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: ids.map((id) => ({ object: "property_item", type: "relation", relation: { id } })),
      has_more: relationCycle || paginated || duplicateRelation,
      next_cursor: relationCycle ? "relation-cycle" : paginated || duplicateRelation ? (duplicateRelation ? "relation-duplicate" : "relation-page-2") : null,
    });
  }) as typeof fetch;
}

function restore() {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.NOTION_TOKEN;
  else process.env.NOTION_TOKEN = originalToken;
}

test("v2 source fully reads five data sources and relation properties", async () => {
  const requestedUrls: string[] = [];
  process.env.NOTION_TOKEN = "fixture-token";
  installFetch(false, requestedUrls);
  try {
    const source = await readKuzushijiV2SnapshotSource();
    assert.equal(source.paginationComplete, true);
    assert.equal(source.relationCompleteness, true);
    assert.equal(source.projection.characters.length, 2);
    assert.equal(source.projection.sources.length, 1);
    assert.equal(source.projection.expressions.length, 1);
    assert.equal(source.projection.relations.length, 7);
    const evidence = source.projection.completeness.relationProperties;
    assert.equal(evidence.length, 6);
    assert.equal(evidence.find((item) => item.relationKind === "lecture-character")?.itemCount, 2);
    assert.ok(requestedUrls.some((url) => url.includes("/properties/f%5C%5C%3Ap")));
    assert.ok(requestedUrls.every((url) => !url.includes("/properties/f%255C%255C%253Ap")));
  } finally {
    restore();
  }
});

test("inverse page and relation response ordering produces the same typed projection", async () => {
  process.env.NOTION_TOKEN = "fixture-token";
  const firstUrls: string[] = [];
  installFetch(false, firstUrls);
  try {
    const first = await readKuzushijiV2SnapshotSource();
    const secondUrls: string[] = [];
    installFetch(true, secondUrls);
    const second = await readKuzushijiV2SnapshotSource();
    assert.deepEqual(second.projection, first.projection);
    assert.deepEqual(second.sourceIdentifiers, first.sourceIdentifiers);
  } finally {
    restore();
  }
});

test("v2 source rejects incomplete, cyclic, and duplicate data-source pagination", async () => {
  for (const failureMode of ["missing-data-cursor", "data-cursor-cycle", "duplicate-data-page"] as const) {
    process.env.NOTION_TOKEN = "fixture-token";
    const requestedUrls: string[] = [];
    installFetch(false, requestedUrls, failureMode);
    try {
      await assert.rejects(
        readKuzushijiV2SnapshotSource(),
        (error: unknown) => error instanceof Error && ["pagination-incomplete", "pagination-cycle", "duplicate-page"].some((code) => error.message.includes(code) || ("code" in error && error.code === code)),
      );
    } finally {
      restore();
    }
  }
});

test("v2 relation properties require complete pagination and reject duplicate targets", async () => {
  for (const failureMode of ["missing-relation-cursor", "relation-cursor-cycle", "duplicate-relation-target"] as const) {
    process.env.NOTION_TOKEN = "fixture-token";
    const requestedUrls: string[] = [];
    installFetch(false, requestedUrls, failureMode);
    try {
      await assert.rejects(
        readKuzushijiV2SnapshotSource(),
        (error: unknown) => error instanceof Error && ["relation-pagination-incomplete", "relation-pagination-cycle", "malformed-response"].some((code) => error.message.includes(code) || ("code" in error && error.code === code)),
      );
    } finally {
      restore();
    }
  }
});

function isMalformedResponse(error: unknown) {
  return error instanceof StrictNotionSnapshotSourceError && error.code === "malformed-response";
}

test("v2 source requires the exact title and rich_text schema types", async () => {
  const drifts = [
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures, "lecture-1", "講義名"],
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.characters, "character-a", "文字"],
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.mistakes, "mistake-1", "誤読項目"],
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources, "source-1", "資料名"],
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.expressions, "expression-1", "表現"],
  ] as const;
  for (const [dataSourceId, pageId, propertyName] of drifts) {
    process.env.NOTION_TOKEN = "fixture-token";
    const requestedUrls: string[] = [];
    const pages = overridePageProperties(dataSourceId, pageId, { [propertyName]: text("schema drift") });
    installFetch(false, requestedUrls, undefined, pages);
    try {
      await assert.rejects(readKuzushijiV2SnapshotSource(), isMalformedResponse);
    } finally {
      restore();
    }
  }

  process.env.NOTION_TOKEN = "fixture-token";
  const requestedUrls: string[] = [];
  const pages = overridePageProperties(
    KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures,
    "lecture-1",
    { "学習テーマ": text("schema drift", "title") },
  );
  installFetch(false, requestedUrls, undefined, pages);
  try {
    await assert.rejects(readKuzushijiV2SnapshotSource(), isMalformedResponse);
  } finally {
    restore();
  }
});

test("v2 source requires select rather than status for choice fields", async () => {
  const cases = [
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures, "lecture-1", "状態"],
    [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.characters, "character-a", "習得状態"],
  ] as const;
  for (const [dataSourceId, pageId, propertyName] of cases) {
    process.env.NOTION_TOKEN = "fixture-token";
    const requestedUrls: string[] = [];
    const pages = overridePageProperties(dataSourceId, pageId, {
      [propertyName]: { type: "status", status: { name: "公開" } },
    });
    installFetch(false, requestedUrls, undefined, pages);
    try {
      await assert.rejects(readKuzushijiV2SnapshotSource(), isMalformedResponse);
    } finally {
      restore();
    }
  }
});

test("v2 source preserves valid empty title, rich_text, select, and url values", async () => {
  process.env.NOTION_TOKEN = "fixture-token";
  const requestedUrls: string[] = [];
  const pages = overridePageProperties(
    KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures,
    "lecture-1",
    {
      "講義名": emptyText("title"),
      "学習テーマ": emptyText("rich_text"),
      "状態": select(""),
    },
  );
  const withEmptyUrl = overridePageProperties(
    KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources,
    "source-1",
    { "参照URL": { type: "url", url: null } },
  );
  const combinedPages: Record<string, unknown[]> = { ...pages, [KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources]: withEmptyUrl[KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources]! };
  installFetch(false, requestedUrls, undefined, combinedPages);
  try {
    const source = await readKuzushijiV2SnapshotSource();
    assert.equal(source.projection.lectures[0]?.title, "");
    assert.equal(source.projection.lectures[0]?.theme, "");
    assert.equal(source.projection.lectures[0]?.status, "");
    assert.equal(source.projection.sources[0]?.referenceUrl, "");
  } finally {
    restore();
  }
});
