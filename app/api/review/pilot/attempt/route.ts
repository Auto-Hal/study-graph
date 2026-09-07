import { NextResponse } from "next/server";
import { submitKuzushijiPilotAttempt, validatePilotAttemptInput } from "@/src/lib/review/pilot-runtime";
import { PilotRpcError } from "@/src/lib/supabase/pilot";
import { pilotWriteAuthorizationFailure } from "@/src/lib/review/pilot-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorizationFailure = await pilotWriteAuthorizationFailure(request);
  if (authorizationFailure) {
    return NextResponse.json({ error: authorizationFailure }, { status: authorizationFailure === "cross_origin_request" ? 403 : 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = validatePilotAttemptInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json(await submitKuzushijiPilotAttempt(parsed.request));
  } catch (error) {
    const pilotError = error instanceof PilotRpcError ? error : null;
    const status = pilotError?.code === "attempt_conflict" || pilotError?.code === "instance_already_answered"
      ? 409
      : pilotError?.status && pilotError.status >= 400 && pilotError.status < 600
        ? pilotError.status
        : 503;
    return NextResponse.json({ error: pilotError?.code ?? "pilot_attempt_unavailable" }, { status });
  }
}
