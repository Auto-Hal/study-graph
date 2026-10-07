import "server-only";
import { cache } from "react";

import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import type { StudyProjectDefinition } from "@/src/lib/projects/registry";
import { getPilotRuntimeConfig, getObjectiveReviewSchedule } from "@/src/lib/supabase/pilot";
import { loadReviewScheduleState } from "@/src/lib/supabase/review";
import { buildGraphScopeSnapshot, buildKuzushijiScopeSnapshot } from "./scope";
import { loadReviewGraphPracticeSource } from "./graph-practice-source";
import { kuzushijiVisualCandidates, graphLegacyCandidates } from "./candidates";
import { philosophyObjectiveRegistry, philosophyObjectiveScopeSubjectIds } from "./philosophy-objective-registry";
import { westernArtObjectiveRegistry, westernArtObjectiveScopeSubjectIds } from "./western-art-objective-registry";
import { KUZUSHIJI_PILOT_OBJECTIVE_ID, KUZUSHIJI_PILOT_SRS_EPOCH } from "./exercises/kuzushiji-objective";
import { isPilotIssuanceEnabled } from "./pilot-operations";
import { isPhilosophyPilotIssuanceEnabled } from "./philosophy-pilot-runtime";
import { isWesternArtPilotIssuanceEnabled } from "./western-art-pilot-runtime";
import { newObjectiveIssuanceVersion } from "./objective-runtime";
import { summarizeReviewAvailability, unavailableReviewAvailability, type ReviewCandidate, type ReviewAvailability } from "./availability-core";

// Deduplicate within one rendered page only; never cache a schedule across requests.
const objectiveSchedule = cache(async () => {
  if (!getPilotRuntimeConfig()) return null;
  try { return await getObjectiveReviewSchedule(); }
  catch { return null; }
});
const legacySchedule = cache(loadReviewScheduleState);

/** Entry-only observation. Does not issue exercises, publish snapshots, or save answers.
 * Current graph snapshots omit the lecture scope evidence used by issuance, so
 * this panel shares its fresh read-only source with Review. Content pages retain
 * the verified snapshot path. A session rechecks scope and DB under its lock.
 */
export async function loadReviewAvailability(project: StudyProjectDefinition): Promise<ReviewAvailability> {
  const v2 = newObjectiveIssuanceVersion() === "v2";
  try {
    if (project.id === "kuzushiji") {
      if (!isPilotIssuanceEnabled() || !v2) return {
        status: "paused", due: 0, new: 0, practice: 0, nextDueAt: null, pausedObjectives: true,
      };
      const [data, states] = await Promise.all([getKuzushijiDashboard(), objectiveSchedule()]);
      const scope = buildKuzushijiScopeSnapshot(data);
      if (data.mode !== "notion" || scope.sourceState !== "ready") return unavailableReviewAvailability();
      const candidates = kuzushijiVisualCandidates(project, data, scope);
      return summarizeReviewAvailability({ projectId: project.id,
        objectives: candidates.length > 0 ? [{ kind: "objective", id: KUZUSHIJI_PILOT_OBJECTIVE_ID, epoch: KUZUSHIJI_PILOT_SRS_EPOCH }] : [],
        legacy: [], objectiveStates: states, legacyReady: true, sessionSize: 1, pausedObjectives: false, now: Date.now() });
    }
    const philosophy = project.id === "philosophy";
    const subjectOn = philosophy ? isPhilosophyPilotIssuanceEnabled() : isWesternArtPilotIssuanceEnabled();
    const [graph, objectiveStates, legacy] = await Promise.all([
      loadReviewGraphPracticeSource(project.id as "philosophy" | "western-art-history"),
      subjectOn && v2 ? objectiveSchedule() : Promise.resolve(null), legacySchedule(),
    ]);
    const scope = buildGraphScopeSnapshot(project.id as "philosophy" | "western-art-history", graph);
    if (graph.mode !== "notion" || scope.sourceState !== "ready") return unavailableReviewAvailability();
    const registry = philosophy ? philosophyObjectiveRegistry : westernArtObjectiveRegistry;
    const eligible = registry.filter((entry) => scope.decisions[entry.scopeSubjectId]?.status === "eligible");
    const objectives: ReviewCandidate[] = subjectOn && v2
      ? eligible.map((entry) => ({ kind: "objective", id: entry.objectiveId, epoch: entry.srsEpoch })) : [];
    const now = Date.now();
    const cards = graphLegacyCandidates({ project, graph, scope,
      excludedIds: subjectOn ? philosophy ? philosophyObjectiveScopeSubjectIds : westernArtObjectiveScopeSubjectIds : [],
      states: legacy.states, persisted: legacy.persistence === "supabase" });
    return summarizeReviewAvailability({ projectId: project.id, objectives,
      legacy: cards.map(({ card, state }) => ({ candidate: { kind: "legacy", id: card.id }, dueAt: state?.due_at ?? null })),
      objectiveStates, legacyReady: legacy.persistence === "supabase", sessionSize: project.review.sessionSize,
      pausedObjectives: subjectOn && !v2 && eligible.length > 0, now });
  } catch { return unavailableReviewAvailability(); }
}
