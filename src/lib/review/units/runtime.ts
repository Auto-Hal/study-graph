import "server-only";
import { getKuzushijiDashboard } from "../../notion/kuzushiji.ts";
import { getPhilosophyGraph } from "../../notion/philosophy-graph.ts";
import { getWesternArtHistoryGraph } from "../../notion/western-art-history-graph.ts";
import { ensureObjectiveArchive, resolveObjectiveInstanceArchive, type ResolvedObjectiveInstanceArchive } from "../../supabase/objective-archive.ts";
import { getObjectiveRuntimeConfig } from "../../supabase/objective-runtime.ts";
import { gradeExerciseRevision, type ExerciseAttemptRequest } from "../exercises/attempt.ts";
import { canonicalizeJson, sha256Hex } from "../exercises/revision.ts";
import { issueObjectiveInstanceV2, newObjectiveIssuanceVersion, submitObjectiveAttemptV2 } from "../objective-runtime.ts";
import { ObjectiveRuntimeError } from "../objective-runtime-core.ts";
import { isPilotIssuanceEnabled } from "../pilot-operations.ts";
import { philosophyPilotEnabled } from "../philosophy-pilot-core.ts";
import { westernArtPilotEnabled } from "../western-art-pilot-core.ts";
import { buildGraphScopeSnapshot, buildKuzushijiScopeSnapshot, type ScopeSnapshot } from "../scope.ts";
import type { ReviewSessionContext } from "../types.ts";
import { getStudyUnit, type StudyUnit, type UnitProjectId } from "./catalog.ts";
import { getUnitExercises } from "./registry.ts";
import { assertUnitRouting, decodeUnitInstance, unitCardFromPersisted, unitPresentation } from "./core.ts";

function unitEnabled(projectId: UnitProjectId) {
  return newObjectiveIssuanceVersion() === "v2" && (projectId === "kuzushiji" ? isPilotIssuanceEnabled()
    : projectId === "philosophy" ? philosophyPilotEnabled(process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED)
      : westernArtPilotEnabled(process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED));
}

export async function readUnitScope(projectId: UnitProjectId): Promise<ScopeSnapshot> {
  if (projectId === "kuzushiji") return buildKuzushijiScopeSnapshot(await getKuzushijiDashboard());
  const graph = await (projectId === "philosophy" ? getPhilosophyGraph() : getWesternArtHistoryGraph());
  return buildGraphScopeSnapshot(projectId, graph);
}

function unitScopeReady(unit: StudyUnit, scope: ScopeSnapshot) {
  return scope.projectId === unit.projectId && scope.sourceState === "ready"
    && getUnitExercises(unit.id).every((entry) => scope.decisions[entry.scopeSubjectId]?.status === "eligible");
}

/** Overview uses only Scope/config reads, never archive or instance writers. */
export async function loadUnitAvailability(unit: StudyUnit): Promise<"ready" | "paused" | "scope-unavailable"> {
  if (!unitEnabled(unit.projectId)) return "paused";
  try {
    getObjectiveRuntimeConfig();
    return unitScopeReady(unit, await readUnitScope(unit.projectId)) ? "ready" : "scope-unavailable";
  } catch { return "scope-unavailable"; }
}

/** A deliberate start issues practice-only instances. Existing SRS state/opportunities are untouched. */
export async function startStudyUnit(unitId: string) {
  const unit = getStudyUnit(unitId);
  if (!unit || !unitEnabled(unit.projectId)) throw new ObjectiveRuntimeError("v2_issuance_disabled");
  const learnerId = getObjectiveRuntimeConfig().learnerId;
  const scope = await readUnitScope(unit.projectId);
  if (!unitScopeReady(unit, scope)) throw new ObjectiveRuntimeError("instance_unavailable");
  const cards = [];
  for (const entry of getUnitExercises(unit.id)) {
    const archive = await ensureObjectiveArchive({ contentRelease: entry.contentRelease, revision: entry.revision,
      objectiveDefinition: entry.objectiveDefinition, exerciseObjectiveBinding: entry.objectiveBinding });
    const presentation = unitPresentation(unit.id, entry);
    const issued = await issueObjectiveInstanceV2({
      releaseId: archive.releaseId, revisionId: archive.revisionId, presentation,
      presentationHash: sha256Hex(canonicalizeJson(presentation)), rendererVersion: null, adapterVersion: null,
      locale: "ja-JP", scopeEvidence: { policyVersion: scope.policyVersion, evaluatedAt: scope.evaluatedAt,
        sourceState: scope.sourceState, subjectId: entry.scopeSubjectId, decision: scope.decisions[entry.scopeSubjectId] },
      knowledgeBinding: { source: "notion", externalId: entry.scopeSubjectId, role: "scope-subject" },
      legacyItemId: entry.scopeSubjectId, legacyItemKind: unit.projectId === "kuzushiji" ? "character" : "knowledge",
      legacyExerciseId: entry.exerciseId, srsEpoch: entry.srsEpoch, intent: "practice",
    });
    const persisted = await resolveObjectiveInstanceArchive(issued.instanceId, learnerId);
    if (!persisted || persisted.learner_id !== learnerId || persisted.instance_id !== issued.instanceId
      || persisted.release_id !== issued.releaseId || persisted.revision_id !== issued.revisionId) throw new ObjectiveRuntimeError("invalid_authority_response");
    cards.push(unitCardFromPersisted(decodeUnitInstance(persisted)));
  }
  const session: ReviewSessionContext = {
    projectId: unit.projectId, projectTitle: unit.projectTitle, projectHref: `/units/${unit.id}`,
    mode: "practice", unitId: unit.id, unitTitle: unit.title, practiceOnly: true,
  };
  return { unitId: unit.id, version: unit.version, cards, session };
}

export async function submitUnitAttempt(request: ExerciseAttemptRequest, persisted: ResolvedObjectiveInstanceArchive) {
  const decoded = decodeUnitInstance(persisted);
  return submitObjectiveAttemptV2(request, {
    grade: async (routing, immutable) => {
      assertUnitRouting(routing, decoded);
      return gradeExerciseRevision(decoded.entry.revisionPayload, immutable.rawAnswer);
    },
    freshScope: async (routing) => {
      assertUnitRouting(routing, decoded);
      const scope = await readUnitScope(decoded.unit.projectId);
      return scope.sourceState === "ready" && scope.decisions[decoded.entry.scopeSubjectId]?.status === "eligible";
    },
    epochActive: async (routing) => { assertUnitRouting(routing, decoded); return true; },
  });
}
