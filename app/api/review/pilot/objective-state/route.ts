import { NextResponse } from "next/server";
import { assertValidObjectiveStateMirror, type ObjectiveStateMirror } from "@/src/lib/review/offline/model-core";
import {
  KUZUSHIJI_PILOT_OBJECTIVE_ID,
  KUZUSHIJI_PILOT_SRS_EPOCH,
} from "@/src/lib/review/exercises/kuzushiji-objective";
import {
  getKuzushijiPilotObjectiveState,
  getPilotRuntimeConfig,
  PilotRpcError,
} from "@/src/lib/supabase/pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Read-only Objective state mirror feed. The browser cannot
 * choose learner, project, Objective, or epoch; all identity facts come from
 * the server-fixed pilot configuration and the existing read-only RPC.
 */
export async function GET(request: Request) {
  void request;
  const config = getPilotRuntimeConfig();
  if (!config) {
    return noStore(NextResponse.json({ error: "pilot_runtime_not_configured" }, { status: 503 }));
  }
  try {
    const state = await getKuzushijiPilotObjectiveState();
    if (!state) return noStore(NextResponse.json({ error: "objective_state_not_found" }, { status: 404 }));
    if (
      state.learner_id !== config.learnerId
      || state.project_id !== "kuzushiji"
      || state.objective_id !== KUZUSHIJI_PILOT_OBJECTIVE_ID
      || state.srs_epoch !== KUZUSHIJI_PILOT_SRS_EPOCH
    ) {
      return noStore(NextResponse.json({ error: "objective_state_invalid" }, { status: 502 }));
    }
    const mirror = {
      learnerId: config.learnerId,
      projectId: state.project_id,
      objectiveId: state.objective_id,
      srsEpoch: state.srs_epoch,
      stateRevision: state.state_revision,
      dueAt: state.due_at,
      intervalDays: state.interval_days,
      repetitions: state.repetitions,
      lastGrade: state.last_grade,
      lastReviewedAt: state.last_reviewed_at,
      schedulerVersion: state.scheduler_version,
    } satisfies ObjectiveStateMirror;
    assertValidObjectiveStateMirror(mirror);
    return noStore(NextResponse.json(mirror, { status: 200 }));
  } catch (error) {
    const pilotError = error instanceof PilotRpcError ? error : null;
    const status = pilotError?.status && pilotError.status >= 400 && pilotError.status < 600
      ? pilotError.status
      : 503;
    return noStore(NextResponse.json(
      { error: pilotError?.code ?? "objective_state_unavailable" },
      { status },
    ));
  }
}
