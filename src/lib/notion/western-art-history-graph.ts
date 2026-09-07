import type { GraphData, GraphEdge, GraphNode } from "@/src/lib/graph/types";
import { nextCursorOrThrow } from "./pagination";

const PROJECT_ID = "western-art-history";
const NOTION_API_VERSION = "2026-03-11";

const LECTURES_DATA_SOURCE_ID = "3b1d2793-4134-80a1-bb5f-000bf3dd62b7";
const ARTISTS_DATA_SOURCE_ID = "3b1d2793-4134-8090-86a7-000b8fe1f74b";
const ARTWORKS_DATA_SOURCE_ID = "3b1d2793-4134-80a5-b3ce-000b80fc800c";
const MOVEMENTS_DATA_SOURCE_ID = "3b1d2793-4134-8015-ac11-000b9e72e127";
const TERMS_DATA_SOURCE_ID = "3b1d2793-4134-80e1-b185-000bd0cddaf9";
const PERIODS_DATA_SOURCE_ID = "3b1d2793-4134-8088-8422-000b6fb72ad7";
const CULTURE_DATA_SOURCE_ID = "3b1d2793-4134-8044-a522-000b5cad80d8";
const MUSEUMS_DATA_SOURCE_ID = "3b1d2793-4134-80da-9a6f-000bac184fa7";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  date?: { start?: string | null; end?: string | null } | null;
  relation?: Array<{ id?: string }>;
};

type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

type NotionQueryResponse = {
  results?: unknown[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function getNotionToken() {
  return process.env.NOTION_TOKEN ?? process.env.StudyGraph_NOTION_TOKEN ?? null;
}

async function queryAllDataSource(dataSourceId: string, token: string) {
  const results: unknown[] = [];
  let startCursor: string | null = null;

  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion Western Art History query failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as NotionQueryResponse;
    results.push(...(payload.results ?? []));
    startCursor = nextCursorOrThrow(payload, "Notion Western Art History query");
  } while (startCursor);

  return results;
}

function asPages(results: unknown[] = []) {
  return results.filter(
    (result): result is NotionPage =>
      typeof result === "object" &&
      result !== null &&
      "id" in result &&
      "url" in result &&
      "properties" in result,
  );
}

function text(property?: NotionProperty) {
  const values = property?.type === "title" ? property.title : property?.rich_text;
  return values?.map((item) => item.plain_text ?? "").join("") ?? "";
}

function select(property?: NotionProperty) {
  return property?.select?.name ?? "";
}

function number(property?: NotionProperty) {
  return property?.number ?? null;
}

function date(property?: NotionProperty) {
  return property?.date?.start ?? "";
}

function multiSelect(property?: NotionProperty) {
  return property?.multi_select?.flatMap((item) => (item.name ? [item.name] : [])) ?? [];
}

function relations(property?: NotionProperty) {
  return property?.relation?.flatMap((item) => (item.id ? [item.id] : [])) ?? [];
}

function joinMeta(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).join("・");
}

function demoGraph(sourceState: "demo" | "unavailable" = "demo"): GraphData {
  const nodes: GraphNode[] = [
    { id: "demo-art-lecture", kind: "lecture", label: "第1回 先史美術", meta: "先史・古代美術・Demo", href: null, notionUrl: "#" },
    { id: "demo-art-artwork", kind: "artwork", label: "ラスコー洞窟壁画", meta: "旧石器時代・壁画", href: null, notionUrl: "#" },
    { id: "demo-art-movement", kind: "movement", label: "先史美術", meta: "ヨーロッパ・象徴表現", href: null, notionUrl: "#" },
    { id: "demo-art-term", kind: "term", label: "コンテクスト", meta: "概念・作品を取り巻く文脈", href: null, notionUrl: "#" },
    { id: "demo-art-period", kind: "period", label: "旧石器時代", meta: "先史時代", href: null, notionUrl: "#" },
    { id: "demo-art-culture", kind: "culture", label: "狩猟採集社会", meta: "文化・歴史", href: null, notionUrl: "#" },
    { id: "demo-art-museum", kind: "museum", label: "ラスコー洞窟", meta: "フランス・洞窟／遺跡", href: null, notionUrl: "#" },
  ];

  const edges: GraphEdge[] = [
    { id: "demo-art-1", source: "demo-art-lecture", target: "demo-art-artwork", kind: "lecture-artwork", label: "関連作品" },
    { id: "demo-art-2", source: "demo-art-lecture", target: "demo-art-movement", kind: "lecture-movement", label: "関連様式" },
    { id: "demo-art-3", source: "demo-art-lecture", target: "demo-art-term", kind: "lecture-term", label: "関連用語" },
    { id: "demo-art-4", source: "demo-art-artwork", target: "demo-art-period", kind: "artwork-period", label: "時代" },
    { id: "demo-art-5", source: "demo-art-artwork", target: "demo-art-museum", kind: "artwork-museum", label: "所蔵先" },
    { id: "demo-art-6", source: "demo-art-period", target: "demo-art-culture", kind: "period-culture", label: "文化・歴史" },
  ];

  return {
    projectId: PROJECT_ID,
    mode: "demo",
    scope: { sourceState, anchors: [] },
    nodes,
    edges,
  };
}

export async function getWesternArtHistoryGraph(): Promise<GraphData> {
  const token = getNotionToken();
  if (!token) return demoGraph();

  try {
    const [lectureResults, artistResults, artworkResults, movementResults, termResults, periodResults, cultureResults, museumResults] = await Promise.all([
      queryAllDataSource(LECTURES_DATA_SOURCE_ID, token),
      queryAllDataSource(ARTISTS_DATA_SOURCE_ID, token),
      queryAllDataSource(ARTWORKS_DATA_SOURCE_ID, token),
      queryAllDataSource(MOVEMENTS_DATA_SOURCE_ID, token),
      queryAllDataSource(TERMS_DATA_SOURCE_ID, token),
      queryAllDataSource(PERIODS_DATA_SOURCE_ID, token),
      queryAllDataSource(CULTURE_DATA_SOURCE_ID, token),
      queryAllDataSource(MUSEUMS_DATA_SOURCE_ID, token),
    ]);

    const lectures = asPages(lectureResults);
    const artists = asPages(artistResults);
    const artworks = asPages(artworkResults);
    const movements = asPages(movementResults);
    const terms = asPages(termResults);
    const periods = asPages(periodResults);
    const cultures = asPages(cultureResults);
    const museums = asPages(museumResults);

    const nodes: GraphNode[] = [
      ...lectures.map((page) => {
        const sequence = number(page.properties["回数"]);
        return {
          id: page.id,
          kind: "lecture",
          label: text(page.properties["講義名"]) || "講義",
          meta: joinMeta([
            sequence !== null ? `第${sequence}回` : null,
            select(page.properties["フェーズ"]),
            text(page.properties["テーマ"]),
            select(page.properties["理解度"]),
          ]),
          href: null,
          notionUrl: page.url,
        };
      }),
      ...artists.map((page) => ({
        id: page.id,
        kind: "artist",
        label: text(page.properties["名前"]) || "芸術家",
        meta: joinMeta([
          text(page.properties["生没年"]),
          select(page.properties["国・地域"]),
          select(page.properties["重要度"]),
          text(page.properties["技法・特徴"]),
        ]),
        reviewText: text(page.properties["技法・特徴"]),
        href: null,
        notionUrl: page.url,
      })),
      ...artworks.map((page) => ({
        id: page.id,
        kind: "artwork",
        label: text(page.properties["作品名"]) || "作品",
        meta: joinMeta([
          text(page.properties["制作年"]),
          select(page.properties["ジャンル"]),
          select(page.properties["国"]),
          select(page.properties["重要度"]),
          multiSelect(page.properties["主題"]).slice(0, 2).join("・"),
        ]),
        reviewText: multiSelect(page.properties["主題"]).slice(0, 2).join("・"),
        href: null,
        notionUrl: page.url,
      })),
      ...movements.map((page) => ({
        id: page.id,
        kind: "movement",
        label: text(page.properties["名称"]) || "様式・運動",
        meta: joinMeta([
          select(page.properties["地域"]),
          select(page.properties["重要度"]),
          text(page.properties["特徴"]),
        ]),
        reviewText: text(page.properties["特徴"]),
        href: null,
        notionUrl: page.url,
      })),
      ...terms.map((page) => ({
        id: page.id,
        kind: "term",
        label: text(page.properties["用語"]) || "用語",
        meta: joinMeta([
          select(page.properties["分類"]),
          select(page.properties["重要度"]),
          text(page.properties["意味"]),
        ]),
        reviewText: text(page.properties["意味"]),
        href: null,
        notionUrl: page.url,
      })),
      ...periods.map((page) => ({
        id: page.id,
        kind: "period",
        label: text(page.properties["時代名"]) || "時代",
        meta: joinMeta([
          text(page.properties["年代"]),
          select(page.properties["地域"]),
          text(page.properties["特徴"]),
        ]),
        reviewText: text(page.properties["特徴"]),
        href: null,
        notionUrl: page.url,
      })),
      ...cultures.map((page) => ({
        id: page.id,
        kind: "culture",
        label: text(page.properties["出来事"]) || "文化・歴史",
        meta: joinMeta([
          text(page.properties["年代"]),
          select(page.properties["種類"]),
          select(page.properties["地域"]),
          text(page.properties["解説"]),
        ]),
        reviewText: text(page.properties["解説"]),
        href: null,
        notionUrl: page.url,
      })),
      ...museums.map((page) => ({
        id: page.id,
        kind: "museum",
        label: text(page.properties["名前"]) || "美術館・建築",
        meta: joinMeta([
          select(page.properties["種類"]),
          joinMeta([select(page.properties["都市"]), select(page.properties["国"])]),
          text(page.properties["建立年"]),
          text(page.properties["解説"]),
        ]),
        reviewText: text(page.properties["解説"]),
        href: null,
        notionUrl: page.url,
      })),
    ];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: GraphEdge[] = [];
    const edgeKeys = new Set<string>();

    function connect(source: string, target: string, kind: string, label: string) {
      if (!nodeIds.has(source) || !nodeIds.has(target) || source === target) return;
      const pair = [source, target].sort().join(":");
      const key = `${pair}:${kind}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ id: key, source, target, kind, label });
    }

    for (const page of lectures) {
      for (const id of relations(page.properties["芸術家"])) connect(page.id, id, "lecture-artist", "関連芸術家");
      for (const id of relations(page.properties["作品"])) connect(page.id, id, "lecture-artwork", "関連作品");
      for (const id of relations(page.properties["様式・運動"])) connect(page.id, id, "lecture-movement", "関連様式");
      for (const id of relations(page.properties["用語"])) connect(page.id, id, "lecture-term", "関連用語");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "lecture-period", "関連時代");
      for (const id of relations(page.properties["文化・歴史"])) connect(page.id, id, "lecture-culture", "文化・歴史");
      for (const id of relations(page.properties["美術館・建築"])) connect(page.id, id, "lecture-museum", "美術館・建築");
    }

    for (const page of artworks) {
      for (const id of relations(page.properties["作者"])) connect(page.id, id, "artwork-artist", "作者");
      for (const id of relations(page.properties["様式・運動"])) connect(page.id, id, "artwork-movement", "様式・運動");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "artwork-period", "時代");
      for (const id of relations(page.properties["所蔵先"])) connect(page.id, id, "artwork-museum", "所蔵先");
    }

    for (const page of artists) {
      for (const id of relations(page.properties["様式・運動"])) connect(page.id, id, "artist-movement", "様式・運動");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "artist-period", "時代");
      for (const id of relations(page.properties["影響を受けた人物"])) connect(page.id, id, "artist-influence", "影響を受けた人物");
    }

    for (const page of movements) {
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "movement-period", "時代");
      for (const id of relations(page.properties["次の様式・運動"])) connect(page.id, id, "movement-sequence", "次の様式・運動");
    }

    for (const page of terms) {
      for (const id of relations(page.properties["関連作品"])) connect(page.id, id, "term-artwork", "関連作品");
      for (const id of relations(page.properties["関連芸術家"])) connect(page.id, id, "term-artist", "関連芸術家");
      for (const id of relations(page.properties["関連様式・運動"])) connect(page.id, id, "term-movement", "関連様式");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "term-period", "関連時代");
    }

    for (const page of periods) {
      for (const id of relations(page.properties["次の時代"])) connect(page.id, id, "period-sequence", "次の時代");
      for (const id of relations(page.properties["文化・歴史"])) connect(page.id, id, "period-culture", "文化・歴史");
    }

    for (const page of cultures) {
      for (const id of relations(page.properties["関連作品"])) connect(page.id, id, "culture-artwork", "関連作品");
      for (const id of relations(page.properties["関連様式・運動"])) connect(page.id, id, "culture-movement", "関連様式");
    }

    for (const page of museums) {
      for (const id of relations(page.properties["建築様式"])) connect(page.id, id, "museum-movement", "建築様式");
    }

    const scopeAnchors = lectures.map((page) => ({
      id: page.id,
      completion: "unknown" as const,
      date: date(page.properties["実施日"]) || date(page.properties["日付"]),
      directRelations: edges
        .filter((edge) => edge.source === page.id)
        .map((edge) => ({ nodeId: edge.target, kind: edge.kind })),
    }));

    return {
      projectId: PROJECT_ID,
      mode: "notion",
      scope: { sourceState: "ready", anchors: scopeAnchors },
      nodes,
      edges,
    };
  } catch (error) {
    console.error("Study Graph: Western Art History Graph sync failed", error);
    return demoGraph("unavailable");
  }
}
