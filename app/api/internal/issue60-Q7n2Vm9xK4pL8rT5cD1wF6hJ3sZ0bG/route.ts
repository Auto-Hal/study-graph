import { NextResponse } from "next/server";
import {
  adaptScopeKnowledgeSnapshot,
  decodeProjectReadSnapshot,
  PHILOSOPHY_PROJECT_ID,
  WESTERN_ART_HISTORY_PROJECT_ID,
} from "@/src/lib/projects/read-contract";
import { isScopeKnowledgeSnapshotHashValid } from "@/src/lib/review/offline/snapshot";
import {
  syncPhilosophySnapshot,
  syncWesternArtHistorySnapshot,
} from "@/src/lib/review/snapshot-sync/projects";
import {
  getCurrentScopeKnowledgeSnapshotModel,
  getSnapshotRuntimeConfig,
} from "@/src/lib/supabase/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXPECTED_SUPABASE_HOST = "uhckdhdkywhsqjcquvyj.supabase.co";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json",
};

type BootstrapProjectId =
  | typeof WESTERN_ART_HISTORY_PROJECT_ID
  | typeof PHILOSOPHY_PROJECT_ID;

type VerifiedProjectSummary = Readonly<{
  projectId: BootstrapProjectId;
  status: "published" | "already-published";
  generation: number;
  snapshotId: string;
  contentHash: string;
  projectionVersion: string;
  scopePolicyVersion: string;
  scopeDecisionCount: number;
  sourceEvidenceKeys: readonly string[];
  hashValid: true;
  decoderValid: true;
  counts: Readonly<Record<string, number>>;
}>;

function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: NO_STORE_HEADERS,
  });
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
  return "bootstrap_failed";
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

function projectionCounts(
  projectId: BootstrapProjectId,
  projection: unknown,
): Readonly<Record<string, number>> {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw new Error("projection_missing");
  }

  const value = projection as Record<string, unknown>;
  const count = (key: string) => {
    const items = value[key];
    if (!Array.isArray(items)) throw new Error(`projection_count_missing_${key}`);
    return items.length;
  };

  const completeness = value.completeness;
  if (
    !completeness ||
    typeof completeness !== "object" ||
    Array.isArray(completeness)
  ) {
    throw new Error("projection_completeness_missing");
  }
  const completenessRecord = completeness as Record<string, unknown>;
  const relationProperties = completenessRecord.relationProperties;
  const unresolvedTargets = completenessRecord.unresolvedTargets;
  if (!Array.isArray(relationProperties) || !Array.isArray(unresolvedTargets)) {
    throw new Error("projection_completeness_invalid");
  }

  if (projectId === WESTERN_ART_HISTORY_PROJECT_ID) {
    return {
      lectures: count("lectures"),
      artists: count("artists"),
      artworks: count("artworks"),
      movements: count("movements"),
      terms: count("terms"),
      periods: count("periods"),
      culture: count("culture"),
      museums: count("museums"),
      relations: count("relations"),
      relationProperties: relationProperties.length,
      unresolvedTargets: unresolvedTargets.length,
    };
  }

  return {
    lectures: count("lectures"),
    philosophers: count("philosophers"),
    terms: count("terms"),
    problems: count("problems"),
    works: count("works"),
    culture: count("culture"),
    periods: count("periods"),
    thoughtNotes: count("thoughtNotes"),
    relations: count("relations"),
    relationProperties: relationProperties.length,
    unresolvedTargets: unresolvedTargets.length,
  };
}

async function verifyStored(
  projectId: BootstrapProjectId,
  status: VerifiedProjectSummary["status"],
  expected?: {
    generation: number;
    snapshotId: string;
    contentHash: string;
  },
): Promise<VerifiedProjectSummary> {
  const stored = await getCurrentScopeKnowledgeSnapshotModel(projectId);
  if (!stored) throw new Error("published_snapshot_missing");

  if (
    expected &&
    (stored.generation !== expected.generation ||
      stored.snapshotId !== expected.snapshotId ||
      stored.contentHash !== expected.contentHash)
  ) {
    throw new Error("published_snapshot_mismatch");
  }

  if (!isScopeKnowledgeSnapshotHashValid(stored)) {
    throw new Error("stored_hash_invalid");
  }

  const decoded = decodeProjectReadSnapshot(adaptScopeKnowledgeSnapshot(stored));
  if (decoded.projectId !== projectId) throw new Error("stored_project_mismatch");

  return {
    projectId,
    status,
    generation: stored.generation,
    snapshotId: stored.snapshotId,
    contentHash: stored.contentHash,
    projectionVersion: decoded.projectionVersion,
    scopePolicyVersion: decoded.policyVersion,
    scopeDecisionCount: decoded.subjectObservations.length,
    sourceEvidenceKeys: Object.keys(decoded.sourceEvidence).sort(),
    hashValid: true,
    decoderValid: true,
    counts: projectionCounts(projectId, decoded.projection),
  };
}

async function bootstrapProject(
  projectId: BootstrapProjectId,
): Promise<VerifiedProjectSummary> {
  const existing = await getCurrentScopeKnowledgeSnapshotModel(projectId);
  if (existing) {
    return verifyStored(projectId, "already-published");
  }

  const published =
    projectId === WESTERN_ART_HISTORY_PROJECT_ID
      ? await syncWesternArtHistorySnapshot()
      : await syncPhilosophySnapshot();

  return verifyStored(projectId, "published", {
    generation: published.generation,
    snapshotId: published.snapshotId,
    contentHash: published.contentHash,
  });
}

/**
 * Temporary one-shot Production bootstrap entrypoint for Issue #60.
 *
 * Safety:
 * - secret, unlinked route path;
 * - Production-only;
 * - fixed two-project allowlist;
 * - no caller-supplied project/source/credential input;
 * - current-snapshot guard prevents a second generation on repeat requests;
 * - returns only IDs/hashes/counts, never credentials or raw source content.
 *
 * Remove immediately after Issue #60 is completed or fail-closed diagnosis is
 * captured.
 */
export async function GET() {
  if (!runtimeReady()) {
    return json({ error: "not_found" }, 404);
  }

  const results: VerifiedProjectSummary[] = [];
  for (const projectId of [
    WESTERN_ART_HISTORY_PROJECT_ID,
    PHILOSOPHY_PROJECT_ID,
  ] as const) {
    try {
      results.push(await bootstrapProject(projectId));
    } catch (error) {
      return json(
        {
          ok: false,
          failedProjectId: projectId,
          error: safeErrorCode(error),
          completed: results,
        },
        503,
      );
    }
  }

  return json({ ok: true, projects: results });
}
