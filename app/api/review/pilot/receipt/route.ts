import { NextResponse } from "next/server";
import {
  getKuzushijiPilotAttemptReceipt,
  PilotRpcError,
  resolveKuzushijiPilotInstance,
} from "@/src/lib/supabase/pilot";

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
    const instance = await resolveKuzushijiPilotInstance(instanceId);
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
