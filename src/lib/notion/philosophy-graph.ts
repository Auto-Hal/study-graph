import type { GraphData, GraphEdge, GraphNode } from "@/src/lib/graph/types";

const PROJECT_ID = "philosophy";
const NOTION_API_VERSION = "2026-03-11";

const LECTURES_DATA_SOURCE_ID = "3b0d2793-4134-80d7-8954-000b3aa060ba";
const PHILOSOPHERS_DATA_SOURCE_ID = "3b0d2793-4134-80df-b566-000b80f95459";
const TERMS_DATA_SOURCE_ID = "3b0d2793-4134-8016-8c60-000b7db6e6e4";
const PROBLEMS_DATA_SOURCE_ID = "3b0d2793-4134-8031-a01f-000b42870256";
const WORKS_DATA_SOURCE_ID = "3b0d2793-4134-805a-bdac-000be654ba52";
const CULTURE_DATA_SOURCE_ID = "3b0d2793-4134-803b-ab80-000b2027ee6f";
const PERIODS_DATA_SOURCE_ID = "3b0d2793-4134-8045-9310-000b9ba38815";
const THOUGHT_NOTES_DATA_SOURCE_ID = "3b0d2793-4134-805f-a073-000b51172a4e";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  checkbox?: boolean;
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
      throw new Error(`Notion Philosophy query failed (${response.status}): ${body}`);
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

function status(property?: NotionProperty) {
  return property?.status?.name ?? property?.select?.name ?? "";
}

function multiSelect(property?: NotionProperty) {
  return property?.multi_select?.flatMap((item) => (item.name ? [item.name] : [])) ?? [];
}

function checkbox(property?: NotionProperty) {
  return property?.checkbox ?? false;
}

function date(property?: NotionProperty) {
  return property?.date?.start ?? "";
}

function relations(property?: NotionProperty) {
  return property?.relation?.flatMap((item) => (item.id ? [item.id] : [])) ?? [];
}

function joinMeta(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).join("・");
}

function lifespan(birth: number | null, death: number | null) {
  if (birth === null && death === null) return "";
  const formatYear = (value: number | null) => {
    if (value === null) return "?";
    return value < 0 ? `前${Math.abs(value)}` : String(value);
  };
  return `${formatYear(birth)}–${formatYear(death)}`;
}

function demoGraph(sourceState: "demo" | "unavailable" = "demo"): GraphData {
  const nodes: GraphNode[] = [
    { id: "demo-phil-lecture", kind: "lecture", label: "01_なぜ哲学はギリシアで始まったのか", meta: "第1回・受講済", href: null, notionUrl: "#" },
    { id: "demo-phil-philosopher", kind: "philosopher", label: "タレス", meta: "ミレトス学派・自然哲学", href: null, notionUrl: "#" },
    { id: "demo-phil-term", kind: "term", label: "アルケー", meta: "自然哲学・万物の根源", href: null, notionUrl: "#" },
    { id: "demo-phil-problem", kind: "problem", label: "世界の根源は何か", meta: "存在論・自然哲学", href: null, notionUrl: "#" },
    { id: "demo-phil-work", kind: "work", label: "断片・証言", meta: "自然哲学・原典", href: null, notionUrl: "#" },
    { id: "demo-phil-period", kind: "period", label: "古代ギリシア", meta: "前6世紀頃", href: null, notionUrl: "#" },
    { id: "demo-phil-culture", kind: "culture", label: "ギリシア神話", meta: "神話・宗教", href: null, notionUrl: "#" },
    { id: "demo-phil-thought", kind: "thought-note", label: "ミュトスからロゴスへ", meta: "自分の理解を言語化", href: null, notionUrl: "#" },
  ];

  const edges: GraphEdge[] = [
    { id: "demo-phil-1", source: "demo-phil-lecture", target: "demo-phil-philosopher", kind: "lecture-philosopher", label: "哲学者" },
    { id: "demo-phil-2", source: "demo-phil-lecture", target: "demo-phil-term", kind: "lecture-term", label: "用語" },
    { id: "demo-phil-3", source: "demo-phil-lecture", target: "demo-phil-problem", kind: "lecture-problem", label: "哲学的問題" },
    { id: "demo-phil-4", source: "demo-phil-philosopher", target: "demo-phil-work", kind: "philosopher-work", label: "原典・著作" },
    { id: "demo-phil-5", source: "demo-phil-philosopher", target: "demo-phil-period", kind: "philosopher-period", label: "時代" },
    { id: "demo-phil-6", source: "demo-phil-thought", target: "demo-phil-problem", kind: "thought-problem", label: "思考対象" },
  ];

  return {
    projectId: PROJECT_ID,
    mode: "demo",
    scope: { sourceState, anchors: [] },
    nodes,
    edges,
  };
}

export async function getPhilosophyGraph(): Promise<GraphData> {
  const token = getNotionToken();
  if (!token) return demoGraph();

  try {
    const [lectureResults, philosopherResults, termResults, problemResults, workResults, cultureResults, periodResults, thoughtResults] = await Promise.all([
      queryAllDataSource(LECTURES_DATA_SOURCE_ID, token),
      queryAllDataSource(PHILOSOPHERS_DATA_SOURCE_ID, token),
      queryAllDataSource(TERMS_DATA_SOURCE_ID, token),
      queryAllDataSource(PROBLEMS_DATA_SOURCE_ID, token),
      queryAllDataSource(WORKS_DATA_SOURCE_ID, token),
      queryAllDataSource(CULTURE_DATA_SOURCE_ID, token),
      queryAllDataSource(PERIODS_DATA_SOURCE_ID, token),
      queryAllDataSource(THOUGHT_NOTES_DATA_SOURCE_ID, token),
    ]);

    const lectures = asPages(lectureResults);
    const philosophers = asPages(philosopherResults);
    const terms = asPages(termResults);
    const problems = asPages(problemResults);
    const works = asPages(workResults);
    const cultures = asPages(cultureResults);
    const periods = asPages(periodResults);
    const thoughts = asPages(thoughtResults);

    const nodes: GraphNode[] = [
      ...lectures.map((page) => {
        const sequence = number(page.properties["回"]);
        return {
          id: page.id,
          kind: "lecture",
          label: text(page.properties["講義タイトル"]) || "講義",
          meta: joinMeta([
            sequence !== null ? `第${sequence}回` : null,
            status(page.properties["状態"]),
            text(page.properties["本日の問い"]),
          ]),
          href: null,
          notionUrl: page.url,
        };
      }),
      ...philosophers.map((page) => ({
        id: page.id,
        kind: "philosopher",
        label: text(page.properties["哲学者名"]) || "哲学者",
        meta: joinMeta([
          lifespan(number(page.properties["誕生年"]), number(page.properties["死去年"])),
          multiSelect(page.properties["学派"]).slice(0, 2).join("・"),
          multiSelect(page.properties["地域"]).slice(0, 2).join("・"),
          text(page.properties["人物メモ"]),
        ]),
        reviewText: text(page.properties["人物メモ"]),
        href: null,
        notionUrl: page.url,
      })),
      ...terms.map((page) => ({
        id: page.id,
        kind: "term",
        label: text(page.properties["用語"]) || "用語",
        meta: joinMeta([
          multiSelect(page.properties["分野"]).slice(0, 2).join("・"),
          text(page.properties["定義"]),
        ]),
        reviewText: text(page.properties["定義"]),
        href: null,
        notionUrl: page.url,
      })),
      ...problems.map((page) => ({
        id: page.id,
        kind: "problem",
        label: text(page.properties["問題"]) || "哲学的問題",
        meta: joinMeta([
          multiSelect(page.properties["分野"]).slice(0, 2).join("・"),
          text(page.properties["問題の概要"]),
          text(page.properties["現在の理解"]),
        ]),
        reviewText: joinMeta([
          text(page.properties["問題の概要"]),
          text(page.properties["現在の理解"]),
        ]),
        href: null,
        notionUrl: page.url,
      })),
      ...works.map((page) => ({
        id: page.id,
        kind: "work",
        label: text(page.properties["名前"]) || "原典・著作",
        meta: joinMeta([
          text(page.properties["著者"]),
          text(page.properties["年代"]),
          select(page.properties["ジャンル"]),
          select(page.properties["読書優先度"]),
          checkbox(page.properties["読了"]) ? "読了" : null,
        ]),
        // The current Works schema has metadata only; do not treat it as an
        // explanatory Review prompt.
        reviewText: "",
        href: null,
        notionUrl: page.url,
      })),
      ...cultures.map((page) => ({
        id: page.id,
        kind: "culture",
        label: text(page.properties["作品名"]) || "文化",
        meta: joinMeta([
          select(page.properties["種類"]),
          text(page.properties["作者・監督"]),
          text(page.properties["年代"]),
          text(page.properties["コメント"]),
        ]),
        reviewText: text(page.properties["コメント"]),
        href: null,
        notionUrl: page.url,
      })),
      ...periods.map((page) => ({
        id: page.id,
        kind: "period",
        label: text(page.properties["時代"]) || "時代",
        meta: joinMeta([
          text(page.properties["年代"]),
          text(page.properties["特徴"]),
        ]),
        reviewText: text(page.properties["特徴"]),
        href: null,
        notionUrl: page.url,
      })),
      ...thoughts.map((page) => ({
        id: page.id,
        kind: "thought-note",
        label: text(page.properties["タイトル"]) || "思考ノート",
        meta: joinMeta([
          date(page.properties["日付"]),
          text(page.properties["内容"]),
          checkbox(page.properties["後から修正したか"]) ? "後から修正" : null,
        ]),
        reviewText: text(page.properties["内容"]),
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
      for (const id of relations(page.properties["哲学者辞典"])) connect(page.id, id, "lecture-philosopher", "哲学者");
      for (const id of relations(page.properties["📚 用語辞典"])) connect(page.id, id, "lecture-term", "用語");
      for (const id of relations(page.properties["哲学的問題"])) connect(page.id, id, "lecture-problem", "哲学的問題");
      for (const id of relations(page.properties["📜 原典・著作"])) connect(page.id, id, "lecture-work", "原典・著作");
      for (const id of relations(page.properties["文化"])) connect(page.id, id, "lecture-culture", "文化");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "lecture-period", "時代");
    }

    for (const page of philosophers) {
      for (const id of relations(page.properties["📚 用語辞典"])) connect(page.id, id, "philosopher-term", "関連用語");
      for (const id of relations(page.properties["📜 原典・著作"])) connect(page.id, id, "philosopher-work", "原典・著作");
      for (const id of relations(page.properties["哲学的問題"])) connect(page.id, id, "philosopher-problem", "哲学的問題");
      for (const id of relations(page.properties["文化"])) connect(page.id, id, "philosopher-culture", "文化");
      for (const id of relations(page.properties["時代"])) connect(page.id, id, "philosopher-period", "時代");
      for (const id of relations(page.properties["師 "])) connect(page.id, id, "philosopher-teacher", "師");
      for (const id of relations(page.properties["影響を受けた人物 "])) connect(page.id, id, "philosopher-influence", "影響を受けた人物");
    }

    for (const page of terms) {
      for (const id of relations(page.properties["哲学的問題"])) connect(page.id, id, "term-problem", "哲学的問題");
      for (const id of relations(page.properties["文化"])) connect(page.id, id, "term-culture", "文化");
    }

    for (const page of problems) {
      for (const id of relations(page.properties["📜 原典・著作"])) connect(page.id, id, "problem-work", "原典・著作");
    }

    for (const page of thoughts) {
      for (const id of relations(page.properties["📕 講義"])) connect(page.id, id, "thought-lecture", "講義");
      for (const id of relations(page.properties["❓ 哲学的問題"])) connect(page.id, id, "thought-problem", "哲学的問題");
    }

    const scopeAnchors = lectures.map((page) => {
      const lectureStatus = status(page.properties["状態"]);
      const completion = lectureStatus === "受講済" || lectureStatus === "復習済"
        ? "completed" as const
        : lectureStatus === "未受講"
          ? "incomplete" as const
          : "unknown" as const;
      return {
        id: page.id,
        completion,
        date: null,
        directRelations: edges
          .filter((edge) => edge.source === page.id)
          .map((edge) => ({ nodeId: edge.target, kind: edge.kind })),
      };
    });

    return {
      projectId: PROJECT_ID,
      mode: "notion",
      scope: { sourceState: "ready", anchors: scopeAnchors },
      nodes,
      edges,
    };
  } catch (error) {
    console.error("Study Graph: Philosophy Graph sync failed", error);
    return demoGraph("unavailable");
  }
}
