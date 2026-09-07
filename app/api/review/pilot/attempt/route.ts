import { NextResponse } from "next/server";
import { submitKuzushijiPilotAttempt, validatePilotAttemptInput } from "@/src/lib/review/pilot-runtime";
import { PilotRpcError } from "@/src/lib/supabase/pilot";

export const runtime = "nodejs";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "cross_origin_request" }, { status: 403 });
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
