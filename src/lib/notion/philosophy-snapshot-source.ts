import type {
  PhilosophyCulture,
  PhilosophyLecture,
  PhilosophyPeriod,
  PhilosophyPhilosopher,
  PhilosophyProblem,
  PhilosophyTerm,
  PhilosophyThoughtNote,
  PhilosophyV1Projection,
  PhilosophyWork,
} from "../projects/project-projections.ts";
import {
  assertUniqueProjectPages,
  collectStrictRelationObservations,
  getStrictNotionToken,
  materializeStrictRelations,
  queryAllNotionDataSource,
  readNotionCheckbox,
  readNotionDate,
  readNotionMultiSelect,
  readNotionNumber,
  readNotionSelect,
  readNotionText,
  requiredNotionText,
  type StrictNotionPage,
  type StrictNotionRelationDeclaration,
} from "./strict-snapshot-source.ts";

export const PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS = Object.freeze({
  lectures: "3b0d2793-4134-80d7-8954-000b3aa060ba",
  philosophers: "3b0d2793-4134-80df-b566-000b80f95459",
  terms: "3b0d2793-4134-8016-8c60-000b7db6e6e4",
  problems: "3b0d2793-4134-8031-a01f-000b42870256",
  works: "3b0d2793-4134-805a-bdac-000be654ba52",
  culture: "3b0d2793-4134-803b-ab80-000b2027ee6f",
  periods: "3b0d2793-4134-8045-9310-000b9ba38815",
  thoughtNotes: "3b0d2793-4134-805f-a073-000b51172a4e",
});

export const PHILOSOPHY_SNAPSHOT_SOURCE_IDENTIFIERS = Object.freeze(
  Object.values(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS).map((id) => `notion:data-source:${id}`),
);

const LABEL = "Western Philosophy snapshot";

const PHILOSOPHY_RELATIONS: readonly StrictNotionRelationDeclaration[] = [
  { ownerKind: "lecture", propertyName: "哲学者辞典", relationKind: "lecture-philosopher", relationLabel: "哲学者" },
  { ownerKind: "lecture", propertyName: "📚 用語辞典", relationKind: "lecture-term", relationLabel: "用語" },
  { ownerKind: "lecture", propertyName: "哲学的問題", relationKind: "lecture-problem", relationLabel: "哲学的問題" },
  { ownerKind: "lecture", propertyName: "📜 原典・著作", relationKind: "lecture-work", relationLabel: "原典・著作" },
  { ownerKind: "lecture", propertyName: "文化", relationKind: "lecture-culture", relationLabel: "文化" },
  { ownerKind: "lecture", propertyName: "時代", relationKind: "lecture-period", relationLabel: "時代" },
  { ownerKind: "philosopher", propertyName: "📚 用語辞典", relationKind: "philosopher-term", relationLabel: "関連用語" },
  { ownerKind: "philosopher", propertyName: "📜 原典・著作", relationKind: "philosopher-work", relationLabel: "原典・著作" },
  { ownerKind: "philosopher", propertyName: "哲学的問題", relationKind: "philosopher-problem", relationLabel: "哲学的問題" },
  { ownerKind: "philosopher", propertyName: "文化", relationKind: "philosopher-culture", relationLabel: "文化" },
  { ownerKind: "philosopher", propertyName: "時代", relationKind: "philosopher-period", relationLabel: "時代" },
  { ownerKind: "philosopher", propertyName: "師 ", relationKind: "philosopher-teacher", relationLabel: "師" },
  { ownerKind: "philosopher", propertyName: "影響を受けた人物 ", relationKind: "philosopher-influence", relationLabel: "影響を受けた人物" },
  { ownerKind: "term", propertyName: "哲学的問題", relationKind: "term-problem", relationLabel: "哲学的問題" },
  { ownerKind: "term", propertyName: "文化", relationKind: "term-culture", relationLabel: "文化" },
  { ownerKind: "problem", propertyName: "📜 原典・著作", relationKind: "problem-work", relationLabel: "原典・著作" },
  { ownerKind: "thought-note", propertyName: "📕 講義", relationKind: "thought-lecture", relationLabel: "講義" },
  { ownerKind: "thought-note", propertyName: "❓ 哲学的問題", relationKind: "thought-problem", relationLabel: "哲学的問題" },
];

export type PhilosophySnapshotSource = Readonly<{
  projection: PhilosophyV1Projection;
  sourceIdentifiers: readonly string[];
  paginationComplete: true;
  relationCompleteness: true;
}>;

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byId<T extends { id: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => compare(left.id, right.id));
}

function bySequence<T extends { id: string; sequence: number | null }>(items: readonly T[]) {
  return [...items].sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || compare(left.id, right.id));
}

function join(values: readonly string[]) {
  return values.filter((value) => value.trim().length > 0).join("・");
}

function lifespan(birth: number | null, death: number | null) {
  if (birth === null && death === null) return "";
  const year = (value: number | null) => value === null ? "?" : value < 0 ? `前${Math.abs(value)}` : String(value);
  return `${year(birth)}–${year(death)}`;
}

function pageLabel(page: StrictNotionPage, propertyName: string, kind: string) {
  return requiredNotionText(page, propertyName, `${LABEL} ${kind}`);
}

function mapLecture(page: StrictNotionPage): PhilosophyLecture {
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "講義タイトル", "lecture"),
    sequence: readNotionNumber(page, "回", `${LABEL} lecture`),
    status: readNotionSelect(page, "状態", `${LABEL} lecture`),
    question: readNotionText(page, "本日の問い", `${LABEL} lecture`),
    reviewText: null,
  };
}

function mapPhilosopher(page: StrictNotionPage): PhilosophyPhilosopher {
  const memo = readNotionText(page, "人物メモ", `${LABEL} philosopher`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "哲学者名", "philosopher"),
    lifespan: lifespan(readNotionNumber(page, "誕生年", `${LABEL} philosopher`), readNotionNumber(page, "死去年", `${LABEL} philosopher`)),
    schools: readNotionMultiSelect(page, "学派", `${LABEL} philosopher`),
    regions: readNotionMultiSelect(page, "地域", `${LABEL} philosopher`),
    memo,
    reviewText: memo || null,
  };
}

function mapTerm(page: StrictNotionPage): PhilosophyTerm {
  const definition = readNotionText(page, "定義", `${LABEL} term`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "用語", "term"),
    fields: readNotionMultiSelect(page, "分野", `${LABEL} term`),
    definition,
    reviewText: definition || null,
  };
}

function mapProblem(page: StrictNotionPage): PhilosophyProblem {
  const overview = readNotionText(page, "問題の概要", `${LABEL} problem`);
  const currentUnderstanding = readNotionText(page, "現在の理解", `${LABEL} problem`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "問題", "problem"),
    fields: readNotionMultiSelect(page, "分野", `${LABEL} problem`),
    overview,
    currentUnderstanding,
    reviewText: join([overview, currentUnderstanding]) || null,
  };
}

function mapWork(page: StrictNotionPage): PhilosophyWork {
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "名前", "work"),
    author: readNotionText(page, "著者", `${LABEL} work`),
    years: readNotionText(page, "年代", `${LABEL} work`),
    genre: readNotionSelect(page, "ジャンル", `${LABEL} work`),
    priority: readNotionSelect(page, "読書優先度", `${LABEL} work`),
    completed: readNotionCheckbox(page, "読了", `${LABEL} work`),
    reviewText: null,
  };
}

function mapCulture(page: StrictNotionPage): PhilosophyCulture {
  const comment = readNotionText(page, "コメント", `${LABEL} culture`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "作品名", "culture"),
    type: readNotionSelect(page, "種類", `${LABEL} culture`),
    authorOrDirector: readNotionText(page, "作者・監督", `${LABEL} culture`),
    years: readNotionText(page, "年代", `${LABEL} culture`),
    comment,
    reviewText: comment || null,
  };
}

function mapPeriod(page: StrictNotionPage): PhilosophyPeriod {
  const features = readNotionText(page, "特徴", `${LABEL} period`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "時代", "period"),
    years: readNotionText(page, "年代", `${LABEL} period`),
    features,
    reviewText: features || null,
  };
}

function mapThoughtNote(page: StrictNotionPage): PhilosophyThoughtNote {
  const content = readNotionText(page, "内容", `${LABEL} thought-note`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "タイトル", "thought-note"),
    date: readNotionDate(page, "日付", `${LABEL} thought-note`),
    content,
    corrected: readNotionCheckbox(page, "後から修正したか", `${LABEL} thought-note`),
    reviewText: content || null,
  };
}

/** Strict Philosophy source used only by the snapshot publisher. */
export async function readPhilosophySnapshotSource(): Promise<PhilosophySnapshotSource> {
  const token = getStrictNotionToken();
  const entries = await Promise.all([
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.lectures, token, `${LABEL} lectures`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.philosophers, token, `${LABEL} philosophers`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.terms, token, `${LABEL} terms`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.problems, token, `${LABEL} problems`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.works, token, `${LABEL} works`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.culture, token, `${LABEL} culture`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.periods, token, `${LABEL} periods`),
    queryAllNotionDataSource(PHILOSOPHY_SNAPSHOT_DATA_SOURCE_IDS.thoughtNotes, token, `${LABEL} thought notes`),
  ]);
  const [lecturePages, philosopherPages, termPages, problemPages, workPages, culturePages, periodPages, thoughtNotePages] = entries;
  const allPages = entries.flat();
  assertUniqueProjectPages(allPages, LABEL);

  const lectures = bySequence(lecturePages.map(mapLecture));
  const philosophers = byId(philosopherPages.map(mapPhilosopher));
  const terms = byId(termPages.map(mapTerm));
  const problems = byId(problemPages.map(mapProblem));
  const works = byId(workPages.map(mapWork));
  const culture = byId(culturePages.map(mapCulture));
  const periods = byId(periodPages.map(mapPeriod));
  const thoughtNotes = byId(thoughtNotePages.map(mapThoughtNote));

  const pagesByKind = [
    ...lecturePages.map((page) => ({ page, kind: "lecture" })),
    ...philosopherPages.map((page) => ({ page, kind: "philosopher" })),
    ...termPages.map((page) => ({ page, kind: "term" })),
    ...problemPages.map((page) => ({ page, kind: "problem" })),
    ...workPages.map((page) => ({ page, kind: "work" })),
    ...culturePages.map((page) => ({ page, kind: "culture" })),
    ...periodPages.map((page) => ({ page, kind: "period" })),
    ...thoughtNotePages.map((page) => ({ page, kind: "thought-note" })),
  ];
  const relationRead = await collectStrictRelationObservations(pagesByKind, PHILOSOPHY_RELATIONS, token, LABEL);
  const relations = materializeStrictRelations(relationRead.observations, new Set(allPages.map((page) => page.id)), LABEL);

  return {
    sourceIdentifiers: [...PHILOSOPHY_SNAPSHOT_SOURCE_IDENTIFIERS].sort(compare),
    paginationComplete: true,
    relationCompleteness: true,
    projection: {
      lectures,
      philosophers,
      terms,
      problems,
      works,
      culture,
      periods,
      thoughtNotes,
      relations,
      completeness: {
        dataSources: entries.map((pages, index) => ({
          sourceIdentifier: PHILOSOPHY_SNAPSHOT_SOURCE_IDENTIFIERS[index]!,
          itemCount: pages.length,
          paginationComplete: true as const,
        })).sort((left, right) => compare(left.sourceIdentifier, right.sourceIdentifier)),
        relationProperties: relationRead.evidence
          .sort((left, right) => compare(
            `${left.ownerKind}:${left.propertyName}:${left.relationKind}`,
            `${right.ownerKind}:${right.propertyName}:${right.relationKind}`,
          )),
        unresolvedTargets: [],
      },
    },
  };
}

export const PHILOSOPHY_RELATION_DECLARATIONS = PHILOSOPHY_RELATIONS;
