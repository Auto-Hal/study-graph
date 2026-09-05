const LECTURES_DATA_SOURCE_ID = "1da45577-aa7d-44e1-a304-9e33e5feb9e2";
const CHARACTERS_DATA_SOURCE_ID = "4a9814ba-7c44-47ec-8c46-e5d558a62085";
const MISTAKES_DATA_SOURCE_ID = "12c37554-c7fa-424f-9590-f2f756bf284a";
const NOTION_API_VERSION = "2026-03-11";

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  number?: number | null;
  select?: { name?: string } | null;
  date?: { start?: string } | null;
  checkbox?: boolean;
};

type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

type NotionQueryResponse = { results?: unknown[] };

export type Lecture = {
  id: string;
  url: string;
  title: string;
  sequence: number;
  theme: string;
  status: string;
  completedAt: string | null;
  reviewAccuracy: number | null;
  newCharactersCount: number | null;
};

export type Character = {
  id: string;
  url: string;
  glyph: string;
  reading: string;
  category: string;
  mastery: string;
  importance: string;
  errorCount: number;
  lastReviewedAt: string | null;
};

export type Mistake = {
  id: string;
  url: string;
  title: string;
  answer: string;
  correctAnswer: string;
  cause: string;
  retry: boolean;
  resolved: boolean;
  errorDate: string | null;
};

export type ReviewItem = {
  id: string;
  kind: "character" | "mistake";
  label: string;
  reason: string;
};

export type KuzushijiDashboard = {
  mode: "notion" | "demo";
  lectures: Lecture[];
  characters: Character[];
  mistakes: Mistake[];
  reviewQueue: ReviewItem[];
};

function getNotionToken() {
  return process.env.NOTION_TOKEN ?? process.env.StudyGraph_NOTION_TOKEN ?? null;
}

async function queryDataSource(dataSourceId: string, token: string): Promise<NotionQueryResponse> {
  const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 100 }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion query failed (${response.status}): ${body}`);
  }

  return (await response.json()) as NotionQueryResponse;
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

function date(property?: NotionProperty) {
  return property?.date?.start ?? null;
}

function checkbox(property?: NotionProperty) {
  return property?.checkbox ?? false;
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

function demoData(): KuzushijiDashboard {
  return {
    mode: "demo",
    lectures: [
      {
        id: "demo-lecture-1",
        url: "#",
        title: "01_くずし字を「読む」とは何か",
        sequence: 1,
        theme: "字形・語・文法・文脈を往復する読み方",
        status: "完了",
        completedAt: "2026-08-31",
        reviewAccuracy: null,
        newCharactersCount: 3,
      },
    ],
    characters: [
      {
        id: "demo-a",
        url: "#",
        glyph: "あ",
        reading: "あ",
        category: "変体仮名",
        mastery: "学習中",
        importance: "A",
        errorCount: 1,
        lastReviewedAt: null,
      },
      {
        id: "demo-i",
        url: "#",
        glyph: "い",
        reading: "い",
        category: "変体仮名",
        mastery: "学習中",
        importance: "A",
        errorCount: 0,
        lastReviewedAt: null,
      },
      {
        id: "demo-u",
        url: "#",
        glyph: "う",
        reading: "う",
        category: "変体仮名",
        mastery: "学習中",
        importance: "A",
        errorCount: 0,
        lastReviewedAt: null,
      },
    ],
    mistakes: [],
    reviewQueue: [
      {
        id: "demo-a",
        kind: "character",
        label: "あ ← 安",
        reason: "学習中・重要度A",
      },
    ],
  };
}

export async function getKuzushijiDashboard(): Promise<KuzushijiDashboard> {
  const token = getNotionToken();
  if (!token) return demoData();

  try {
    const [lecturesResponse, charactersResponse, mistakesResponse] = await Promise.all([
      queryDataSource(LECTURES_DATA_SOURCE_ID, token),
      queryDataSource(CHARACTERS_DATA_SOURCE_ID, token),
      queryDataSource(MISTAKES_DATA_SOURCE_ID, token),
    ]);

    const lectures = asPages(lecturesResponse.results).map((page) => ({
      id: page.id,
      url: page.url,
      title: text(page.properties["講義名"]),
      sequence: number(page.properties["回次"]) ?? 0,
      theme: text(page.properties["学習テーマ"]),
      status: select(page.properties["状態"]),
      completedAt: date(page.properties["実施日"]),
      reviewAccuracy: number(page.properties["復習正答率"]),
      newCharactersCount: number(page.properties["新規字数"]),
    }));
    lectures.sort((a, b) => a.sequence - b.sequence);

    const characters = asPages(charactersResponse.results).map((page) => ({
      id: page.id,
      url: page.url,
      glyph: text(page.properties["文字"]),
      reading: text(page.properties["読み"]),
      category: select(page.properties["分類"]),
      mastery: select(page.properties["習得状態"]),
      importance: select(page.properties["重要度"]),
      errorCount: number(page.properties["誤読回数"]) ?? 0,
      lastReviewedAt: date(page.properties["最終復習日"]),
    }));

    const mistakes = asPages(mistakesResponse.results).map((page) => ({
      id: page.id,
      url: page.url,
      title: text(page.properties["誤読項目"]),
      answer: text(page.properties["自分の回答"]),
      correctAnswer: text(page.properties["正解"]),
      cause: select(page.properties["原因"]),
      retry: checkbox(page.properties["再出題"]),
      resolved: checkbox(page.properties["克服済み"]),
      errorDate: date(page.properties["誤読日"]),
    }));

    const retryMistakes: ReviewItem[] = mistakes
      .filter((item) => item.retry && !item.resolved)
      .map((item) => ({
        id: item.id,
        kind: "mistake",
        label: item.title || item.correctAnswer || "誤読記録",
        reason: item.cause || "再出題対象",
      }));

    const weakCharacters: ReviewItem[] = characters
      .filter((item) => item.mastery !== "即読")
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        kind: "character",
        label: item.glyph || item.reading || "文字",
        reason: [item.mastery, item.importance ? `重要度${item.importance}` : ""]
          .filter(Boolean)
          .join("・"),
      }));

    return {
      mode: "notion",
      lectures,
      characters,
      mistakes,
      reviewQueue: [...retryMistakes, ...weakCharacters].slice(0, 12),
    };
  } catch (error) {
    console.error("Study Graph: Notion sync failed", error);
    return demoData();
  }
}
