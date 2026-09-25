import "server-only";

import type { ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { getPhilosophyObjectiveByExerciseId } from "./philosophy-objective-registry.ts";
import { ObjectiveRuntimeError, objectiveRuntimeFailure } from "./objective-runtime-core.ts";
import { recoverAcceptedPilotAttempt, submitKuzushijiPilotAttempt } from "./pilot-runtime.ts";
import { submitPhilosophyObjectiveAttempt } from "./philosophy-pilot-runtime.ts";
import { PhilosophyPilotInvariantError } from "./philosophy-pilot-core.ts";
import { getObjectiveRuntimeConfig } from "../supabase/objective-runtime.ts";
import { resolveObjectiveInstanceArchive, ObjectiveArchiveRpcError } from "../supabase/objective-archive.ts";
import { PilotRpcError } from "../supabase/pilot.ts";

/** The six-field browser tuple never selects a project or acceptance writer. */
export async function submitVersionedPilotAttempt(request: ExerciseAttemptRequest) {
  const recovered = await recoverAcceptedPilotAttempt(request);
  if (recovered.result) return recovered.result;

  try {
    const learnerId = getObjectiveRuntimeConfig().learnerId;
    const persisted = await resolveObjectiveInstanceArchive(recovered.immutableRequest.instanceId, learnerId);
    if (!persisted) throw new PilotRpcError("instance_not_found", 404, "instance_not_found");
    if (persisted.instance_id !== recovered.immutableRequest.instanceId || persisted.learner_id !== learnerId) {
      throw new PilotRpcError("pilot_instance_mismatch", 409, "pilot_instance_mismatch");
    }
    if (persisted.project_id === "kuzushiji") {
      return await submitKuzushijiPilotAttempt(recovered.immutableRequest);
    }
    if (persisted.project_id === "philosophy" && getPhilosophyObjectiveByExerciseId(persisted.exercise_id)) {
      return await submitPhilosophyObjectiveAttempt(recovered.immutableRequest, persisted);
    }
    throw new PilotRpcError("unsupported_pilot_instance", 409, "unsupported_pilot_instance");
  } catch (error) {
    if (error instanceof PilotRpcError) throw error;
    if (error instanceof ObjectiveRuntimeError) {
      const failure = objectiveRuntimeFailure(error);
      throw new PilotRpcError(failure.error, failure.status, failure.error);
    }
    if (error instanceof PhilosophyPilotInvariantError) {
      throw new PilotRpcError("pilot_instance_mismatch", 409, "pilot_instance_mismatch");
    }
    if (error instanceof ObjectiveArchiveRpcError) {
      throw new PilotRpcError("pilot_instance_unavailable", 503, "pilot_instance_unavailable");
    }
    throw new PilotRpcError("pilot_attempt_unavailable", 503, "pilot_attempt_unavailable");
  }
}
