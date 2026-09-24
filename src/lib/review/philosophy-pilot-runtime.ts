import "server-only";

import type { GraphData } from "../graph/types.ts";
import { getPhilosophyGraph } from "../notion/philosophy-graph.ts";
import { ensureObjectiveArchive, resolveObjectiveInstanceArchive, type ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { getObjectiveRuntimeConfig } from "../supabase/objective-runtime.ts";
import { gradeExerciseRevision, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import {
  PHILOSOPHY_ARCHE_EXERCISE_ID, PHILOSOPHY_ARCHE_SRS_EPOCH, PHILOSOPHY_ARCHE_TERM_ID,
  philosophyArcheContentRelease, philosophyArcheObjectiveBinding, philosophyArcheObjectiveDefinition,
  philosophyArcheRevision, philosophyArcheRevisionPayload,
} from "./exercises/philosophy-anaximander.ts";
import { issueObjectiveInstanceV2, newObjectiveIssuanceVersion, submitObjectiveAttemptV2 } from "./objective-runtime.ts";
import { ObjectiveRuntimeError, type ObjectiveInstanceRouting } from "./objective-runtime-core.ts";
import { createPhilosophyPresentation, decodePhilosophyInstance, hashPhilosophyPresentation, philosophyCardFromPersisted, philosophyPilotEnabled } from "./philosophy-pilot-core.ts";
import { buildGraphScopeSnapshot, type ScopeSnapshot } from "./scope.ts";

export function isPhilosophyPilotIssuanceEnabled(): boolean {
  return philosophyPilotEnabled(process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED);
}

function scopeEligible(scope: ScopeSnapshot): boolean {
  return scope.projectId === "philosophy" && scope.sourceState === "ready"
    && scope.decisions[PHILOSOPHY_ARCHE_TERM_ID]?.status === "eligible";
}

/** Scheduled issuance is always decided by the DB under the Objective lock. */
export async function issuePhilosophyObjectiveCard(scope: ScopeSnapshot) {
  if (!isPhilosophyPilotIssuanceEnabled() || newObjectiveIssuanceVersion() !== "v2" || !scopeEligible(scope)) return null;
  const archive = await ensureObjectiveArchive({
    contentRelease: philosophyArcheContentRelease,
    revision: philosophyArcheRevision,
    objectiveDefinition: philosophyArcheObjectiveDefinition,
    exerciseObjectiveBinding: philosophyArcheObjectiveBinding,
  });
  const presentation = createPhilosophyPresentation(philosophyArcheRevisionPayload);
  const issued = await issueObjectiveInstanceV2({
    releaseId: archive.releaseId,
    revisionId: archive.revisionId,
    presentation,
    presentationHash: hashPhilosophyPresentation(presentation),
    rendererVersion: null,
    adapterVersion: null,
    locale: "ja-JP",
    scopeEvidence: {
      policyVersion: scope.policyVersion,
      evaluatedAt: scope.evaluatedAt,
      sourceState: scope.sourceState,
      subjectId: PHILOSOPHY_ARCHE_TERM_ID,
      decision: scope.decisions[PHILOSOPHY_ARCHE_TERM_ID],
    },
    knowledgeBinding: { source: "notion", externalId: PHILOSOPHY_ARCHE_TERM_ID, role: "scope-subject" },
    legacyItemId: PHILOSOPHY_ARCHE_TERM_ID,
    legacyItemKind: "knowledge",
    legacyExerciseId: PHILOSOPHY_ARCHE_EXERCISE_ID,
    srsEpoch: PHILOSOPHY_ARCHE_SRS_EPOCH,
    intent: "scheduled",
  });
  const learnerId = getObjectiveRuntimeConfig().learnerId;
  const persisted = await resolveObjectiveInstanceArchive(issued.instanceId, learnerId);
  if (!persisted) throw new ObjectiveRuntimeError("instance_unavailable");
  if (persisted.learner_id !== learnerId) throw new ObjectiveRuntimeError("invalid_authority_response");
  const decoded = decodePhilosophyInstance(persisted, issued);
  return philosophyCardFromPersisted(decoded, issued.opportunityKind);
}

function assertPhilosophyRouting(routing: ObjectiveInstanceRouting, persisted: ResolvedObjectiveInstanceArchive) {
  if (routing.instanceId !== persisted.instance_id || routing.projectId !== "philosophy"
    || routing.objectiveId !== PHILOSOPHY_ARCHE_EXERCISE_ID || routing.objectiveVersion !== 1
    || routing.srsEpoch !== PHILOSOPHY_ARCHE_SRS_EPOCH || routing.evidenceUse !== "srs"
    || routing.acceptanceVersion !== "v2") throw new ObjectiveRuntimeError("acceptance_version_mismatch");
}

/** Persisted archive, fresh Notion Scope and trusted epoch are the only project authorities. */
export async function submitPhilosophyObjectiveAttempt(
  request: ExerciseAttemptRequest,
  persisted: ResolvedObjectiveInstanceArchive,
  readFreshGraph: () => Promise<GraphData> = getPhilosophyGraph,
) {
  const decoded = decodePhilosophyInstance(persisted);
  return submitObjectiveAttemptV2(request, {
    grade: async (routing, immutableRequest) => {
      assertPhilosophyRouting(routing, persisted);
      return gradeExerciseRevision(decoded.revision, immutableRequest.rawAnswer);
    },
    freshScope: async (routing) => {
      assertPhilosophyRouting(routing, persisted);
      if (persisted.legacy_item_id !== PHILOSOPHY_ARCHE_TERM_ID) throw new ObjectiveRuntimeError("invalid_authority_response");
      const graph = await readFreshGraph();
      const scope = buildGraphScopeSnapshot("philosophy", graph);
      return graph.mode === "notion" && scopeEligible(scope);
    },
    epochActive: async (routing) => {
      assertPhilosophyRouting(routing, persisted);
      return String(persisted.srs_epoch) === String(PHILOSOPHY_ARCHE_SRS_EPOCH);
    },
  });
}
