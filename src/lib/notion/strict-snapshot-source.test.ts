import assert from "node:assert/strict";
import test from "node:test";
import {
  StrictNotionSnapshotSourceError,
  collectStrictRelationObservations,
  materializeStrictRelations,
  queryAllNotionDataSource,
  queryAllNotionRelationProperty,
  readNotionDisplayLabel,
  type StrictNotionPage,
} from "./strict-snapshot-source.ts";

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function page(id: string): StrictNotionPage {
  return {
    object: "page",
    id,
    url: `https://notion.test/${id}`,
    properties: {},
  };
}

test("display labels preserve trusted fallback semantics without hiding schema drift", () => {
  const emptyTitle: StrictNotionPage = {
    ...page("empty-title"),
    properties: {
      名前: { id: "title", type: "title", title: [] },
    },
  };
  assert.equal(
    readNotionDisplayLabel(emptyTitle, "名前", "fixture artist", "芸術家"),
    "芸術家",
  );

  assert.throws(
    () => readNotionDisplayLabel(page("missing-title"), "名前", "fixture artist", "芸術家"),
    (error) =>
      error instanceof StrictNotionSnapshotSourceError &&
      error.code === "malformed-response" &&
      /is missing/.test(error.message),
  );

  const wrongType: StrictNotionPage = {
    ...page("wrong-type"),
    properties: {
      名前: { id: "name", type: "rich_text", rich_text: [] },
    },
  };
  assert.throws(
    () => readNotionDisplayLabel(wrongType, "名前", "fixture artist", "芸術家"),
    (error) =>
      error instanceof StrictNotionSnapshotSourceError &&
      error.code === "malformed-response" &&
      /invalid type/.test(error.message),
  );

  const malformedTitle: StrictNotionPage = {
    ...page("malformed-title"),
    properties: {
      名前: { id: "title", type: "title", title: [{}] },
    },
  };
  assert.throws(
    () => readNotionDisplayLabel(malformedTitle, "名前", "fixture artist", "芸術家"),
    (error) =>
      error instanceof StrictNotionSnapshotSourceError &&
      error.code === "malformed-response",
  );
});

async function withFetch(responses: unknown[], run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = async () => response(responses[index++]);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("strict data-source reader completes pages and rejects incomplete or cyclic pagination", async () => {
  await withFetch([
    { results: [page("page-a")], has_more: true, next_cursor: "cursor-a" },
    { results: [page("page-b")], has_more: false, next_cursor: null },
  ], async () => {
    const pages = await queryAllNotionDataSource("source", "token", "fixture");
    assert.deepEqual(pages.map((item) => item.id), ["page-a", "page-b"]);
  });

  await withFetch([
    { results: [page("page-a")], has_more: true, next_cursor: null },
  ], async () => {
    await assert.rejects(
      queryAllNotionDataSource("source", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "pagination-incomplete",
    );
  });

  await withFetch([
    { results: [page("page-a")], has_more: true, next_cursor: "cursor-a" },
    { results: [page("page-b")], has_more: true, next_cursor: "cursor-a" },
  ], async () => {
    await assert.rejects(
      queryAllNotionDataSource("source", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "pagination-cycle",
    );
  });
});

test("strict data-source reader rejects duplicate page IDs", async () => {
  await withFetch([
    { results: [page("page-a")], has_more: true, next_cursor: "cursor-a" },
    { results: [page("page-a")], has_more: false, next_cursor: null },
  ], async () => {
    await assert.rejects(
      queryAllNotionDataSource("source", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "duplicate-page",
    );
  });
});

function relationPage(id = "owner"): StrictNotionPage {
  return {
    ...page(id),
    properties: { Related: { id: "property-id", type: "relation", relation: [] } },
  };
}

test("strict Notion reads retry 429/529 with Retry-After without weakening final validation", async () => {
  const originalFetch = globalThis.fetch;
  let relationCalls = 0;
  globalThis.fetch = async () => {
    relationCalls += 1;
    if (relationCalls === 1) {
      return new Response(JSON.stringify({ code: "rate_limited" }), {
        status: 429,
        headers: { "retry-after": "0", "content-type": "application/json" },
      });
    }
    return response({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [{ object: "property_item", type: "relation", relation: { id: "target" } }],
      has_more: false,
      next_cursor: null,
    });
  };
  try {
    assert.deepEqual(
      await queryAllNotionRelationProperty(relationPage(), "Related", "token", "fixture"),
      ["target"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(relationCalls, 2);

  let queryCalls = 0;
  globalThis.fetch = async () => {
    queryCalls += 1;
    if (queryCalls === 1) {
      return new Response(JSON.stringify({ code: "service_overload" }), {
        status: 529,
        headers: { "retry-after": "0", "content-type": "application/json" },
      });
    }
    return response({ results: [page("page-a")], has_more: false, next_cursor: null });
  };
  try {
    const pages = await queryAllNotionDataSource("source", "token", "fixture");
    assert.deepEqual(pages.map((item) => item.id), ["page-a"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(queryCalls, 2);
});

test("non-retryable Notion errors remain fail closed without extra requests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ code: "validation_error" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await assert.rejects(
      queryAllNotionDataSource("source", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "http-error",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 1);
});

test("relation property IDs are encoded exactly once for the property endpoint", async () => {
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return response({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [{ object: "property_item", type: "relation", relation: { id: "target" } }],
      has_more: false,
      next_cursor: null,
    });
  };
  try {
    await queryAllNotionRelationProperty({
      ...page("owner"),
      properties: { Related: { id: "f%5C%5C%3Ap", type: "relation", relation: [] } },
    }, "Related", "token", "fixture");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrls.length, 1);
  assert.ok(requestedUrls[0].includes("/properties/f%5C%5C%3Ap"));
  assert.ok(!requestedUrls[0].includes("/properties/f%255C%255C%253Ap"));
});

test("plain relation property IDs remain valid and malformed percent encoding fails closed", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return response({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [],
      has_more: false,
      next_cursor: null,
    });
  };
  try {
    await queryAllNotionRelationProperty(relationPage(), "Related", "token", "fixture");
    await assert.rejects(
      queryAllNotionRelationProperty({
        ...page("owner"),
        properties: { Related: { id: "%ZZ", type: "relation", relation: [] } },
      }, "Related", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "malformed-response",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(requestedUrls.length, 1);
  assert.ok(requestedUrls[0].includes("/properties/property-id"));
});

test("relation completeness evidence identifies each source page and sorts deterministically", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    const ids = url.includes("/pages/page-a/") ? ["target-a"] : ["target-b-1", "target-b-2"];
    return response({
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: ids.map((id) => ({ object: "property_item", type: "relation", relation: { id } })),
      has_more: false,
      next_cursor: null,
    });
  };
  try {
    const result = await collectStrictRelationObservations(
      [
        { page: relationPage("page-b"), kind: "artist" },
        { page: relationPage("page-a"), kind: "artist" },
      ],
      [{ ownerKind: "artist", propertyName: "Related", relationKind: "artist-related", relationLabel: "Related" }],
      "token",
      "fixture",
    );
    assert.deepEqual(result.evidence.map((item) => ({ sourceEntityId: item.sourceEntityId, itemCount: item.itemCount })), [
      { sourceEntityId: "page-a", itemCount: 1 },
      { sourceEntityId: "page-b", itemCount: 2 },
    ]);
    assert.deepEqual(result.observations.map((item) => item.sourceEntityId).sort(), ["page-a", "page-b", "page-b"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("strict relation property reader paginates and deduplicates target IDs", async () => {
  await withFetch([
    {
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [
        { object: "property_item", type: "relation", relation: { id: "target-a" } },
        { object: "property_item", type: "relation", relation: { id: "target-a" } },
      ],
      has_more: true,
      next_cursor: "relation-cursor",
    },
    {
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [{ object: "property_item", type: "relation", relation: { id: "target-b" } }],
      has_more: false,
      next_cursor: null,
    },
  ], async () => {
    const ids = await queryAllNotionRelationProperty(relationPage(), "Related", "token", "fixture");
    assert.deepEqual(ids, ["target-a", "target-b"]);
  });
});

test("strict relation property reader rejects incomplete and cyclic pagination", async () => {
  await withFetch([
    {
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [],
      has_more: true,
      next_cursor: null,
    },
  ], async () => {
    await assert.rejects(
      queryAllNotionRelationProperty(relationPage(), "Related", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "relation-pagination-incomplete",
    );
  });

  await withFetch([
    {
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [],
      has_more: true,
      next_cursor: "relation-cursor",
    },
    {
      object: "list",
      type: "property_item",
      property_item: { type: "relation" },
      results: [],
      has_more: true,
      next_cursor: "relation-cursor",
    },
  ], async () => {
    await assert.rejects(
      queryAllNotionRelationProperty(relationPage(), "Related", "token", "fixture"),
      (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "relation-pagination-cycle",
    );
  });
});

test("relation materialization preserves edge semantics and fails on unresolved targets", () => {
  const relations = materializeStrictRelations([
    {
      sourceEntityId: "source",
      targetEntityId: "target",
      ownerKind: "lecture",
      propertyName: "Related",
      relationKind: "lecture-artwork",
      relationLabel: "関連作品",
    },
    {
      sourceEntityId: "source",
      targetEntityId: "target",
      ownerKind: "lecture",
      propertyName: "Another Related",
      relationKind: "lecture-artwork",
      relationLabel: "関連作品",
    },
  ], new Set(["source", "target"]), "fixture");
  assert.equal(relations.length, 1);
  assert.deepEqual(relations[0], {
    id: "source:target:lecture-artwork",
    sourceEntityId: "source",
    targetEntityId: "target",
    kind: "lecture-artwork",
    label: "関連作品",
  });

  assert.throws(
    () => materializeStrictRelations([{
      sourceEntityId: "source",
      targetEntityId: "missing",
      ownerKind: "lecture",
      propertyName: "Related",
      relationKind: "lecture-artwork",
      relationLabel: "関連作品",
    }], new Set(["source"]), "fixture"),
    (error) => error instanceof StrictNotionSnapshotSourceError && error.code === "relation-target-unresolved",
  );
});
