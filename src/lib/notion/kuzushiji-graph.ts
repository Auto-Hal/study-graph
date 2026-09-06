const LECTURES_DATA_SOURCE_ID = "1da45577-aa7d-44e1-a304-9e33e5feb9e2";
const CHARACTERS_DATA_SOURCE_ID = "4a9814ba-7c44-47ec-8c46-e5d558a62085";
const MISTAKES_DATA_SOURCE_ID = "12c37554-c7fa-424f-9590-f2f756bf284a";
const SOURCES_DATA_SOURCE_ID = "a8a2de24-00d8-44cc-9721-a7382b17ee98";
const EXPRESSIONS_DATA_SOURCE_ID = "e8b4669f-41a6-4c59-9876-4e44976a7e33";
const NOTION_API_VERSION = "2026-03-11";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  checkbox?: boolean;
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

export type GraphNodeKind = "lecture" | "character" | "mistake" | "source" | "expression";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  label: string;
  meta: string;
  href: string | null;
  notionUrl: string;
};

export type GraphEdgeKind =
  | "lecture-character"
  | "lecture-mistake"
  | "lecture-source"
  | "lecture-expression"
  | "mistake-character"
  | "mistake-source";

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label: string;
};

export type KuzushijiGraph = {
  mode: "notion" | "demo";
  nodes: GraphNode[];
  edges: GraphEdge[];
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
      throw new Error(`Notion graph query failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as NotionQueryResponse;
    results.push(...(payload.results ?? []));
    startCursor = payload.has_more ? payload.next_cursor ?? null : null;
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

function number(property?: NotionProperty) {
  return property?.number ?? null;
}

function select(property?: NotionProperty) {
  return property?.select?.name ?? "";
}

function checkbox(property?: NotionProperty) {
  return property?.checkbox ?? false;
}

function relations(property?: NotionProperty) {
  return property?.relation?.flatMap((item) => (item.id ? [item.id] : [])) ?? [];
}

function joinMeta(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).join("・");
}

function demoGraph(): KuzushijiGraph {
  const lectureId = "demo-lecture-1";
  const sourceId = "demo-source-1";
  const mistakeId = "demo-mistake-1";
  const characterIds = ["demo-a", "demo-i", "demo-u"];
  const expressionIds = ["demo-expression-1", "demo-expression-2", "demo-expression-3", "demo-expression-4"];

  const nodes: GraphNode[] = [
    {
      id: lectureId,
      kind: "lecture",
      label: "01_くずし字を「読む」とは何か",
      meta: "第1回・完了・字形と文脈を往復する読み方",
      href: "/projects/kuzushiji/lectures/demo-lecture-1",
      notionUrl: "#",
    },
    { id: "demo-a", kind: "character", label: "あ（安系）", meta: "あ・字母 安・学習中", href: "/projects/kuzushiji/characters/demo-a", notionUrl: "#" },
    { id: "demo-i", kind: "character", label: "い（以系）", meta: "い・字母 以・学習中", href: "/projects/kuzushiji/characters/demo-i", notionUrl: "#" },
    { id: "demo-u", kind: "character", label: "う（宇系）", meta: "う・字母 宇・学習中", href: "/projects/kuzushiji/characters/demo-u", notionUrl: "#" },
    {
      id: mistakeId,
      kind: "mistake",
      label: "字形だけで読みを即確定する",
      meta: "文脈判断ミス・未克服",
      href: "/projects/kuzushiji/mistakes/demo-mistake-1",
      notionUrl: "#",
    },
    { id: sourceId, kind: "source", label: "第1回 練習資料", meta: "教材・参考・入門", href: null, notionUrl: "#" },
    { id: expressionIds[0], kind: "expression", label: "にて", meta: "場所・手段を示す", href: null, notionUrl: "#" },
    { id: expressionIds[1], kind: "expression", label: "候", meta: "候文の基本表現", href: null, notionUrl: "#" },
    { id: expressionIds[2], kind: "expression", label: "参り候", meta: "移動を表す", href: null, notionUrl: "#" },
    { id: expressionIds[3], kind: "expression", label: "此度", meta: "今回・このたび", href: null, notionUrl: "#" },
  ];

  const edges: GraphEdge[] = [
    ...characterIds.map((id, index) => ({
      id: `${lectureId}:${id}:lecture-character`,
      source: lectureId,
      target: id,
      kind: "lecture-character" as const,
      label: "重要・弱点字",
    })),
    {
      id: `${lectureId}:${mistakeId}:lecture-mistake`,
      source: lectureId,
      target: mistakeId,
      kind: "lecture-mistake",
      label: "誤読記録",
    },
    {
      id: `${lectureId}:${sourceId}:lecture-source`,
      source: lectureId,
      target: sourceId,
      kind: "lecture-source",
      label: "使用資料",
    },
    ...expressionIds.map((id) => ({
      id: `${lectureId}:${id}:lecture-expression`,
      source: lectureId,
      target: id,
      kind: "lecture-expression" as const,
      label: "頻出表現",
    })),
    {
      id: `${mistakeId}:demo-a:mistake-character`,
      source: mistakeId,
      target: "demo-a",
      kind: "mistake-character",
      label: "関連文字",
    },
    {
      id: `${mistakeId}:${sourceId}:mistake-source`,
      source: mistakeId,
      target: sourceId,
      kind: "mistake-source",
      label: "関連資料",
    },
  ];

  return { mode: "demo", nodes, edges };
}

export async function getKuzushijiGraph(): Promise<KuzushijiGraph> {
  const token = getNotionToken();
  if (!token) return demoGraph();

  try {
    const [lectureResults, characterResults, mistakeResults, sourceResults, expressionResults] = await Promise.all([
      queryAllDataSource(LECTURES_DATA_SOURCE_ID, token),
      queryAllDataSource(CHARACTERS_DATA_SOURCE_ID, token),
      queryAllDataSource(MISTAKES_DATA_SOURCE_ID, token),
      queryAllDataSource(SOURCES_DATA_SOURCE_ID, token),
      queryAllDataSource(EXPRESSIONS_DATA_SOURCE_ID, token),
    ]);

    const lectures = asPages(lectureResults);
    const characters = asPages(characterResults);
    const mistakes = asPages(mistakeResults);
    const sources = asPages(sourceResults);
    const expressions = asPages(expressionResults);

    const nodes: GraphNode[] = [
      ...lectures.map((page) => {
        const sequence = number(page.properties["回次"]);
        return {
          id: page.id,
          kind: "lecture" as const,
          label: text(page.properties["講義名"]) || "講義",
          meta: joinMeta([
            sequence ? `第${sequence}回` : null,
            select(page.properties["状態"]),
            text(page.properties["学習テーマ"]),
          ]),
          href: `/projects/kuzushiji/lectures/${page.id}`,
          notionUrl: page.url,
        };
      }),
      ...characters.map((page) => ({
        id: page.id,
        kind: "character" as const,
        label: text(page.properties["文字"]) || text(page.properties["読み"]) || "文字",
        meta: joinMeta([
          text(page.properties["読み"]),
          text(page.properties["字母"]) ? `字母 ${text(page.properties["字母"])}` : null,
          select(page.properties["習得状態"]),
          select(page.properties["重要度"]) ? `重要度${select(page.properties["重要度"])}` : null,
        ]),
        href: `/projects/kuzushiji/characters/${page.id}`,
        notionUrl: page.url,
      })),
      ...mistakes.map((page) => ({
        id: page.id,
        kind: "mistake" as const,
        label: text(page.properties["誤読項目"]) || text(page.properties["正解"]) || "誤読記録",
        meta: joinMeta([
          select(page.properties["原因"]),
          checkbox(page.properties["克服済み"]) ? "克服済み" : "未克服",
        ]),
        href: `/projects/kuzushiji/mistakes/${page.id}`,
        notionUrl: page.url,
      })),
      ...sources.map((page) => ({
        id: page.id,
        kind: "source" as const,
        label: text(page.properties["資料名"]) || "資料",
        meta: joinMeta([
          select(page.properties["用途"]),
          select(page.properties["資料種別"]),
          select(page.properties["難易度"]),
          text(page.properties["時代"]),
        ]),
        href: null,
        notionUrl: page.url,
      })),
      ...expressions.map((page) => ({
        id: page.id,
        kind: "expression" as const,
        label: text(page.properties["表現"]) || "表現",
        meta: joinMeta([
          text(page.properties["読み"]),
          select(page.properties["分類"]),
          text(page.properties["意味"]),
        ]),
        href: null,
        notionUrl: page.url,
      })),
    ];

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: GraphEdge[] = [];

    function connect(source: string, target: string, kind: GraphEdgeKind, label: string) {
      if (!nodeIds.has(source) || !nodeIds.has(target)) return;
      const id = `${source}:${target}:${kind}`;
      if (edges.some((edge) => edge.id === id)) return;
      edges.push({ id, source, target, kind, label });
    }

    for (const page of lectures) {
      for (const id of relations(page.properties["重要・弱点字"])) connect(page.id, id, "lecture-character", "重要・弱点字");
      for (const id of relations(page.properties["誤読記録"])) connect(page.id, id, "lecture-mistake", "誤読記録");
      for (const id of relations(page.properties["使用資料"])) connect(page.id, id, "lecture-source", "使用資料");
      for (const id of relations(page.properties["頻出表現"])) connect(page.id, id, "lecture-expression", "頻出表現");
    }

    for (const page of mistakes) {
      for (const id of relations(page.properties["関連文字"])) connect(page.id, id, "mistake-character", "関連文字");
      for (const id of relations(page.properties["関連資料"])) connect(page.id, id, "mistake-source", "関連資料");
    }

    return { mode: "notion", nodes, edges };
  } catch (error) {
    console.error("Study Graph: Knowledge Graph sync failed", error);
    return demoGraph();
  }
}
