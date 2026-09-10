import { nextCursorOrThrow } from "./pagination.ts";

export const STRICT_NOTION_API_VERSION = "2026-03-11" as const;

export type StrictNotionProperty = Readonly<Record<string, unknown>>;

export type StrictNotionPage = Readonly<{
  object: "page";
  id: string;
  url: string;
  properties: Readonly<Record<string, StrictNotionProperty>>;
}>;

export type StrictNotionRelationDeclaration = Readonly<{
  ownerKind: string;
  propertyName: string;
  relationKind: string;
  relationLabel: string;
}>;

export type StrictRelationObservation = Readonly<{
  sourceEntityId: string;
  targetEntityId: string;
  ownerKind: string;
  propertyName: string;
  relationKind: string;
  relationLabel: string;
}>;

export type StrictRelationPropertyEvidence = Readonly<{
  sourceEntityId: string;
  ownerKind: string;
  propertyName: string;
  relationKind: string;
  itemCount: number;
  paginationComplete: true;
}>;

export type StrictNotionSnapshotSourceErrorCode =
  | "notion-token-missing"
  | "http-error"
  | "malformed-response"
  | "pagination-incomplete"
  | "pagination-cycle"
  | "duplicate-page"
  | "relation-pagination-incomplete"
  | "relation-pagination-cycle"
  | "relation-target-invalid"
  | "relation-target-unresolved";

export class StrictNotionSnapshotSourceError extends Error {
  readonly code: StrictNotionSnapshotSourceErrorCode;

  constructor(code: StrictNotionSnapshotSourceErrorCode, message: string) {
    super(message);
    this.name = "StrictNotionSnapshotSourceError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function relationEvidenceKey(value: Pick<StrictRelationPropertyEvidence, "ownerKind" | "sourceEntityId" | "propertyName" | "relationKind">) {
  return [value.ownerKind, value.sourceEntityId, value.propertyName, value.relationKind].join("\u0000");
}

function compareRelationEvidence(left: StrictRelationPropertyEvidence, right: StrictRelationPropertyEvidence) {
  const leftKey = relationEvidenceKey(left);
  const rightKey = relationEvidenceKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function tokenOrThrow() {
  const token = process.env.NOTION_TOKEN?.trim() || process.env.StudyGraph_NOTION_TOKEN?.trim();
  if (!token) throw new StrictNotionSnapshotSourceError("notion-token-missing", "NOTION_TOKEN is required for a snapshot sync");
  return token;
}

export function getStrictNotionToken() {
  return tokenOrThrow();
}

function parsePage(value: unknown, label: string): StrictNotionPage {
  if (
    !isRecord(value)
    || value.object !== "page"
    || !nonEmptyString(value.id)
    || !nonEmptyString(value.url)
    || !isRecord(value.properties)
  ) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned a malformed page`);
  }
  for (const [propertyName, property] of Object.entries(value.properties)) {
    if (!isRecord(property)) {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} property ${propertyName} is malformed`);
    }
  }
  return {
    object: "page",
    id: value.id,
    url: value.url,
    properties: value.properties as Readonly<Record<string, StrictNotionProperty>>,
  };
}

function parseQueryResponse(value: unknown, label: string) {
  if (
    !isRecord(value)
    || !Array.isArray(value.results)
    || typeof value.has_more !== "boolean"
    || !Object.prototype.hasOwnProperty.call(value, "next_cursor")
    || (value.next_cursor !== null && !nonEmptyString(value.next_cursor))
    || (!value.has_more && value.next_cursor !== null)
  ) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned a malformed pagination response`);
  }
  return {
    results: value.results,
    has_more: value.has_more,
    next_cursor: value.next_cursor as string | null,
  };
}

/** Query every page in one Notion data source without demo or partial fallback. */
export async function queryAllNotionDataSource(
  dataSourceId: string,
  token: string,
  label: string,
): Promise<StrictNotionPage[]> {
  const pages: StrictNotionPage[] = [];
  const seenPageIds = new Set<string>();
  const seenCursors = new Set<string>();
  let startCursor: string | null = null;

  while (true) {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${encodeURIComponent(dataSourceId)}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": STRICT_NOTION_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor === null ? {} : { start_cursor: startCursor }),
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new StrictNotionSnapshotSourceError("http-error", `${label} query failed with HTTP ${response.status}`);
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} response was not valid JSON`);
    }
    const payload = parseQueryResponse(raw, label);
    for (const result of payload.results) {
      const page = parsePage(result, label);
      if (seenPageIds.has(page.id)) {
        throw new StrictNotionSnapshotSourceError("duplicate-page", `${label} returned duplicate page ${page.id}`);
      }
      seenPageIds.add(page.id);
      pages.push(page);
    }
    if (!payload.has_more) return pages;
    let nextCursor: string;
    try {
      nextCursor = nextCursorOrThrow(payload, label) as string;
    } catch (error) {
      throw new StrictNotionSnapshotSourceError(
        "pagination-incomplete",
        error instanceof Error ? error.message : `${label} pagination is incomplete`,
      );
    }
    if (seenCursors.has(nextCursor)) {
      throw new StrictNotionSnapshotSourceError("pagination-cycle", `${label} pagination cursor repeated`);
    }
    seenCursors.add(nextCursor);
    startCursor = nextCursor;
  }
}

function propertyId(page: StrictNotionPage, propertyName: string, label: string) {
  const property = page.properties[propertyName];
  if (
    !property
    || property.type !== "relation"
    || !nonEmptyString(property.id)
    || !Array.isArray(property.relation)
  ) {
    throw new StrictNotionSnapshotSourceError(
      "malformed-response",
      `${label} relation property ${propertyName} is missing or malformed on ${page.id}`,
    );
  }
  let id: string;
  try {
    // Notion can return property IDs already percent-encoded (for example
    // `f%5C%5C%3Ap`). Decode the API value before encoding it for the URL so
    // the path contains exactly one URL-encoded representation.
    id = encodeURIComponent(decodeURIComponent(property.id));
  } catch {
    throw new StrictNotionSnapshotSourceError(
      "malformed-response",
      `${label} relation property ${propertyName} has an invalid property ID on ${page.id}`,
    );
  }
  if (id.length === 0) {
    throw new StrictNotionSnapshotSourceError(
      "malformed-response",
      `${label} relation property ${propertyName} has an empty property ID on ${page.id}`,
    );
  }
  return { property, id };
}

function relationId(value: unknown, label: string): string {
  if (!isRecord(value) || !nonEmptyString(value.id)) {
    throw new StrictNotionSnapshotSourceError("relation-target-invalid", `${label} returned a malformed relation target`);
  }
  return value.id;
}

function parseRelationPropertyResponse(value: unknown, label: string) {
  if (!isRecord(value)) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned a malformed relation property response`);
  }

  if (value.object === "property_item" && value.type === "relation") {
    const ids = [relationId(value.relation, label)];
    const hasMore = Object.prototype.hasOwnProperty.call(value, "has_more")
      ? value.has_more
      : false;
    if (typeof hasMore !== "boolean") {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned an invalid has_more flag`);
    }
    const nextCursor = Object.prototype.hasOwnProperty.call(value, "next_cursor")
      ? value.next_cursor
      : null;
    if (nextCursor !== null && !nonEmptyString(nextCursor)) {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned an invalid next_cursor`);
    }
    if (!hasMore && nextCursor !== null) {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned an unexpected next_cursor`);
    }
    if (hasMore && !nonEmptyString(nextCursor)) {
      throw new StrictNotionSnapshotSourceError("relation-pagination-incomplete", `${label} relation pagination is incomplete`);
    }
    return {
      ids,
      hasMore,
      nextCursor: hasMore ? nextCursor : null,
    };
  }

  if (
    value.object !== "list"
    || value.type !== "property_item"
    || !isRecord(value.property_item)
    || value.property_item.type !== "relation"
    || !Array.isArray(value.results)
    || typeof value.has_more !== "boolean"
    || !Object.prototype.hasOwnProperty.call(value, "next_cursor")
    || (value.next_cursor !== null && !nonEmptyString(value.next_cursor))
    || (!value.has_more && value.next_cursor !== null)
  ) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} returned a malformed relation property list`);
  }
  const ids = value.results.map((item) => {
    if (!isRecord(item) || item.object !== "property_item" || item.type !== "relation") {
      throw new StrictNotionSnapshotSourceError("relation-target-invalid", `${label} returned a malformed relation item`);
    }
    return relationId(item.relation, label);
  });
  return {
    ids,
    hasMore: value.has_more,
    nextCursor: value.next_cursor as string | null,
  };
}

/** Retrieve every relation item for one page property using Notion's property endpoint. */
export async function queryAllNotionRelationProperty(
  page: StrictNotionPage,
  propertyName: string,
  token: string,
  label: string,
): Promise<string[]> {
  const { id: relationPropertyId } = propertyId(page, propertyName, label);
  const ids: string[] = [];
  const seenCursors = new Set<string>();
  const seenIds = new Set<string>();
  let startCursor: string | null = null;

  while (true) {
    const url = `https://api.notion.com/v1/pages/${encodeURIComponent(page.id)}/properties/${relationPropertyId}`;
    const response = await fetch(`${url}?page_size=100${startCursor === null ? "" : `&start_cursor=${encodeURIComponent(startCursor)}`}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": STRICT_NOTION_API_VERSION,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new StrictNotionSnapshotSourceError("http-error", `${label} relation property failed with HTTP ${response.status}`);
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} relation property response was not valid JSON`);
    }
    const pageResult = parseRelationPropertyResponse(raw, label);
    for (const id of pageResult.ids) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
    }
    if (!pageResult.hasMore) return ids;
    if (typeof pageResult.nextCursor !== "string" || pageResult.nextCursor.trim().length === 0) {
      throw new StrictNotionSnapshotSourceError("relation-pagination-incomplete", `${label} relation pagination is incomplete`);
    }
    if (seenCursors.has(pageResult.nextCursor)) {
      throw new StrictNotionSnapshotSourceError("relation-pagination-cycle", `${label} relation cursor repeated`);
    }
    seenCursors.add(pageResult.nextCursor);
    startCursor = pageResult.nextCursor;
  }
}

/** Ensure that the projection never silently merges two source pages. */
export function assertUniqueProjectPages(pages: readonly StrictNotionPage[], label: string) {
  const ids = new Set<string>();
  for (const page of pages) {
    if (ids.has(page.id)) throw new StrictNotionSnapshotSourceError("duplicate-page", `${label} returned duplicate page ${page.id}`);
    ids.add(page.id);
  }
}

/**
 * Read every declared relation property. Relation target resolution happens in
 * `materializeStrictRelations` after all data-source pages are known.
 */
export async function collectStrictRelationObservations(
  pages: readonly Readonly<{ page: StrictNotionPage; kind: string }>[],
  declarations: readonly StrictNotionRelationDeclaration[],
  token: string,
  label: string,
): Promise<{ observations: StrictRelationObservation[]; evidence: StrictRelationPropertyEvidence[] }> {
  const observations: StrictRelationObservation[] = [];
  const evidence: StrictRelationPropertyEvidence[] = [];
  const evidenceKeys = new Set<string>();
  for (const { page, kind } of pages) {
    for (const declaration of declarations) {
      if (declaration.ownerKind !== kind) continue;
      const targets = await queryAllNotionRelationProperty(page, declaration.propertyName, token, `${label} ${kind}.${declaration.propertyName}`);
      const evidenceItem: StrictRelationPropertyEvidence = {
        sourceEntityId: page.id,
        ownerKind: declaration.ownerKind,
        propertyName: declaration.propertyName,
        relationKind: declaration.relationKind,
        itemCount: targets.length,
        paginationComplete: true,
      };
      const evidenceKey = relationEvidenceKey(evidenceItem);
      if (evidenceKeys.has(evidenceKey)) {
        throw new StrictNotionSnapshotSourceError("malformed-response", `${label} relation completeness evidence is duplicated`);
      }
      evidenceKeys.add(evidenceKey);
      evidence.push(evidenceItem);
      for (const targetEntityId of targets) {
        observations.push({
          sourceEntityId: page.id,
          targetEntityId,
          ownerKind: declaration.ownerKind,
          propertyName: declaration.propertyName,
          relationKind: declaration.relationKind,
          relationLabel: declaration.relationLabel,
        });
      }
    }
  }
  return { observations, evidence: evidence.sort(compareRelationEvidence) };
}

/**
 * Preserve the existing Graph edge identity (sorted endpoint pair + kind),
 * but fail closed when a relation points outside the declared projection.
 */
export function materializeStrictRelations(
  observations: readonly StrictRelationObservation[],
  nodeIds: ReadonlySet<string>,
  label: string,
) {
  const relations: Array<{ id: string; sourceEntityId: string; targetEntityId: string; kind: string; label: string }> = [];
  const relationKeys = new Set<string>();
  const orderedObservations = [...observations].sort((left, right) => {
    const leftKey = `${left.sourceEntityId}\u0000${left.targetEntityId}\u0000${left.relationKind}\u0000${left.relationLabel}\u0000${left.ownerKind}\u0000${left.propertyName}`;
    const rightKey = `${right.sourceEntityId}\u0000${right.targetEntityId}\u0000${right.relationKind}\u0000${right.relationLabel}\u0000${right.ownerKind}\u0000${right.propertyName}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (const observation of orderedObservations) {
    if (!nodeIds.has(observation.sourceEntityId)) {
      throw new StrictNotionSnapshotSourceError("relation-target-unresolved", `${label} relation source is outside the projection`);
    }
    if (!nodeIds.has(observation.targetEntityId)) {
      throw new StrictNotionSnapshotSourceError("relation-target-unresolved", `${label} relation target ${observation.targetEntityId} is unresolved`);
    }
    if (observation.sourceEntityId === observation.targetEntityId) continue;
    const [left, right] = [observation.sourceEntityId, observation.targetEntityId].sort();
    const id = `${left}:${right}:${observation.relationKind}`;
    if (relationKeys.has(id)) continue;
    relationKeys.add(id);
    relations.push({
      id,
      sourceEntityId: observation.sourceEntityId,
      targetEntityId: observation.targetEntityId,
      kind: observation.relationKind,
      label: observation.relationLabel,
    });
  }
  return relations.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function readNotionText(page: StrictNotionPage, propertyName: string, label: string): string {
  const property = page.properties[propertyName];
  if (!property) return "";
  if (property.type !== "title" && property.type !== "rich_text") {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} text property ${propertyName} has an invalid type`);
  }
  const values = property[property.type];
  if (!Array.isArray(values)) throw new StrictNotionSnapshotSourceError("malformed-response", `${label} text property ${propertyName} is malformed`);
  return values.map((item) => {
    if (!isRecord(item) || typeof item.plain_text !== "string") {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} text property ${propertyName} contains a malformed item`);
    }
    return item.plain_text;
  }).join("");
}

export function readNotionNumber(page: StrictNotionPage, propertyName: string, label: string): number | null {
  const property = page.properties[propertyName];
  if (!property) return null;
  if (property.type !== "number" || (property.number !== null && (typeof property.number !== "number" || !Number.isFinite(property.number)))) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} number property ${propertyName} is malformed`);
  }
  return property.number as number | null;
}

export function readNotionSelect(page: StrictNotionPage, propertyName: string, label: string): string {
  const property = page.properties[propertyName];
  if (!property) return "";
  if (property.type !== "select" && property.type !== "status") {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} select property ${propertyName} has an invalid type`);
  }
  const selected = property[property.type];
  if (selected === null) return "";
  if (!isRecord(selected) || typeof selected.name !== "string") {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} select property ${propertyName} is malformed`);
  }
  return selected.name;
}

export function readNotionMultiSelect(page: StrictNotionPage, propertyName: string, label: string): string[] {
  const property = page.properties[propertyName];
  if (!property) return [];
  if (property.type !== "multi_select" || !Array.isArray(property.multi_select)) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} multi-select property ${propertyName} is malformed`);
  }
  return property.multi_select.map((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || item.name.trim().length === 0) {
      throw new StrictNotionSnapshotSourceError("malformed-response", `${label} multi-select property ${propertyName} contains a malformed item`);
    }
    return item.name;
  });
}

export function readNotionDate(page: StrictNotionPage, propertyName: string, label: string): string | null {
  const property = page.properties[propertyName];
  if (!property) return null;
  if (property.type !== "date") throw new StrictNotionSnapshotSourceError("malformed-response", `${label} date property ${propertyName} has an invalid type`);
  if (property.date === null) return null;
  if (!isRecord(property.date) || (property.date.start !== null && typeof property.date.start !== "string")) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} date property ${propertyName} is malformed`);
  }
  return property.date.start as string | null;
}

export function readNotionCheckbox(page: StrictNotionPage, propertyName: string, label: string): boolean {
  const property = page.properties[propertyName];
  if (!property) return false;
  if (property.type !== "checkbox" || typeof property.checkbox !== "boolean") {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} checkbox property ${propertyName} is malformed`);
  }
  return property.checkbox;
}

/**
 * Read a learner-facing title while preserving the neutral fallback semantics
 * of the existing trusted Graph readers. An empty title value is valid source
 * data, but a missing or mistyped title property is schema drift and therefore
 * still fails closed.
 */
export function readNotionDisplayLabel(
  page: StrictNotionPage,
  propertyName: string,
  label: string,
  fallback: string,
): string {
  const property = page.properties[propertyName];
  if (!property) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} title property ${propertyName} is missing`);
  }
  if (property.type !== "title") {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} title property ${propertyName} has an invalid type`);
  }
  if (fallback.trim().length === 0) {
    throw new StrictNotionSnapshotSourceError("malformed-response", `${label} title fallback is empty`);
  }
  const value = readNotionText(page, propertyName, label);
  return value.trim().length > 0 ? value : fallback;
}

export function requiredNotionText(page: StrictNotionPage, propertyName: string, label: string): string {
  const value = readNotionText(page, propertyName, label);
  if (value.trim().length === 0) throw new StrictNotionSnapshotSourceError("malformed-response", `${label} ${propertyName} is empty`);
  return value;
}
