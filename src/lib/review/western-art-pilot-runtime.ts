import "server-only";

import type { GraphData } from "../graph/types.ts";
import { getWesternArtHistoryGraph } from "../notion/western-art-history-graph.ts";
import { ensureObjectiveArchive, resolveObjectiveInstanceArchive, type ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { getObjectiveRuntimeConfig } from "../supabase/objective-runtime.ts";
import { gradeExerciseRevision, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { issueObjectiveInstanceV2, newObjectiveIssuanceVersion, submitObjectiveAttemptV2 } from "./objective-runtime.ts";
import { ObjectiveRuntimeError, type ObjectiveInstanceRouting } from "./objective-runtime-core.ts";
import { buildGraphScopeSnapshot, type ScopeSnapshot } from "./scope.ts";
import { westernArtObjective, westernArtObjectiveRegistry, type WesternArtObjectiveEntry } from "./western-art-objective-registry.ts";
import {
  createWesternArtPresentation,
  decodeWesternArtInstance,
  hashWesternArtPresentation,
  westernArtCardFromPersisted,
  westernArtPilotEnabled,
} from "./western-art-pilot-core.ts";

export function isWesternArtPilotIssuanceEnabled(): boolean {
  return westernArtPilotEnabled(process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED);
}

function scopeEligible(scope: ScopeSnapshot, entry: WesternArtObjectiveEntry): boolean {
  return scope.projectId === "western-art-history" && scope.sourceState === "ready"
    && scope.decisions[entry.scopeSubjectId]?.status === "eligible";
}

export async function issueWesternArtObjectiveCard(
  scope: ScopeSnapshot,
  entry: WesternArtObjectiveEntry = westernArtObjective,
) {
  if (!isWesternArtPilotIssuanceEnabled() || newObjectiveIssuanceVersion() !== "v2" || !scopeEligible(scope, entry)) {
    return null;
  }
  const archive = await ensureObjectiveArchive({
    contentRelease: entry.contentRelease,
    revision: entry.revision,
    objectiveDefinition: entry.objectiveDefinition,
    exerciseObjectiveBinding: entry.objectiveBinding,
  });
  const presentation = createWesternArtPresentation(entry.revisionPayload, entry);
  const issued = await issueObjectiveInstanceV2({
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    presentation,
    presentationHash: hashWesternArtPresentation(presentation),
    rendererVersion: null,
    adapterVersion: null,
    locale: "ja-JP",
    scopeEvidence: {
      policyVersion: scope.policyVersion,
      evaluatedAt: scope.evaluatedAt,
      sourceState: scope.sourceState,
      subjectId: entry.scopeSubjectId,
      decision: scope.decisions[entry.scopeSubjectId],
    },
    knowledgeBinding: { source: "notion", externalId: entry.scopeSubjectId, role: "scope-subject" },
    legacyItemId: entry.scopeSubjectId,
    legacyItemKind: "knowledge",
    legacyExerciseId: entry.exerciseId,
    srsEpoch: entry.srsEpoch,
    intent: "scheduled",
  });
  const learnerId = getObjectiveRuntimeConfig().learnerId;
  const persisted = await resolveObjectiveInstanceArchive(issued.instanceId, learnerId);
  if (!persisted) throw new ObjectiveRuntimeError("instance_unavailable");
  if (persisted.learner_id !== learnerId) throw new ObjectiveRuntimeError("invalid_authority_response");
  const decoded = decodeWesternArtInstance(persisted, issued);
  if (decoded.entry.exerciseId !== entry.exerciseId) throw new ObjectiveRuntimeError("invalid_authority_response");
  return westernArtCardFromPersisted(decoded, issued.opportunityKind);
}

/** A failure or not-due result for one Objective cannot suppress another. */
export async function issueWesternArtObjectiveCards(scope: ScopeSnapshot) {
  const cards = [];
  for (const entry of westernArtObjectiveRegistry) {
    if (!scopeEligible(scope, entry)) continue;
    try {
      const card = await issueWesternArtObjectiveCard(scope, entry);
      if (card) cards.push(card);
    } catch (error) {
      if (!(error instanceof ObjectiveRuntimeError && error.code === "objective_not_due")) {
        console.warn("Study Graph: Western Art Objective issuance unavailable", {
          code: error instanceof ObjectiveRuntimeError ? error.code : "western_art_pilot_unavailable",
          exerciseId: entry.exerciseId,
        });
      }
    }
  }
  return cards;
}

function assertWesternArtRouting(
  routing: ObjectiveInstanceRouting,
  persisted: ResolvedObjectiveInstanceArchive,
  entry: WesternArtObjectiveEntry,
) {
  if (routing.instanceId !== persisted.instance_id || routing.projectId !== "western-art-history"
    || routing.objectiveId !== entry.objectiveId
    || routing.objectiveVersion !== entry.objectiveDefinition.objectiveVersion
    || routing.srsEpoch !== entry.srsEpoch || routing.evidenceUse !== "srs"
    || routing.acceptanceVersion !== "v2") {
    throw new ObjectiveRuntimeError("acceptance_version_mismatch");
  }
}

export async function submitWesternArtObjectiveAttempt(
  request: ExerciseAttemptRequest,
  persisted: ResolvedObjectiveInstanceArchive,
  readFreshGraph: () => Promise<GraphData> = getWesternArtHistoryGraph,
) {
  const decoded = decodeWesternArtInstance(persisted);
  return submitObjectiveAttemptV2(request, {
    grade: async (routing, immutableRequest) => {
      assertWesternArtRouting(routing, persisted, decoded.entry);
      return gradeExerciseRevision(decoded.revision, immutableRequest.rawAnswer);
    },
    freshScope: async (routing) => {
      assertWesternArtRouting(routing, persisted, decoded.entry);
      if (persisted.legacy_item_id !== decoded.entry.scopeSubjectId) {
        throw new ObjectiveRuntimeError("invalid_authority_response");
      }
      const graph = await readFreshGraph();
      const scope = buildGraphScopeSnapshot("western-art-history", graph);
      return graph.mode === "notion" && scopeEligible(scope, decoded.entry);
    },
    epochActive: async (routing) => {
      assertWesternArtRouting(routing, persisted, decoded.entry);
      return String(persisted.srs_epoch) === String(decoded.entry.srsEpoch);
    },
  });
}
