import { NextResponse } from "next/server";
import { validatePilotAttemptInput } from "@/src/lib/review/pilot-runtime";
import { submitVersionedPilotAttempt } from "@/src/lib/review/pilot-attempt-dispatch";
import { PilotRpcError } from "@/src/lib/supabase/pilot";
import { pilotWriteSameOriginFailure } from "@/src/lib/review/pilot-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorizationFailure = pilotWriteSameOriginFailure(request);
  if (authorizationFailure) {
    return NextResponse.json({ error: authorizationFailure }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = validatePilotAttemptInput(body);
  if (!parsed.ok) {
    // Keep production diagnostics to the safe validator code only. Never log
    // the answer, identity, cookies, authorization headers, or request body.
    console.warn("pilot_attempt_validation_failed", { error: parsed.error });
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitVersionedPilotAttempt(parsed.request));
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
