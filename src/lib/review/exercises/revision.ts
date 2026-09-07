import { createHash } from "node:crypto";
import type {
  ExerciseDefinition,
  ExerciseGradingSpec,
  ExerciseSource,
  ExerciseStimulus,
  KnowledgeBinding,
  VisualAsset,
  VisualAssetSource,
} from "./types.ts";
import { assertValidExerciseDefinition } from "./validation.ts";

export const REVISION_SCHEMA_VERSION = 1 as const;
export const CANONICALIZATION_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PilotStructuredMetadata = {
  motherCharacter: {
    value: string;
    status: "legacy-approved";
    approvedFrom: "PR #27";
  };
};

export type ExerciseRevisionVisualAsset = {
  assetId: string;
  assetVersion: number;
  mediaType: VisualAsset["mediaType"];
  src: string;
  width: number;
  height: number;
  alt: string;
  checksum: string | null;
  source: VisualAssetSource;
};

export type RevisionScopeOptions = {
  scopeRequirements?: JsonValue | null;
  prerequisites?: string[];
};

export type RevisionVersioningOptions = {
  supersedes?: string | null;
  changeReason?: string | null;
};

export type RevisionArchiveMetadata = {
  registeredAt?: string;
  sourceGitSha?: string;
  releaseId?: string;
  quarantineStatus?: string;
};

export type ExerciseRevisionPayload = {
  canonicalizationVersion: typeof CANONICALIZATION_VERSION;
  schemaVersion: ExerciseDefinition["schemaVersion"];
  projectId: string;
  exerciseId: string;
  exerciseVersion: number;
  domain: string;
  objectiveId: string;
  skill: string;
  category: string;
  prompt: string;
  front: string;
  stimuli: ExerciseStimulus[];
  visualAssets: ExerciseRevisionVisualAsset[];
  answerSpec: ExerciseDefinition["answerSpec"];
  gradingSpec: ExerciseGradingSpec;
  explanation: ExerciseDefinition["explanation"];
  sources: ExerciseSource[];
  provenance: ExerciseDefinition["provenance"];
  scopeRequirements: JsonValue | null;
  prerequisites: string[];
  relatedKnowledgeBindings: KnowledgeBinding[];
  pilotMetadata: PilotStructuredMetadata;
  origin: ExerciseDefinition["origin"];
  status: ExerciseDefinition["status"];
  supersedes: string | null;
  changeReason: string | null;
};

export type ExerciseRevision = ExerciseRevisionPayload & {
  contentHash: string;
  archiveMetadata?: RevisionArchiveMetadata;
};

export type RevisionIdentity = Pick<ExerciseRevisionPayload, "projectId" | "exerciseId" | "exerciseVersion">;

export type RevisionIdentityEntry = RevisionIdentity & {
  contentHash: string;
};

export type RevisionIdentityConflict = {
  identityKey: string;
  existingContentHash: string;
  candidateContentHash: string;
};

export type ContentReleaseAssetReference = {
  assetId: string;
  assetVersion: number;
  src: string;
  checksum: string | null;
};

export type ContentReleaseRevisionEntry = RevisionIdentity & {
  contentHash: string;
  assets: ContentReleaseAssetReference[];
  grader: {
    strategyId: ExerciseGradingSpec["strategyId"];
    strategyVersion: number;
  };
  normalizerVersion: string;
  rendererVersion?: string;
  adapterVersion?: string;
};

export type ContentReleaseManifest = {
  manifestSchemaVersion: 1;
  revisionEntries: ContentReleaseRevisionEntry[];
};

export type ContentRelease = {
  manifest: ContentReleaseManifest;
  manifestHash: string;
  provenance?: {
    sourceGitSha?: string;
  };
};

export type ContentReleaseBuildOptions = {
  rendererVersion?: string;
  adapterVersion?: string;
  sourceGitSha?: string;
};

function isPlainObject(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeJsonValue(value: unknown, path: string, active: WeakSet<object>): JsonValue {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`);
      return value;
    case "undefined":
      throw new TypeError(`undefined is not allowed at ${path}`);
    case "bigint":
    case "function":
    case "symbol":
      throw new TypeError(`Unsupported JSON value at ${path}`);
  }

  if (active.has(value)) throw new TypeError(`Cyclic JSON value at ${path}`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      for (const key of keys) {
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new TypeError(`Unsupported enumerable array property at ${path}.${key}`);
        }
      }
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(`Sparse array is not allowed at ${path}[${index}]`);
        }
        result.push(normalizeJsonValue(value[index], `${path}[${index}]`, active));
      }
      return result;
    }

    if (!isPlainObject(value)) throw new TypeError(`Unsupported object at ${path}`);
    const result: { [key: string]: JsonValue } = Object.create(null) as { [key: string]: JsonValue };
    for (const key of Object.keys(value).sort()) {
      result[key] = normalizeJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`, active);
    }
    return result;
  } finally {
    active.delete(value);
  }
}

/** Canonical JSON for content hashes: sorted object keys, preserved array order, unchanged strings. */
export function canonicalizeJson(value: unknown): string {
  const normalized = normalizeJsonValue(value, "$", new WeakSet<object>());
  const result = JSON.stringify(normalized);
  if (result === undefined) throw new TypeError("Canonical JSON must be defined");
  return result;
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function copyJson<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function validatePilotMetadata(metadata: PilotStructuredMetadata) {
  if (metadata.motherCharacter.value !== "阿") {
    throw new Error("Kuzushiji pilot motherCharacter must remain 阿");
  }
  if (metadata.motherCharacter.status !== "legacy-approved") {
    throw new Error("Kuzushiji pilot motherCharacter must remain legacy-approved");
  }
  if (metadata.motherCharacter.approvedFrom !== "PR #27") {
    throw new Error("Kuzushiji pilot motherCharacter must remain approved from PR #27");
  }
}

export function createExerciseRevisionPayload(
  definition: ExerciseDefinition,
  assets: ReadonlyMap<string, VisualAsset>,
  pilotMetadata: PilotStructuredMetadata,
  options: RevisionScopeOptions & RevisionVersioningOptions = {},
): ExerciseRevisionPayload {
  assertValidExerciseDefinition(definition, assets);
  validatePilotMetadata(pilotMetadata);

  const visualAssets = definition.stimuli.map((stimulus) => {
    const asset = assets.get(stimulus.assetId);
    if (!asset) throw new Error(`Missing visual asset for revision: ${stimulus.assetId}`);
    if (asset.assetVersion !== stimulus.assetVersion) {
      throw new Error(`Visual asset version mismatch for revision: ${stimulus.assetId}`);
    }
    return {
      assetId: asset.assetId,
      assetVersion: asset.assetVersion,
      mediaType: asset.mediaType,
      src: asset.src,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
      checksum: asset.checksum,
      source: copyJson(asset.source),
    };
  });

  return deepFreeze({
    canonicalizationVersion: CANONICALIZATION_VERSION,
    schemaVersion: definition.schemaVersion,
    projectId: definition.projectId,
    exerciseId: definition.exerciseId,
    exerciseVersion: definition.exerciseVersion,
    domain: definition.domain,
    objectiveId: definition.objectiveId,
    skill: definition.skill,
    category: definition.category,
    prompt: definition.prompt,
    front: definition.front,
    stimuli: copyJson(definition.stimuli),
    visualAssets,
    answerSpec: copyJson(definition.answerSpec),
    gradingSpec: copyJson(definition.gradingSpec),
    explanation: copyJson(definition.explanation),
    sources: copyJson(definition.sources),
    provenance: copyJson(definition.provenance),
    scopeRequirements: options.scopeRequirements === undefined ? null : copyJson(options.scopeRequirements),
    prerequisites: copyJson(options.prerequisites ?? []),
    relatedKnowledgeBindings: copyJson(definition.relatedKnowledgeBindings),
    pilotMetadata: copyJson(pilotMetadata),
    origin: definition.origin,
    status: definition.status,
    supersedes: options.supersedes === undefined ? null : options.supersedes,
    changeReason: options.changeReason === undefined ? null : options.changeReason,
  });
}

function revisionPayloadOf(value: ExerciseRevisionPayload | ExerciseRevision): ExerciseRevisionPayload {
  const candidate = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(candidate, "contentHash") || Object.prototype.hasOwnProperty.call(candidate, "archiveMetadata")) {
    const { contentHash: _contentHash, archiveMetadata: _archiveMetadata, ...payload } = candidate;
    return payload as ExerciseRevisionPayload;
  }
  return value as ExerciseRevisionPayload;
}

export function getExerciseRevisionPayload(value: ExerciseRevision): ExerciseRevisionPayload {
  return deepFreeze(revisionPayloadOf(value));
}

export function canonicalizeExerciseRevision(value: ExerciseRevisionPayload | ExerciseRevision) {
  return canonicalizeJson(revisionPayloadOf(value));
}

export function hashExerciseRevision(value: ExerciseRevisionPayload | ExerciseRevision) {
  return sha256Hex(canonicalizeExerciseRevision(value));
}

export function createExerciseRevision(
  definition: ExerciseDefinition,
  assets: ReadonlyMap<string, VisualAsset>,
  pilotMetadata: PilotStructuredMetadata,
  options: RevisionScopeOptions & RevisionVersioningOptions & { archiveMetadata?: RevisionArchiveMetadata } = {},
): ExerciseRevision {
  const payload = createExerciseRevisionPayload(definition, assets, pilotMetadata, options);
  const archiveMetadata = options.archiveMetadata === undefined ? undefined : copyJson(options.archiveMetadata);
  const revision = {
    ...payload,
    contentHash: hashExerciseRevision(payload),
    ...(archiveMetadata === undefined ? {} : { archiveMetadata }),
  };
  return deepFreeze(revision);
}

export function revisionIdentityKey(value: RevisionIdentity) {
  return canonicalizeJson([value.projectId, value.exerciseId, value.exerciseVersion]);
}

export function findRevisionIdentityConflict(
  existing: RevisionIdentityEntry | undefined,
  candidate: RevisionIdentityEntry,
): RevisionIdentityConflict | null {
  if (!existing || revisionIdentityKey(existing) !== revisionIdentityKey(candidate)) return null;
  if (existing.contentHash === candidate.contentHash) return null;
  return {
    identityKey: revisionIdentityKey(candidate),
    existingContentHash: existing.contentHash,
    candidateContentHash: candidate.contentHash,
  };
}

export function assertRevisionIdentityAvailable(
  existing: RevisionIdentityEntry | undefined,
  candidate: RevisionIdentityEntry,
) {
  const conflict = findRevisionIdentityConflict(existing, candidate);
  if (conflict) {
    throw new Error(
      `Exercise revision identity collision for ${conflict.identityKey}: ${conflict.existingContentHash} != ${conflict.candidateContentHash}`,
    );
  }
}

function revisionEntryFromRevision(revision: ExerciseRevision, options: ContentReleaseBuildOptions): ContentReleaseRevisionEntry {
  return {
    projectId: revision.projectId,
    exerciseId: revision.exerciseId,
    exerciseVersion: revision.exerciseVersion,
    contentHash: revision.contentHash,
    assets: revision.visualAssets.map((asset) => ({
      assetId: asset.assetId,
      assetVersion: asset.assetVersion,
      src: asset.src,
      checksum: asset.checksum,
    })),
    grader: {
      strategyId: revision.gradingSpec.strategyId,
      strategyVersion: revision.gradingSpec.strategyVersion,
    },
    normalizerVersion: revision.gradingSpec.normalization,
    ...(options.rendererVersion === undefined ? {} : { rendererVersion: options.rendererVersion }),
    ...(options.adapterVersion === undefined ? {} : { adapterVersion: options.adapterVersion }),
  };
}

export function validateContentReleaseManifest(manifest: ContentReleaseManifest): string[] {
  const errors: string[] = [];
  if (manifest.manifestSchemaVersion !== 1) errors.push("manifestSchemaVersion must be 1");
  if (manifest.revisionEntries.length === 0) errors.push("at least one revision entry is required");

  const identities = new Set<string>();
  for (const [index, entry] of manifest.revisionEntries.entries()) {
    const prefix = `revisionEntries[${index}]`;
    if (!entry.projectId.trim()) errors.push(`${prefix}.projectId is required`);
    if (!entry.exerciseId.trim()) errors.push(`${prefix}.exerciseId is required`);
    if (!Number.isInteger(entry.exerciseVersion) || entry.exerciseVersion < 1) errors.push(`${prefix}.exerciseVersion is invalid`);
    if (!/^[0-9a-f]{64}$/.test(entry.contentHash)) errors.push(`${prefix}.contentHash is invalid`);
    const identityKey = revisionIdentityKey(entry);
    if (identities.has(identityKey)) errors.push(`${prefix} duplicates a revision identity`);
    identities.add(identityKey);
    if (entry.assets.length === 0) errors.push(`${prefix}.assets is required`);
    for (const [assetIndex, asset] of entry.assets.entries()) {
      if (!asset.assetId.trim()) errors.push(`${prefix}.assets[${assetIndex}].assetId is required`);
      if (!Number.isInteger(asset.assetVersion) || asset.assetVersion < 1) errors.push(`${prefix}.assets[${assetIndex}].assetVersion is invalid`);
      if (!asset.src.trim()) errors.push(`${prefix}.assets[${assetIndex}].src is required`);
      if (!Object.prototype.hasOwnProperty.call(asset, "checksum")) errors.push(`${prefix}.assets[${assetIndex}].checksum is required`);
    }
    if (!entry.grader.strategyId.trim()) errors.push(`${prefix}.grader.strategyId is required`);
    if (!Number.isInteger(entry.grader.strategyVersion) || entry.grader.strategyVersion < 1) errors.push(`${prefix}.grader.strategyVersion is invalid`);
    if (!entry.normalizerVersion.trim()) errors.push(`${prefix}.normalizerVersion is required`);
    if (entry.rendererVersion !== undefined && !entry.rendererVersion.trim()) errors.push(`${prefix}.rendererVersion is invalid`);
    if (entry.adapterVersion !== undefined && !entry.adapterVersion.trim()) errors.push(`${prefix}.adapterVersion is invalid`);
  }
  return errors;
}

export function canonicalizeContentReleaseManifest(manifest: ContentReleaseManifest) {
  return canonicalizeJson(manifest);
}

export function hashContentReleaseManifest(manifest: ContentReleaseManifest) {
  return sha256Hex(canonicalizeContentReleaseManifest(manifest));
}

export function createContentReleaseManifest(
  revisions: ExerciseRevision[],
  options: Pick<ContentReleaseBuildOptions, "rendererVersion" | "adapterVersion"> = {},
): ContentReleaseManifest {
  const manifest = deepFreeze({
    manifestSchemaVersion: 1 as const,
    revisionEntries: revisions.map((revision) => revisionEntryFromRevision(revision, options)),
  });
  const errors = validateContentReleaseManifest(manifest);
  if (errors.length > 0) throw new Error("Invalid content release manifest: " + errors.join("; "));
  return manifest;
}

export function createContentRelease(
  manifest: ContentReleaseManifest,
  options: Pick<ContentReleaseBuildOptions, "sourceGitSha"> = {},
): ContentRelease {
  const errors = validateContentReleaseManifest(manifest);
  if (errors.length > 0) throw new Error("Invalid content release manifest: " + errors.join("; "));
  const provenance = options.sourceGitSha === undefined ? undefined : { sourceGitSha: options.sourceGitSha };
  return deepFreeze({
    manifest,
    manifestHash: hashContentReleaseManifest(manifest),
    ...(provenance === undefined ? {} : { provenance }),
  });
}
