import { NextResponse } from "next/server";
import {
  getKuzushijiPilotAttemptReceipt,
  PilotRpcError,
} from "@/src/lib/supabase/pilot";
import { getObjectiveRuntimeConfig } from "@/src/lib/supabase/objective-runtime";
import { resolveObjectiveInstanceArchive } from "@/src/lib/supabase/objective-archive";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Read-only historical receipt lookup for durable pilot retries. It resolves
 * receipt kind from the server-owned instance and never grades, rechecks
 * Scope, or mutates Supabase.
 */
export async function GET(request: Request) {
  const instanceId = new URL(request.url).searchParams.get("instanceId");
  if (!instanceId || !UUID_PATTERN.test(instanceId)) {
    return noStore(NextResponse.json({ error: "invalid_instance_id" }, { status: 400 }));
  }
  try {
    const learnerId = getObjectiveRuntimeConfig().learnerId;
    const instance = await resolveObjectiveInstanceArchive(instanceId, learnerId);
    if (!instance) return noStore(NextResponse.json({ error: "receipt_not_found" }, { status: 404 }));
    if (instance.instance_id !== instanceId || instance.learner_id !== learnerId) {
      return noStore(NextResponse.json({ error: "pilot_receipt_unavailable" }, { status: 409 }));
    }
    if (instance.srs_target !== "objective" && instance.srs_target !== "legacy-item") {
      return noStore(NextResponse.json({ error: "pilot_receipt_unavailable" }, { status: 409 }));
    }
    const stored = await getKuzushijiPilotAttemptReceipt(instanceId);
    if (!stored) return noStore(NextResponse.json({ error: "receipt_not_found" }, { status: 404 }));
    return noStore(NextResponse.json({
      attemptId: stored.attempt_id,
      requestHash: stored.request_hash,
      receiptKind: instance.srs_target === "objective" ? "objective" : "legacy",
      receipt: stored.receipt,
    }));
  } catch (error) {
    const pilotError = error instanceof PilotRpcError ? error : null;
    if (pilotError?.code === "instance_not_found") {
      return noStore(NextResponse.json({ error: "receipt_not_found" }, { status: 404 }));
    }
    return noStore(NextResponse.json({ error: "pilot_receipt_unavailable" }, { status: pilotError?.status && pilotError.status >= 400 && pilotError.status < 600 ? pilotError.status : 503 }));
  }
}
