import { NextResponse } from "next/server";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  KUZUSHIJI_PROJECT_ID,
  KUZUSHIJI_V1_PROJECTION_VERSION,
  KUZUSHIJI_V2_PROJECTION_VERSION,
  type KuzushijiV2Projection,
} from "@/src/lib/projects/read-contract";
import { KUZUSHIJI_V2_SOURCE_IDENTIFIERS } from "@/src/lib/projects/project-projections";
import { isScopeKnowledgeSnapshotHashValid } from "@/src/lib/review/offline/snapshot";
import { syncKuzushijiScopeKnowledgeSnapshot } from "@/src/lib/review/snapshot-sync/kuzushiji";
import {
  getCurrentScopeKnowledgeSnapshotModel,
  getSnapshotRuntimeConfig,
} from "@/src/lib/supabase/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXPECTED_SUPABASE_HOST = "uhckdhdkywhsqjcquvyj.supabase.co";
const EXPECTED_V1_SNAPSHOT_ID = "c13ad235-fa96-49b0-92ac-8e0817369241";
const EXPECTED_V1_CONTENT_HASH = "f3dc577e0d1d36bf26347c7d4052f232775b44de08ec3512809af87b238573b8";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), { status, headers: NO_STORE_HEADERS });
}

function safeErrorCode(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[a-z0-9_-]{1,120}$/i.test(error.code)
  ) {
    return error.code;
  }
  return error instanceof Error && /^[a-z0-9_-]{1,120}$/i.test(error.message)
    ? error.message
    : "kuzushiji_v2_publish_failed";
}

function runtimeReady() {
  if (process.env.VERCEL_ENV !== "production") return false;

  const notionToken =
    process.env.NOTION_TOKEN?.trim() ||
    process.env.StudyGraph_NOTION_TOKEN?.trim();
  if (!notionToken) return false;

  const supabase = getSnapshotRuntimeConfig();
  if (!supabase) return false;

  try {
    return new URL(supabase.url).host === EXPECTED_SUPABASE_HOST;
  } catch {
    return false;
  }
}

function scopeFingerprint(value: readonly unknown[]) {
  return JSON.stringify(value);
}

function sameDeclaredSources(value: readonly string[]) {
  return (
    value.length === KUZUSHIJI_V2_SOURCE_IDENTIFIERS.length
    && new Set(value).size === value.length
    && value.every((id) => (KUZUSHIJI_V2_SOURCE_IDENTIFIERS as readonly string[]).includes(id))
  );
}

async function readExpectedV1() {
  const current = await getCurrentScopeKnowledgeSnapshotModel(KUZUSHIJI_PROJECT_ID);
  if (!current) throw new Error("preflight_missing_current");

  if (
    current.snapshotId !== EXPECTED_V1_SNAPSHOT_ID
    || current.generation !== 1
    || current.knowledgeProjectionVersion !== KUZUSHIJI_V1_PROJECTION_VERSION
    || current.scopePolicyVersion !== "phase4b-v1"
    || current.contentHash !== EXPECTED_V1_CONTENT_HASH
    || current.scopeDecisions.length !== 3
  ) {
    throw new Error("preflight_current_changed");
  }

  if (!isScopeKnowledgeSnapshotHashValid(current)) {
    throw new Error("preflight_hash_invalid");
  }

  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(current));
  if (
    decoded.projectId !== KUZUSHIJI_PROJECT_ID
    || decoded.projectionVersion !== KUZUSHIJI_V1_PROJECTION_VERSION
    || decoded.policyVersion !== "phase4b-v1"
  ) {
    throw new Error("preflight_decoder_mismatch");
  }

  return current;
}

async function verifyPublishedV2(
  expected: { generation: number; snapshotId: string; contentHash: string },
  previousScope: readonly unknown[],
) {
  const current = await getCurrentScopeKnowledgeSnapshotModel(KUZUSHIJI_PROJECT_ID);
  if (!current) throw new Error("published_snapshot_missing");

  if (
    current.generation !== expected.generation
    || current.snapshotId !== expected.snapshotId
    || current.contentHash !== expected.contentHash
  ) {
    throw new Error("published_snapshot_mismatch");
  }

  if (
    current.generation !== 2
    || current.knowledgeProjectionVersion !== KUZUSHIJI_V2_PROJECTION_VERSION
    || current.scopePolicyVersion !== "phase4b-v1"
  ) {
    throw new Error("published_version_mismatch");
  }

  if (!isScopeKnowledgeSnapshotHashValid(current)) {
    throw new Error("published_hash_invalid");
  }

  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(current));
  if (
    decoded.projectId !== KUZUSHIJI_PROJECT_ID
    || decoded.projectionVersion !== KUZUSHIJI_V2_PROJECTION_VERSION
    || decoded.policyVersion !== "phase4b-v1"
  ) {
    throw new Error("published_decoder_mismatch");
  }

  if (scopeFingerprint(decoded.subjectObservations) !== scopeFingerprint(previousScope)) {
    throw new Error("published_scope_changed");
  }

  if (
    !sameDeclaredSources(decoded.sourceEvidence.sourceIdentifiers)
    || decoded.sourceEvidence.paginationComplete !== true
    || decoded.sourceEvidence.relationCompleteness !== true
  ) {
    throw new Error("published_source_evidence_invalid");
  }

  const projection = decoded.projection as KuzushijiV2Projection;
  if (projection.completeness.unresolvedTargets.length !== 0) {
    throw new Error("published_unresolved_targets");
  }

  return {
    generation: decoded.generation,
    snapshotId: decoded.snapshotId,
    contentHash: decoded.contentHash,
    projectionVersion: decoded.projectionVersion,
    scopePolicyVersion: decoded.policyVersion,
    scopeDecisionCount: decoded.subjectObservations.length,
    sourceIdentifierCount: decoded.sourceEvidence.sourceIdentifiers.length,
    counts: {
      lectures: projection.lectures.length,
      characters: projection.characters.length,
      mistakes: projection.mistakes.length,
      sources: projection.sources.length,
      expressions: projection.expressions.length,
      reviewQueue: projection.reviewQueue.length,
      relations: projection.relations.length,
      relationProperties: projection.completeness.relationProperties.length,
      unresolvedTargets: projection.completeness.unresolvedTargets.length,
    },
    hashValid: true,
    decoderValid: true,
    scopeEquivalentToGeneration1: true,
  };
}

/**
 * Temporary one-shot POST-only Production operation for Issue #73.
 * No GET handler is exported: navigation/render/prefetch cannot mutate state.
 */
export async function POST() {
  if (!runtimeReady()) return json({ error: "not_found" }, 404);

  let previous;
  try {
    previous = await readExpectedV1();
  } catch (error) {
    return json({ ok: false, stage: "preflight", error: safeErrorCode(error) }, 409);
  }

  try {
    const published = await syncKuzushijiScopeKnowledgeSnapshot();
    const verified = await verifyPublishedV2(
      {
        generation: published.generation,
        snapshotId: published.snapshotId,
        contentHash: published.contentHash,
      },
      previous.scopeDecisions,
    );
    return json({ ok: true, projectId: KUZUSHIJI_PROJECT_ID, published: verified });
  } catch (error) {
    return json({ ok: false, stage: "publish", error: safeErrorCode(error) }, 503);
  }
}
