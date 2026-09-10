import type {
  WesternArtHistoryArtist,
  WesternArtHistoryArtwork,
  WesternArtHistoryCulture,
  WesternArtHistoryLecture,
  WesternArtHistoryMovement,
  WesternArtHistoryMuseum,
  WesternArtHistoryPeriod,
  WesternArtHistoryTerm,
  WesternArtHistoryV1Projection,
} from "../projects/project-projections.ts";
import {
  assertUniqueProjectPages,
  collectStrictRelationObservations,
  getStrictNotionToken,
  materializeStrictRelations,
  queryAllNotionDataSource,
  readNotionMultiSelect,
  readNotionNumber,
  readNotionSelect,
  readNotionText,
  requiredNotionText,
  type StrictNotionPage,
  type StrictNotionRelationDeclaration,
} from "./strict-snapshot-source.ts";

export const WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS = Object.freeze({
  lectures: "3b1d2793-4134-80a1-bb5f-000bf3dd62b7",
  artists: "3b1d2793-4134-8090-86a7-000b8fe1f74b",
  artworks: "3b1d2793-4134-80a5-b3ce-000b80fc800c",
  movements: "3b1d2793-4134-8015-ac11-000b9e72e127",
  terms: "3b1d2793-4134-80e1-b185-000bd0cddaf9",
  periods: "3b1d2793-4134-8088-8422-000b6fb72ad7",
  culture: "3b1d2793-4134-8044-a522-000b5cad80d8",
  museums: "3b1d2793-4134-80da-9a6f-000bac184fa7",
});

export const WESTERN_ART_HISTORY_SNAPSHOT_SOURCE_IDENTIFIERS = Object.freeze(
  Object.values(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS).map((id) => `notion:data-source:${id}`),
);

const LABEL = "Western Art History snapshot";

const ART_RELATION_DECLARATIONS: readonly StrictNotionRelationDeclaration[] = [
  { ownerKind: "lecture", propertyName: "芸術家", relationKind: "lecture-artist", relationLabel: "関連芸術家" },
  { ownerKind: "lecture", propertyName: "作品", relationKind: "lecture-artwork", relationLabel: "関連作品" },
  { ownerKind: "lecture", propertyName: "様式・運動", relationKind: "lecture-movement", relationLabel: "関連様式" },
  { ownerKind: "lecture", propertyName: "用語", relationKind: "lecture-term", relationLabel: "関連用語" },
  { ownerKind: "lecture", propertyName: "時代", relationKind: "lecture-period", relationLabel: "関連時代" },
  { ownerKind: "lecture", propertyName: "文化・歴史", relationKind: "lecture-culture", relationLabel: "文化・歴史" },
  { ownerKind: "lecture", propertyName: "美術館・建築", relationKind: "lecture-museum", relationLabel: "美術館・建築" },
  { ownerKind: "artwork", propertyName: "作者", relationKind: "artwork-artist", relationLabel: "作者" },
  { ownerKind: "artwork", propertyName: "様式・運動", relationKind: "artwork-movement", relationLabel: "様式・運動" },
  { ownerKind: "artwork", propertyName: "時代", relationKind: "artwork-period", relationLabel: "時代" },
  { ownerKind: "artwork", propertyName: "所蔵先", relationKind: "artwork-museum", relationLabel: "所蔵先" },
  { ownerKind: "artist", propertyName: "様式・運動", relationKind: "artist-movement", relationLabel: "様式・運動" },
  { ownerKind: "artist", propertyName: "時代", relationKind: "artist-period", relationLabel: "時代" },
  { ownerKind: "artist", propertyName: "影響を受けた人物", relationKind: "artist-influence", relationLabel: "影響を受けた人物" },
  { ownerKind: "movement", propertyName: "時代", relationKind: "movement-period", relationLabel: "時代" },
  { ownerKind: "movement", propertyName: "次の様式・運動", relationKind: "movement-sequence", relationLabel: "次の様式・運動" },
  { ownerKind: "term", propertyName: "関連作品", relationKind: "term-artwork", relationLabel: "関連作品" },
  { ownerKind: "term", propertyName: "関連芸術家", relationKind: "term-artist", relationLabel: "関連芸術家" },
  { ownerKind: "term", propertyName: "関連様式・運動", relationKind: "term-movement", relationLabel: "関連様式" },
  { ownerKind: "term", propertyName: "時代", relationKind: "term-period", relationLabel: "関連時代" },
  { ownerKind: "period", propertyName: "次の時代", relationKind: "period-sequence", relationLabel: "次の時代" },
  { ownerKind: "period", propertyName: "文化・歴史", relationKind: "period-culture", relationLabel: "文化・歴史" },
  { ownerKind: "culture", propertyName: "関連作品", relationKind: "culture-artwork", relationLabel: "関連作品" },
  { ownerKind: "culture", propertyName: "関連様式・運動", relationKind: "culture-movement", relationLabel: "関連様式" },
  { ownerKind: "museum", propertyName: "建築様式", relationKind: "museum-movement", relationLabel: "建築様式" },
];

export type WesternArtHistorySnapshotSource = Readonly<{
  projection: WesternArtHistoryV1Projection;
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

function pageLabel(page: StrictNotionPage, propertyName: string, kind: string) {
  return requiredNotionText(page, propertyName, `${LABEL} ${kind}`);
}

function mapLecture(page: StrictNotionPage): WesternArtHistoryLecture {
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "講義名", "lecture"),
    sequence: readNotionNumber(page, "回数", `${LABEL} lecture`),
    phase: readNotionSelect(page, "フェーズ", `${LABEL} lecture`),
    status: readNotionSelect(page, "理解度", `${LABEL} lecture`),
    theme: readNotionText(page, "テーマ", `${LABEL} lecture`),
    reviewText: null,
  };
}

function mapArtist(page: StrictNotionPage): WesternArtHistoryArtist {
  const technique = readNotionText(page, "技法・特徴", `${LABEL} artist`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "名前", "artist"),
    lifespan: readNotionText(page, "生没年", `${LABEL} artist`),
    region: readNotionSelect(page, "国・地域", `${LABEL} artist`),
    importance: readNotionSelect(page, "重要度", `${LABEL} artist`),
    technique,
    reviewText: technique || null,
  };
}

function mapArtwork(page: StrictNotionPage): WesternArtHistoryArtwork {
  const subjects = readNotionMultiSelect(page, "主題", `${LABEL} artwork`).sort(compare);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "作品名", "artwork"),
    productionYear: readNotionText(page, "制作年", `${LABEL} artwork`),
    genre: readNotionSelect(page, "ジャンル", `${LABEL} artwork`),
    country: readNotionSelect(page, "国", `${LABEL} artwork`),
    importance: readNotionSelect(page, "重要度", `${LABEL} artwork`),
    subjects,
    reviewText: subjects.length > 0 ? join(subjects.slice(0, 2)) : null,
  };
}

function mapMovement(page: StrictNotionPage): WesternArtHistoryMovement {
  const features = readNotionText(page, "特徴", `${LABEL} movement`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "名称", "movement"),
    region: readNotionSelect(page, "地域", `${LABEL} movement`),
    importance: readNotionSelect(page, "重要度", `${LABEL} movement`),
    features,
    reviewText: features || null,
  };
}

function mapTerm(page: StrictNotionPage): WesternArtHistoryTerm {
  const meaning = readNotionText(page, "意味", `${LABEL} term`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "用語", "term"),
    category: readNotionSelect(page, "分類", `${LABEL} term`),
    importance: readNotionSelect(page, "重要度", `${LABEL} term`),
    meaning,
    reviewText: meaning || null,
  };
}

function mapPeriod(page: StrictNotionPage): WesternArtHistoryPeriod {
  const features = readNotionText(page, "特徴", `${LABEL} period`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "時代名", "period"),
    years: readNotionText(page, "年代", `${LABEL} period`),
    region: readNotionSelect(page, "地域", `${LABEL} period`),
    features,
    reviewText: features || null,
  };
}

function mapCulture(page: StrictNotionPage): WesternArtHistoryCulture {
  const description = readNotionText(page, "解説", `${LABEL} culture`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "出来事", "culture"),
    years: readNotionText(page, "年代", `${LABEL} culture`),
    type: readNotionSelect(page, "種類", `${LABEL} culture`),
    region: readNotionSelect(page, "地域", `${LABEL} culture`),
    description,
    reviewText: description || null,
  };
}

function mapMuseum(page: StrictNotionPage): WesternArtHistoryMuseum {
  const description = readNotionText(page, "解説", `${LABEL} museum`);
  return {
    id: page.id,
    url: page.url,
    label: pageLabel(page, "名前", "museum"),
    type: readNotionSelect(page, "種類", `${LABEL} museum`),
    city: readNotionSelect(page, "都市", `${LABEL} museum`),
    country: readNotionSelect(page, "国", `${LABEL} museum`),
    established: readNotionText(page, "建立年", `${LABEL} museum`),
    description,
    reviewText: description || null,
  };
}

/**
 * Strict Art History source used only by the snapshot publisher. It never
 * calls the learner Graph reader, never emits demo data, and never returns a
 * partial projection.
 */
export async function readWesternArtHistorySnapshotSource(): Promise<WesternArtHistorySnapshotSource> {
  const token = getStrictNotionToken();
  const entries = await Promise.all([
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.lectures, token, `${LABEL} lectures`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.artists, token, `${LABEL} artists`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.artworks, token, `${LABEL} artworks`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.movements, token, `${LABEL} movements`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.terms, token, `${LABEL} terms`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.periods, token, `${LABEL} periods`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.culture, token, `${LABEL} culture`),
    queryAllNotionDataSource(WESTERN_ART_HISTORY_SNAPSHOT_DATA_SOURCE_IDS.museums, token, `${LABEL} museums`),
  ]);
  const [lecturePages, artistPages, artworkPages, movementPages, termPages, periodPages, culturePages, museumPages] = entries;
  const allPages = entries.flat();
  assertUniqueProjectPages(allPages, LABEL);

  const lectures = bySequence(lecturePages.map(mapLecture));
  const artists = byId(artistPages.map(mapArtist));
  const artworks = byId(artworkPages.map(mapArtwork));
  const movements = byId(movementPages.map(mapMovement));
  const terms = byId(termPages.map(mapTerm));
  const periods = byId(periodPages.map(mapPeriod));
  const culture = byId(culturePages.map(mapCulture));
  const museums = byId(museumPages.map(mapMuseum));

  const pagesByKind = [
    ...lecturePages.map((page) => ({ page, kind: "lecture" })),
    ...artistPages.map((page) => ({ page, kind: "artist" })),
    ...artworkPages.map((page) => ({ page, kind: "artwork" })),
    ...movementPages.map((page) => ({ page, kind: "movement" })),
    ...termPages.map((page) => ({ page, kind: "term" })),
    ...periodPages.map((page) => ({ page, kind: "period" })),
    ...culturePages.map((page) => ({ page, kind: "culture" })),
    ...museumPages.map((page) => ({ page, kind: "museum" })),
  ];
  const relationRead = await collectStrictRelationObservations(pagesByKind, ART_RELATION_DECLARATIONS, token, LABEL);
  const relations = materializeStrictRelations(relationRead.observations, new Set(allPages.map((page) => page.id)), LABEL);

  return {
    sourceIdentifiers: [...WESTERN_ART_HISTORY_SNAPSHOT_SOURCE_IDENTIFIERS].sort(compare),
    paginationComplete: true,
    relationCompleteness: true,
    projection: {
      lectures,
      artists,
      artworks,
      movements,
      terms,
      periods,
      culture,
      museums,
      relations,
      completeness: {
        dataSources: entries.map((pages, index) => ({
          sourceIdentifier: WESTERN_ART_HISTORY_SNAPSHOT_SOURCE_IDENTIFIERS[index]!,
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

export const WESTERN_ART_HISTORY_RELATION_DECLARATIONS = ART_RELATION_DECLARATIONS;
