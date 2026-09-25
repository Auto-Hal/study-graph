import "server-only";

import type { GraphData } from "../graph/types.ts";
import { getPhilosophyGraph } from "../notion/philosophy-graph.ts";
import { ensureObjectiveArchive, resolveObjectiveInstanceArchive, type ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { getObjectiveRuntimeConfig } from "../supabase/objective-runtime.ts";
import { gradeExerciseRevision, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { philosophyObjectiveRegistry, type PhilosophyObjectiveEntry } from "./philosophy-objective-registry.ts";
import { issueObjectiveInstanceV2, newObjectiveIssuanceVersion, submitObjectiveAttemptV2 } from "./objective-runtime.ts";
import { ObjectiveRuntimeError, type ObjectiveInstanceRouting } from "./objective-runtime-core.ts";
import { createPhilosophyPresentation, decodePhilosophyInstance, hashPhilosophyPresentation, philosophyCardFromPersisted, philosophyPilotEnabled } from "./philosophy-pilot-core.ts";
import { buildGraphScopeSnapshot, type ScopeSnapshot } from "./scope.ts";

export function isPhilosophyPilotIssuanceEnabled(): boolean {
  return philosophyPilotEnabled(process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED);
}

function scopeEligible(scope: ScopeSnapshot, entry: PhilosophyObjectiveEntry): boolean {
  return scope.projectId === "philosophy" && scope.sourceState === "ready"
    && scope.decisions[entry.scopeSubjectId]?.status === "eligible";
}

/** Scheduled issuance is always decided by the DB under the Objective lock. */
export async function issuePhilosophyObjectiveCard(scope: ScopeSnapshot, entry: PhilosophyObjectiveEntry = philosophyObjectiveRegistry[1]) {
  if (!isPhilosophyPilotIssuanceEnabled() || newObjectiveIssuanceVersion() !== "v2" || !scopeEligible(scope, entry)) return null;
  const archive = await ensureObjectiveArchive({
    contentRelease: entry.contentRelease,
    revision: entry.revision,
    objectiveDefinition: entry.objectiveDefinition,
    exerciseObjectiveBinding: entry.objectiveBinding,
  });
  const presentation = createPhilosophyPresentation(entry.revisionPayload, entry);
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
  const decoded = decodePhilosophyInstance(persisted, issued);
  if (decoded.entry.exerciseId !== entry.exerciseId) throw new ObjectiveRuntimeError("invalid_authority_response");
  return philosophyCardFromPersisted(decoded, issued.opportunityKind);
}

/** An independent failure or not-due result never suppresses another eligible Objective. */
export async function issuePhilosophyObjectiveCards(scope: ScopeSnapshot) {
  const cards = [];
  for (const entry of philosophyObjectiveRegistry) {
    if (!scopeEligible(scope, entry)) continue;
    try {
      const card = await issuePhilosophyObjectiveCard(scope, entry);
      if (card) cards.push(card);
    } catch (error) {
      if (!(error instanceof ObjectiveRuntimeError && error.code === "objective_not_due")) {
        console.warn("Study Graph: Philosophy Objective issuance unavailable", {
          code: error instanceof ObjectiveRuntimeError ? error.code : "philosophy_pilot_unavailable",
          exerciseId: entry.exerciseId,
        });
      }
    }
  }
  return cards;
}

function assertPhilosophyRouting(routing: ObjectiveInstanceRouting, persisted: ResolvedObjectiveInstanceArchive, entry: PhilosophyObjectiveEntry) {
  if (routing.instanceId !== persisted.instance_id || routing.projectId !== "philosophy"
    || routing.objectiveId !== entry.objectiveId || routing.objectiveVersion !== entry.objectiveDefinition.objectiveVersion
    || routing.srsEpoch !== entry.srsEpoch || routing.evidenceUse !== "srs"
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
      assertPhilosophyRouting(routing, persisted, decoded.entry);
      return gradeExerciseRevision(decoded.revision, immutableRequest.rawAnswer);
    },
    freshScope: async (routing) => {
      assertPhilosophyRouting(routing, persisted, decoded.entry);
      if (persisted.legacy_item_id !== decoded.entry.scopeSubjectId) throw new ObjectiveRuntimeError("invalid_authority_response");
      const graph = await readFreshGraph();
      const scope = buildGraphScopeSnapshot("philosophy", graph);
      return graph.mode === "notion" && scopeEligible(scope, decoded.entry);
    },
    epochActive: async (routing) => {
      assertPhilosophyRouting(routing, persisted, decoded.entry);
      return String(persisted.srs_epoch) === String(decoded.entry.srsEpoch);
    },
  });
}
