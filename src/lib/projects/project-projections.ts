/** A normalized relation observation shared by the project projections. */
export type ProjectKnowledgeRelation = Readonly<{
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  kind: string;
  label: string;
}>;

export type DataSourceCompleteness = Readonly<{
  sourceIdentifier: string;
  itemCount: number;
  paginationComplete: true;
}>;

export type RelationPropertyCompleteness = Readonly<{
  ownerKind: string;
  propertyName: string;
  relationKind: string;
  itemCount: number;
  paginationComplete: true;
}>;

/**
 * Completeness is part of the versioned projection, so it is covered by the
 * existing ScopeKnowledgeSnapshot content hash.  The historical envelope's
 * sourceEvidence remains intentionally small and unchanged.
 */
export type ProjectProjectionCompleteness = Readonly<{
  dataSources: readonly DataSourceCompleteness[];
  relationProperties: readonly RelationPropertyCompleteness[];
  unresolvedTargets: readonly string[];
}>;

export type WesternArtHistoryLecture = Readonly<{
  id: string;
  url: string;
  label: string;
  sequence: number | null;
  phase: string;
  status: string;
  theme: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryArtist = Readonly<{
  id: string;
  url: string;
  label: string;
  lifespan: string;
  region: string;
  importance: string;
  technique: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryArtwork = Readonly<{
  id: string;
  url: string;
  label: string;
  productionYear: string;
  genre: string;
  country: string;
  importance: string;
  subjects: readonly string[];
  reviewText: string | null;
}>;

export type WesternArtHistoryMovement = Readonly<{
  id: string;
  url: string;
  label: string;
  region: string;
  importance: string;
  features: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryTerm = Readonly<{
  id: string;
  url: string;
  label: string;
  category: string;
  importance: string;
  meaning: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryPeriod = Readonly<{
  id: string;
  url: string;
  label: string;
  years: string;
  region: string;
  features: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryCulture = Readonly<{
  id: string;
  url: string;
  label: string;
  years: string;
  type: string;
  region: string;
  description: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryMuseum = Readonly<{
  id: string;
  url: string;
  label: string;
  type: string;
  city: string;
  country: string;
  established: string;
  description: string;
  reviewText: string | null;
}>;

export type WesternArtHistoryV1Projection = Readonly<{
  lectures: readonly WesternArtHistoryLecture[];
  artists: readonly WesternArtHistoryArtist[];
  artworks: readonly WesternArtHistoryArtwork[];
  movements: readonly WesternArtHistoryMovement[];
  terms: readonly WesternArtHistoryTerm[];
  periods: readonly WesternArtHistoryPeriod[];
  culture: readonly WesternArtHistoryCulture[];
  museums: readonly WesternArtHistoryMuseum[];
  relations: readonly ProjectKnowledgeRelation[];
  completeness: ProjectProjectionCompleteness;
}>;

export type PhilosophyLecture = Readonly<{
  id: string;
  url: string;
  label: string;
  sequence: number | null;
  status: string;
  question: string;
  reviewText: string | null;
}>;

export type PhilosophyPhilosopher = Readonly<{
  id: string;
  url: string;
  label: string;
  lifespan: string;
  schools: readonly string[];
  regions: readonly string[];
  memo: string;
  reviewText: string | null;
}>;

export type PhilosophyTerm = Readonly<{
  id: string;
  url: string;
  label: string;
  fields: readonly string[];
  definition: string;
  reviewText: string | null;
}>;

export type PhilosophyProblem = Readonly<{
  id: string;
  url: string;
  label: string;
  fields: readonly string[];
  overview: string;
  currentUnderstanding: string;
  reviewText: string | null;
}>;

export type PhilosophyWork = Readonly<{
  id: string;
  url: string;
  label: string;
  author: string;
  years: string;
  genre: string;
  priority: string;
  completed: boolean;
  reviewText: string | null;
}>;

export type PhilosophyCulture = Readonly<{
  id: string;
  url: string;
  label: string;
  type: string;
  authorOrDirector: string;
  years: string;
  comment: string;
  reviewText: string | null;
}>;

export type PhilosophyPeriod = Readonly<{
  id: string;
  url: string;
  label: string;
  years: string;
  features: string;
  reviewText: string | null;
}>;

export type PhilosophyThoughtNote = Readonly<{
  id: string;
  url: string;
  label: string;
  date: string | null;
  content: string;
  corrected: boolean;
  reviewText: string | null;
}>;

export type PhilosophyV1Projection = Readonly<{
  lectures: readonly PhilosophyLecture[];
  philosophers: readonly PhilosophyPhilosopher[];
  terms: readonly PhilosophyTerm[];
  problems: readonly PhilosophyProblem[];
  works: readonly PhilosophyWork[];
  culture: readonly PhilosophyCulture[];
  periods: readonly PhilosophyPeriod[];
  thoughtNotes: readonly PhilosophyThoughtNote[];
  relations: readonly ProjectKnowledgeRelation[];
  completeness: ProjectProjectionCompleteness;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(path: string, message: string): never {
  throw new Error(`${path} ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "must be an object");
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, "is not supported in this projection version");
  }
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, "must be a string");
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(path, "must be a non-empty string");
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") fail(path, "must be a string or null");
  return value;
}

function nullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, "must be a number or null");
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function stringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    fail(path, "must be an array of non-empty strings");
  }
  if (new Set(value).size !== value.length) fail(path, "must not contain duplicates");
  return value;
}

function baseEntity(value: unknown, path: string, allowed: readonly string[]) {
  const record = object(value, path);
  exactKeys(record, allowed, path);
  return {
    id: requiredString(record.id, `${path}.id`),
    url: requiredString(record.url, `${path}.url`),
    label: requiredString(record.label, `${path}.label`),
  };
}

function validateUniqueEntityIds(items: readonly { id: string }[], path: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) fail(path, `contains duplicate id ${item.id}`);
    ids.add(item.id);
  }
}

function decodeRelation(value: unknown, index: number): ProjectKnowledgeRelation {
  const path = `projection.relations[${index}]`;
  const record = object(value, path);
  exactKeys(record, ["id", "sourceEntityId", "targetEntityId", "kind", "label"], path);
  return {
    id: requiredString(record.id, `${path}.id`),
    sourceEntityId: requiredString(record.sourceEntityId, `${path}.sourceEntityId`),
    targetEntityId: requiredString(record.targetEntityId, `${path}.targetEntityId`),
    kind: requiredString(record.kind, `${path}.kind`),
    label: requiredString(record.label, `${path}.label`),
  };
}

function decodeCompleteness(value: unknown): ProjectProjectionCompleteness {
  const record = object(value, "projection.completeness");
  exactKeys(record, ["dataSources", "relationProperties", "unresolvedTargets"], "projection.completeness");
  if (!Array.isArray(record.dataSources)) fail("projection.completeness.dataSources", "must be an array");
  if (!Array.isArray(record.relationProperties)) fail("projection.completeness.relationProperties", "must be an array");
  const dataSources = record.dataSources.map((item, index) => {
    const path = `projection.completeness.dataSources[${index}]`;
    const source = object(item, path);
    exactKeys(source, ["sourceIdentifier", "itemCount", "paginationComplete"], path);
    const itemCount = source.itemCount;
    if (typeof itemCount !== "number" || !Number.isSafeInteger(itemCount) || itemCount < 0) fail(`${path}.itemCount`, "must be a non-negative integer");
    if (source.paginationComplete !== true) fail(`${path}.paginationComplete`, "must be true for a published projection");
    return { sourceIdentifier: requiredString(source.sourceIdentifier, `${path}.sourceIdentifier`), itemCount, paginationComplete: true as const };
  });
  const relationProperties = record.relationProperties.map((item, index) => {
    const path = `projection.completeness.relationProperties[${index}]`;
    const relation = object(item, path);
    exactKeys(relation, ["ownerKind", "propertyName", "relationKind", "itemCount", "paginationComplete"], path);
    const itemCount = relation.itemCount;
    if (typeof itemCount !== "number" || !Number.isSafeInteger(itemCount) || itemCount < 0) fail(`${path}.itemCount`, "must be a non-negative integer");
    if (relation.paginationComplete !== true) fail(`${path}.paginationComplete`, "must be true for a published projection");
    return {
      ownerKind: requiredString(relation.ownerKind, `${path}.ownerKind`),
      propertyName: requiredString(relation.propertyName, `${path}.propertyName`),
      relationKind: requiredString(relation.relationKind, `${path}.relationKind`),
      itemCount,
      paginationComplete: true as const,
    };
  });
  const unresolvedTargets = stringArray(record.unresolvedTargets, "projection.completeness.unresolvedTargets");
  return { dataSources, relationProperties, unresolvedTargets };
}

function validateRelations(relations: readonly ProjectKnowledgeRelation[]) {
  const ids = new Set<string>();
  for (const relation of relations) {
    if (ids.has(relation.id)) fail("projection.relations", `contains duplicate id ${relation.id}`);
    ids.add(relation.id);
  }
}

function decodeArtLecture(value: unknown, index: number): WesternArtHistoryLecture {
  const path = `projection.lectures[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "sequence", "phase", "status", "theme", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, sequence: nullableNumber(record.sequence, `${path}.sequence`), phase: string(record.phase, `${path}.phase`), status: string(record.status, `${path}.status`), theme: string(record.theme, `${path}.theme`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtArtist(value: unknown, index: number): WesternArtHistoryArtist {
  const path = `projection.artists[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "lifespan", "region", "importance", "technique", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, lifespan: string(record.lifespan, `${path}.lifespan`), region: string(record.region, `${path}.region`), importance: string(record.importance, `${path}.importance`), technique: string(record.technique, `${path}.technique`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtArtwork(value: unknown, index: number): WesternArtHistoryArtwork {
  const path = `projection.artworks[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "productionYear", "genre", "country", "importance", "subjects", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, productionYear: string(record.productionYear, `${path}.productionYear`), genre: string(record.genre, `${path}.genre`), country: string(record.country, `${path}.country`), importance: string(record.importance, `${path}.importance`), subjects: stringArray(record.subjects, `${path}.subjects`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtMovement(value: unknown, index: number): WesternArtHistoryMovement {
  const path = `projection.movements[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "region", "importance", "features", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, region: string(record.region, `${path}.region`), importance: string(record.importance, `${path}.importance`), features: string(record.features, `${path}.features`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtTerm(value: unknown, index: number): WesternArtHistoryTerm {
  const path = `projection.terms[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "category", "importance", "meaning", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, category: string(record.category, `${path}.category`), importance: string(record.importance, `${path}.importance`), meaning: string(record.meaning, `${path}.meaning`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtPeriod(value: unknown, index: number): WesternArtHistoryPeriod {
  const path = `projection.periods[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "years", "region", "features", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, years: string(record.years, `${path}.years`), region: string(record.region, `${path}.region`), features: string(record.features, `${path}.features`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtCulture(value: unknown, index: number): WesternArtHistoryCulture {
  const path = `projection.culture[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "years", "type", "region", "description", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, years: string(record.years, `${path}.years`), type: string(record.type, `${path}.type`), region: string(record.region, `${path}.region`), description: string(record.description, `${path}.description`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeArtMuseum(value: unknown, index: number): WesternArtHistoryMuseum {
  const path = `projection.museums[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "type", "city", "country", "established", "description", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, type: string(record.type, `${path}.type`), city: string(record.city, `${path}.city`), country: string(record.country, `${path}.country`), established: string(record.established, `${path}.established`), description: string(record.description, `${path}.description`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyLecture(value: unknown, index: number): PhilosophyLecture {
  const path = `projection.lectures[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "sequence", "status", "question", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, sequence: nullableNumber(record.sequence, `${path}.sequence`), status: string(record.status, `${path}.status`), question: string(record.question, `${path}.question`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosopher(value: unknown, index: number): PhilosophyPhilosopher {
  const path = `projection.philosophers[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "lifespan", "schools", "regions", "memo", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, lifespan: string(record.lifespan, `${path}.lifespan`), schools: stringArray(record.schools, `${path}.schools`), regions: stringArray(record.regions, `${path}.regions`), memo: string(record.memo, `${path}.memo`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyTerm(value: unknown, index: number): PhilosophyTerm {
  const path = `projection.terms[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "fields", "definition", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, fields: stringArray(record.fields, `${path}.fields`), definition: string(record.definition, `${path}.definition`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyProblem(value: unknown, index: number): PhilosophyProblem {
  const path = `projection.problems[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "fields", "overview", "currentUnderstanding", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, fields: stringArray(record.fields, `${path}.fields`), overview: string(record.overview, `${path}.overview`), currentUnderstanding: string(record.currentUnderstanding, `${path}.currentUnderstanding`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyWork(value: unknown, index: number): PhilosophyWork {
  const path = `projection.works[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "author", "years", "genre", "priority", "completed", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, author: string(record.author, `${path}.author`), years: string(record.years, `${path}.years`), genre: string(record.genre, `${path}.genre`), priority: string(record.priority, `${path}.priority`), completed: boolean(record.completed, `${path}.completed`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyCulture(value: unknown, index: number): PhilosophyCulture {
  const path = `projection.culture[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "type", "authorOrDirector", "years", "comment", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, type: string(record.type, `${path}.type`), authorOrDirector: string(record.authorOrDirector, `${path}.authorOrDirector`), years: string(record.years, `${path}.years`), comment: string(record.comment, `${path}.comment`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodePhilosophyPeriod(value: unknown, index: number): PhilosophyPeriod {
  const path = `projection.periods[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "years", "features", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, years: string(record.years, `${path}.years`), features: string(record.features, `${path}.features`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function decodeThoughtNote(value: unknown, index: number): PhilosophyThoughtNote {
  const path = `projection.thoughtNotes[${index}]`;
  const base = baseEntity(value, path, ["id", "url", "label", "date", "content", "corrected", "reviewText"]);
  const record = value as Record<string, unknown>;
  return { ...base, date: nullableString(record.date, `${path}.date`), content: string(record.content, `${path}.content`), corrected: boolean(record.corrected, `${path}.corrected`), reviewText: nullableString(record.reviewText, `${path}.reviewText`) };
}

function projectionObject(value: unknown, keys: readonly string[], path = "projection") {
  const record = object(value, path);
  exactKeys(record, keys, path);
  return record;
}

function arrayField(record: Record<string, unknown>, field: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) fail(`projection.${field}`, "must be an array");
  return value;
}

/** Strict, versioned Western Art History projection decoder. */
export function decodeWesternArtHistoryV1Projection(value: unknown): WesternArtHistoryV1Projection {
  const record = projectionObject(value, ["lectures", "artists", "artworks", "movements", "terms", "periods", "culture", "museums", "relations", "completeness"]);
  const lectures = arrayField(record, "lectures").map(decodeArtLecture);
  const artists = arrayField(record, "artists").map(decodeArtArtist);
  const artworks = arrayField(record, "artworks").map(decodeArtArtwork);
  const movements = arrayField(record, "movements").map(decodeArtMovement);
  const terms = arrayField(record, "terms").map(decodeArtTerm);
  const periods = arrayField(record, "periods").map(decodeArtPeriod);
  const culture = arrayField(record, "culture").map(decodeArtCulture);
  const museums = arrayField(record, "museums").map(decodeArtMuseum);
  const relations = arrayField(record, "relations").map(decodeRelation);
  validateUniqueEntityIds(lectures, "projection.lectures");
  validateUniqueEntityIds(artists, "projection.artists");
  validateUniqueEntityIds(artworks, "projection.artworks");
  validateUniqueEntityIds(movements, "projection.movements");
  validateUniqueEntityIds(terms, "projection.terms");
  validateUniqueEntityIds(periods, "projection.periods");
  validateUniqueEntityIds(culture, "projection.culture");
  validateUniqueEntityIds(museums, "projection.museums");
  validateRelations(relations);
  const completeness = decodeCompleteness(record.completeness);
  if (completeness.unresolvedTargets.length > 0) fail("projection.completeness.unresolvedTargets", "must be empty for a published projection");
  return { lectures, artists, artworks, movements, terms, periods, culture, museums, relations, completeness };
}

/** Strict, versioned Western Philosophy projection decoder. */
export function decodePhilosophyV1Projection(value: unknown): PhilosophyV1Projection {
  const record = projectionObject(value, ["lectures", "philosophers", "terms", "problems", "works", "culture", "periods", "thoughtNotes", "relations", "completeness"]);
  const lectures = arrayField(record, "lectures").map(decodePhilosophyLecture);
  const philosophers = arrayField(record, "philosophers").map(decodePhilosopher);
  const terms = arrayField(record, "terms").map(decodePhilosophyTerm);
  const problems = arrayField(record, "problems").map(decodePhilosophyProblem);
  const works = arrayField(record, "works").map(decodePhilosophyWork);
  const culture = arrayField(record, "culture").map(decodePhilosophyCulture);
  const periods = arrayField(record, "periods").map(decodePhilosophyPeriod);
  const thoughtNotes = arrayField(record, "thoughtNotes").map(decodeThoughtNote);
  const relations = arrayField(record, "relations").map(decodeRelation);
  validateUniqueEntityIds(lectures, "projection.lectures");
  validateUniqueEntityIds(philosophers, "projection.philosophers");
  validateUniqueEntityIds(terms, "projection.terms");
  validateUniqueEntityIds(problems, "projection.problems");
  validateUniqueEntityIds(works, "projection.works");
  validateUniqueEntityIds(culture, "projection.culture");
  validateUniqueEntityIds(periods, "projection.periods");
  validateUniqueEntityIds(thoughtNotes, "projection.thoughtNotes");
  validateRelations(relations);
  const completeness = decodeCompleteness(record.completeness);
  if (completeness.unresolvedTargets.length > 0) fail("projection.completeness.unresolvedTargets", "must be empty for a published projection");
  return { lectures, philosophers, terms, problems, works, culture, periods, thoughtNotes, relations, completeness };
}

export type ProjectProjection = WesternArtHistoryV1Projection | PhilosophyV1Projection;
