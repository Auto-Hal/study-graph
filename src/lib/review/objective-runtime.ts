import "server-only";

import { callObjectiveRpc, getObjectiveRuntimeConfig, type ObjectiveRuntimeConfig } from "../supabase/objective-runtime.ts";
import { hashExerciseAttemptRequest, type ExerciseAttemptRequest, type ExerciseGradingResult } from "./exercises/attempt.ts";
import {
  decodeObjectiveAcceptance, decodeObjectiveInstanceRouting, decodeObjectiveIssue, immutableObjectiveAttempt,
  objectiveAcceptanceParameters, objectiveIssueParameters, ObjectiveRuntimeError, recoverObjectiveV2Retry,
  selectNewObjectiveIssuer, type ObjectiveInstanceRouting, type ObjectiveIssueInput,
} from "./objective-runtime-core.ts";

/** Future opt-in for NEW issuance only. No current route imports this module. */
export function newObjectiveIssuanceVersion() {
  return selectNewObjectiveIssuer(process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED === "true");
}

export async function issueObjectiveInstanceV2(input: ObjectiveIssueInput) {
  if (newObjectiveIssuanceVersion() !== "v2") throw new ObjectiveRuntimeError("v2_issuance_disabled");
  const config = getObjectiveRuntimeConfig();
  const rows = await callObjectiveRpc(config, "study_graph_issue_objective_instance_v2", objectiveIssueParameters(input, config.learnerId));
  // On reuse, callers must load presentation/archive from returned IDs, not the submitted candidate.
  return decodeObjectiveIssue(rows, input);
}

async function resolveRouting(config: ObjectiveRuntimeConfig, instanceId: string) {
  const rows = await callObjectiveRpc(config, "study_graph_resolve_objective_instance_routing", {
    p_instance_id: instanceId, p_learner_id: config.learnerId,
  });
  return decodeObjectiveInstanceRouting(rows, instanceId);
}

/** Rollback-safe: neither a feature flag nor a browser version participates in this read. */
export async function resolveObjectiveAcceptanceRouting(instanceId: string) {
  return resolveRouting(getObjectiveRuntimeConfig(), instanceId);
}

export type ObjectiveAcceptanceAuthorities = Readonly<{
  /** Load/grade the exact persisted instance's immutable archive on the server. */
  grade: (instance: ObjectiveInstanceRouting, request: Readonly<ExerciseAttemptRequest>) => Promise<ExerciseGradingResult>;
  /** Fresh authoritative source read for FIRST acceptance, never browser/issuance Snapshot Scope. */
  freshScope: (instance: ObjectiveInstanceRouting) => Promise<boolean>;
  /** Trusted server definition/config epoch check, never a browser claim. */
  epochActive: (instance: ObjectiveInstanceRouting) => Promise<boolean>;
}>;

/**
 * Unused preparation boundary. Future server wiring must supply project authority functions.
 * Accepted retries return before resolver, grader, fresh Scope or epoch checks.
 * DB remains the final SRS authority and serializes concurrent first acceptances.
 */
export async function submitObjectiveAttemptV2(requestInput: ExerciseAttemptRequest, authority: ObjectiveAcceptanceAuthorities) {
  const request = immutableObjectiveAttempt(requestInput);
  const requestHash = hashExerciseAttemptRequest(request);
  const config = getObjectiveRuntimeConfig();
  const lookup = async () => recoverObjectiveV2Retry(await callObjectiveRpc(config, "study_graph_get_kuzushiji_pilot_attempt_receipt", {
    p_instance_id: request.instanceId, p_learner_id: config.learnerId,
  }), request, requestHash);
  const existing = await lookup();
  if (existing) return existing;

  const instance = await resolveRouting(config, request.instanceId);
  if (instance.acceptanceVersion !== "v2") throw new ObjectiveRuntimeError("acceptance_version_mismatch");
  try {
    const grading = await authority.grade(instance, request);
    const scopeAccepted = await authority.freshScope(instance);
    const epochActive = await authority.epochActive(instance);
    const rows = await callObjectiveRpc(config, "study_graph_record_objective_attempt_v2", objectiveAcceptanceParameters({
      request, requestHash, grading, scopeAccepted, epochActive,
    }, config.learnerId));
    return decodeObjectiveAcceptance(rows, request);
  } catch (error) {
    // Reconcile only a concurrent acceptance of this instance. No writer fallback/retry.
    if (error instanceof ObjectiveRuntimeError && error.code === "instance_already_answered") {
      const stored = await lookup();
      if (stored) return stored;
    }
    if (error instanceof ObjectiveRuntimeError) throw error;
    throw new ObjectiveRuntimeError("objective_runtime_unavailable");
  }
}
