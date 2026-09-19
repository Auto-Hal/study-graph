import "server-only";

import { ObjectiveRuntimeError, objectiveRpcFailure } from "../review/objective-runtime-core.ts";

const DEFAULT_SUPABASE_URL = "https://uhckdhdkywhsqjcquvyj.supabase.co";
const RPC_NAMES = [
  "study_graph_issue_objective_instance_v2",
  "study_graph_record_objective_attempt_v2",
  "study_graph_resolve_objective_instance_routing",
  // Historical name, but this existing read-only SQL lookup is learner/instance scoped, not project restricted.
  "study_graph_get_kuzushiji_pilot_attempt_receipt",
] as const;
export type ObjectiveRpcName = typeof RPC_NAMES[number];
export type ObjectiveRuntimeConfig = Readonly<{ url: string; serviceRoleKey: string; learnerId: string }>;

export function getObjectiveRuntimeConfig(): ObjectiveRuntimeConfig {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const learnerId = process.env.STUDY_GRAPH_LEARNER_ID?.trim();
  if (!serviceRoleKey || !learnerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(learnerId)) {
    throw new ObjectiveRuntimeError("objective_runtime_unavailable");
  }
  return Object.freeze({ url: (process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/$/, ""), serviceRoleKey, learnerId });
}

/** No retry/fallback writer, logging, or raw SQL error propagation. */
export async function callObjectiveRpc(config: ObjectiveRuntimeConfig, name: ObjectiveRpcName, body: Record<string, unknown>): Promise<unknown> {
  if (!RPC_NAMES.includes(name)) throw new ObjectiveRuntimeError("invalid_runtime_input");
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new ObjectiveRuntimeError(response.ok ? "invalid_authority_response" : "objective_runtime_unavailable"); }
    if (!response.ok) throw objectiveRpcFailure(payload);
    return payload;
  } catch (error) {
    if (error instanceof ObjectiveRuntimeError) throw error;
    throw new ObjectiveRuntimeError("objective_runtime_unavailable");
  }
}
