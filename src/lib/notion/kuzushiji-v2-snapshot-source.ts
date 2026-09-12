import type { Character, Lecture, Mistake } from "./kuzushiji.ts";
import { buildKuzushijiReviewQueue } from "./kuzushiji-snapshot-source.ts";
import type { KuzushijiExpression, KuzushijiSource } from "./kuzushiji-reference.ts";
import {
  assertUniqueProjectPages,
  collectStrictRelationObservations,
  getStrictNotionToken,
  materializeStrictDirectionalRelations,
  queryAllNotionDataSource,
  readNotionCheckbox,
  readNotionDate,
  readNotionMultiSelect,
  readNotionNumber,
  readNotionSelect,
  readNotionText,
  readNotionUrl,
  StrictNotionSnapshotSourceError,
  type StrictNotionPage,
  type StrictNotionRelationDeclaration,
} from "./strict-snapshot-source.ts";
import {
  KUZUSHIJI_V2_SOURCE_IDENTIFIERS,
  type KuzushijiV2Projection,
} from "../projects/project-projections.ts";

/** The exact five Notion data sources observed by Kuzushiji v2. */
export const KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS = Object.freeze({
  lectures: "1da45577-aa7d-44e1-a304-9e33e5feb9e2",
  characters: "4a9814ba-7c44-47ec-8c46-e5d558a62085",
  mistakes: "12c37554-c7fa-424f-9590-f2f756bf284a",
  sources: "a8a2de24-00d8-44cc-9721-a7382b17ee98",
  expressions: "e8b4669f-41a6-4c59-9876-4e44976a7e33",
} as const);

export const KUZUSHIJI_V2_SNAPSHOT_SOURCE_IDENTIFIERS = Object.freeze(
  Object.values(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS).map((id) => `notion:data-source:${id}`),
);

const LABEL = "Kuzushiji v2 snapshot";

/** The six directional relations in the existing Kuzushiji Graph. */
export const KUZUSHIJI_V2_RELATION_DECLARATIONS: readonly StrictNotionRelationDeclaration[] = Object.freeze([
  { ownerKind: "lecture", propertyName: "重要・弱点字", relationKind: "lecture-character", relationLabel: "重要・弱点字" },
  { ownerKind: "lecture", propertyName: "誤読記録", relationKind: "lecture-mistake", relationLabel: "誤読記録" },
  { ownerKind: "lecture", propertyName: "使用資料", relationKind: "lecture-source", relationLabel: "使用資料" },
  { ownerKind: "lecture", propertyName: "頻出表現", relationKind: "lecture-expression", relationLabel: "頻出表現" },
  { ownerKind: "mistake", propertyName: "関連文字", relationKind: "mistake-character", relationLabel: "関連文字" },
  { ownerKind: "mistake", propertyName: "関連資料", relationKind: "mistake-source", relationLabel: "関連資料" },
] as const);

export type KuzushijiV2SnapshotSource = Readonly<{
  projection: KuzushijiV2Projection;
  sourceIdentifiers: readonly string[];
  paginationComplete: true;
  relationCompleteness: true;
}>;

function requiredProperty(page: StrictNotionPage, propertyName: string, label: string) {
  if (!Object.prototype.hasOwnProperty.call(page.properties, propertyName)) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} property ${propertyName} is missing on ${page.id}`);
  }
}

function text(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionText(page, propertyName, label);
}

function number(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionNumber(page, propertyName, label);
}

function select(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionSelect(page, propertyName, label);
}

function date(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionDate(page, propertyName, label);
}

function checkbox(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionCheckbox(page, propertyName, label);
}

function url(page: StrictNotionPage, propertyName: string, label: string) {
  requiredProperty(page, propertyName, label);
  return readNotionUrl(page, propertyName, label);
}

function compare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byId<T extends { id: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => compare(left.id, right.id));
}

function bySequence<T extends { id: string; sequence: number }>(items: readonly T[]) {
  return [...items].sort((left, right) => left.sequence - right.sequence || compare(left.id, right.id));
}

function mapLecture(page: StrictNotionPage): Lecture {
  return {
    id: page.id,
    url: page.url,
    title: text(page, "講義名", `${LABEL} lecture`),
    sequence: number(page, "回次", `${LABEL} lecture`) ?? 0,
    theme: text(page, "学習テーマ", `${LABEL} lecture`),
    status: select(page, "状態", `${LABEL} lecture`),
    completedAt: date(page, "実施日", `${LABEL} lecture`),
    reviewAccuracy: number(page, "復習正答率", `${LABEL} lecture`),
    newCharactersCount: number(page, "新規字数", `${LABEL} lecture`),
  };
}

function mapCharacter(page: StrictNotionPage): Character {
  return {
    id: page.id,
    url: page.url,
    glyph: text(page, "文字", `${LABEL} character`),
    reading: text(page, "読み", `${LABEL} character`),
    mother: text(page, "字母", `${LABEL} character`),
    category: select(page, "分類", `${LABEL} character`),
    mastery: select(page, "習得状態", `${LABEL} character`),
    importance: select(page, "重要度", `${LABEL} character`),
    errorCount: number(page, "誤読回数", `${LABEL} character`) ?? 0,
    lastReviewedAt: date(page, "最終復習日", `${LABEL} character`),
  };
}

function mapMistake(page: StrictNotionPage): Mistake {
  return {
    id: page.id,
    url: page.url,
    title: text(page, "誤読項目", `${LABEL} mistake`),
    answer: text(page, "自分の回答", `${LABEL} mistake`),
    correctAnswer: text(page, "正解", `${LABEL} mistake`),
    cause: select(page, "原因", `${LABEL} mistake`),
    retry: checkbox(page, "再出題", `${LABEL} mistake`),
    resolved: checkbox(page, "克服済み", `${LABEL} mistake`),
    errorDate: date(page, "誤読日", `${LABEL} mistake`),
  };
}

function mapSource(page: StrictNotionPage): KuzushijiSource {
  return {
    id: page.id,
    url: page.url,
    title: text(page, "資料名", `${LABEL} source`),
    usage: select(page, "用途", `${LABEL} source`),
    materialType: select(page, "資料種別", `${LABEL} source`),
    difficulty: select(page, "難易度", `${LABEL} source`),
    period: text(page, "時代", `${LABEL} source`),
    era: text(page, "年代", `${LABEL} source`),
    institution: text(page, "所蔵機関", `${LABEL} source`),
    referenceUrl: url(page, "参照URL", `${LABEL} source`),
    readingAccuracy: number(page, "読解率", `${LABEL} source`),
    weakPoint: text(page, "苦手ポイント", `${LABEL} source`),
  };
}

function mapExpression(page: StrictNotionPage): KuzushijiExpression {
  return {
    id: page.id,
    url: page.url,
    expression: text(page, "表現", `${LABEL} expression`),
    reading: text(page, "読み", `${LABEL} expression`),
    category: select(page, "分類", `${LABEL} expression`),
    meaning: text(page, "意味", `${LABEL} expression`),
    example: text(page, "用例", `${LABEL} expression`),
    notes: text(page, "注意点", `${LABEL} expression`),
    mastery: select(page, "習得状態", `${LABEL} expression`),
    importance: select(page, "重要度", `${LABEL} expression`),
  };
}

/**
 * Read all five Kuzushiji v2 sources with strict pagination and relation
 * property reads.  There is intentionally no demo or partial-result path.
 */
export async function readKuzushijiV2SnapshotSource(): Promise<KuzushijiV2SnapshotSource> {
  const token = getStrictNotionToken();
  const entries = await Promise.all([
    queryAllNotionDataSource(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.lectures, token, `${LABEL} lectures`),
    queryAllNotionDataSource(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.characters, token, `${LABEL} characters`),
    queryAllNotionDataSource(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.mistakes, token, `${LABEL} mistakes`),
    queryAllNotionDataSource(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.sources, token, `${LABEL} sources`),
    queryAllNotionDataSource(KUZUSHIJI_V2_SNAPSHOT_DATA_SOURCE_IDS.expressions, token, `${LABEL} expressions`),
  ]);
  const [lecturePages, characterPages, mistakePages, sourcePages, expressionPages] = entries;
  assertUniqueProjectPages(entries.flat(), LABEL);

  const lectures = bySequence(lecturePages.map(mapLecture));
  const characters = byId(characterPages.map(mapCharacter));
  const mistakes = byId(mistakePages.map(mapMistake));
  const sources = byId(sourcePages.map(mapSource));
  const expressions = byId(expressionPages.map(mapExpression));

  const relationRead = await collectStrictRelationObservations(
    [
      ...lecturePages.map((page) => ({ page, kind: "lecture" })),
      ...mistakePages.map((page) => ({ page, kind: "mistake" })),
    ],
    KUZUSHIJI_V2_RELATION_DECLARATIONS,
    token,
    LABEL,
    // v2 must detect duplicate directional relation identities rather than
    // silently deduplicating them as the legacy Graph reader did.
    { preserveDuplicateTargets: true },
  );
  const nodeIds = new Set(entries.flat().map((page) => page.id));
  const relations = materializeStrictDirectionalRelations(relationRead.observations, nodeIds, LABEL);
  const relationProperties = [...relationRead.evidence].sort((left, right) => {
    const leftKey = `${left.ownerKind}\u0000${left.sourceEntityId}\u0000${left.propertyName}\u0000${left.relationKind}`;
    const rightKey = `${right.ownerKind}\u0000${right.sourceEntityId}\u0000${right.propertyName}\u0000${right.relationKind}`;
    return compare(leftKey, rightKey);
  });
  const dataSources = entries.map((pages, index) => ({
    sourceIdentifier: KUZUSHIJI_V2_SOURCE_IDENTIFIERS[index]!,
    itemCount: pages.length,
    paginationComplete: true as const,
  })).sort((left, right) => compare(left.sourceIdentifier, right.sourceIdentifier));

  return {
    sourceIdentifiers: [...KUZUSHIJI_V2_SOURCE_IDENTIFIERS].sort(compare),
    paginationComplete: true,
    relationCompleteness: true,
    projection: {
      lectures,
      characters,
      mistakes,
      sources,
      expressions,
      reviewQueue: buildKuzushijiReviewQueue(characters, mistakes),
      relations,
      completeness: {
        dataSources,
        relationProperties,
        unresolvedTargets: [],
      },
    },
  };
}
