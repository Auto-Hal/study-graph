const SOURCES_DATA_SOURCE_ID = "a8a2de24-00d8-44cc-9721-a7382b17ee98";
const EXPRESSIONS_DATA_SOURCE_ID = "e8b4669f-41a6-4c59-9876-4e44976a7e33";
const NOTION_API_VERSION = "2026-03-11";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  url?: string | null;
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

export type KuzushijiSource = {
  id: string;
  url: string;
  title: string;
  usage: string;
  materialType: string;
  difficulty: string;
  period: string;
  era: string;
  institution: string;
  referenceUrl: string;
  readingAccuracy: number | null;
  weakPoint: string;
};

export type KuzushijiExpression = {
  id: string;
  url: string;
  expression: string;
  reading: string;
  category: string;
  meaning: string;
  example: string;
  notes: string;
  mastery: string;
  importance: string;
};

export type KuzushijiReferenceData = {
  mode: "notion" | "demo";
  sources: KuzushijiSource[];
  expressions: KuzushijiExpression[];
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
      throw new Error(`Notion reference query failed (${response.status}): ${body}`);
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

function select(property?: NotionProperty) {
  return property?.select?.name ?? "";
}

function number(property?: NotionProperty) {
  return property?.number ?? null;
}

function url(property?: NotionProperty) {
  return property?.url ?? "";
}

function demoData(): KuzushijiReferenceData {
  return {
    mode: "demo",
    sources: [
      {
        id: "demo-source-1",
        url: "#",
        title: "第1回 練習資料",
        usage: "教材・参考",
        materialType: "その他",
        difficulty: "入門",
        period: "",
        era: "",
        institution: "",
        referenceUrl: "",
        readingAccuracy: null,
        weakPoint: "",
      },
    ],
    expressions: [
      {
        id: "demo-expression-1",
        url: "#",
        expression: "にて",
        reading: "にて",
        category: "その他",
        meaning: "場所・手段などを示す。",
        example: "□□にて一夜を明し",
        notes: "",
        mastery: "学習中",
        importance: "A",
      },
      {
        id: "demo-expression-2",
        url: "#",
        expression: "候",
        reading: "そうろう",
        category: "候文",
        meaning: "丁寧な言い回しに広く用いられる。",
        example: "参り候",
        notes: "",
        mastery: "学習中",
        importance: "A",
      },
    ],
  };
}

export async function getKuzushijiReferenceData(): Promise<KuzushijiReferenceData> {
  const token = getNotionToken();
  if (!token) return demoData();

  try {
    const [sourceResults, expressionResults] = await Promise.all([
      queryAllDataSource(SOURCES_DATA_SOURCE_ID, token),
      queryAllDataSource(EXPRESSIONS_DATA_SOURCE_ID, token),
    ]);

    const sources = asPages(sourceResults).map((page) => ({
      id: page.id,
      url: page.url,
      title: text(page.properties["資料名"]),
      usage: select(page.properties["用途"]),
      materialType: select(page.properties["資料種別"]),
      difficulty: select(page.properties["難易度"]),
      period: text(page.properties["時代"]),
      era: text(page.properties["年代"]),
      institution: text(page.properties["所蔵機関"]),
      referenceUrl: url(page.properties["参照URL"]),
      readingAccuracy: number(page.properties["読解率"]),
      weakPoint: text(page.properties["苦手ポイント"]),
    }));

    const expressions = asPages(expressionResults).map((page) => ({
      id: page.id,
      url: page.url,
      expression: text(page.properties["表現"]),
      reading: text(page.properties["読み"]),
      category: select(page.properties["分類"]),
      meaning: text(page.properties["意味"]),
      example: text(page.properties["用例"]),
      notes: text(page.properties["注意点"]),
      mastery: select(page.properties["習得状態"]),
      importance: select(page.properties["重要度"]),
    }));

    return { mode: "notion", sources, expressions };
  } catch (error) {
    console.error("Study Graph: Sources / Expressions sync failed", error);
    return demoData();
  }
}
