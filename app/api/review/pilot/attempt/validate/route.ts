import { NextResponse } from "next/server";
import { validatePilotAttemptInput } from "@/src/lib/review/pilot-attempt-contract";
import { pilotWriteAuthorizationFailure } from "@/src/lib/review/pilot-auth";

export const runtime = "nodejs";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * Explicit diagnostics-only validation. This route has no runtime, database,
 * grading, Scope, or SRS access and never changes a blocked outbox record.
 */
export async function POST(request: Request) {
  const authorizationFailure = await pilotWriteAuthorizationFailure(request);
  if (authorizationFailure) {
    return noStore(NextResponse.json(
      { ok: false, error: authorizationFailure },
      { status: authorizationFailure === "cross_origin_request" ? 403 : 401 },
    ));
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
    return noStore(NextResponse.json({ ok: false, error: "body_too_large" }, { status: 413 }));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }));
  }
  const parsed = validatePilotAttemptInput(body);
  if (!parsed.ok) return noStore(NextResponse.json({ ok: false, error: parsed.error }, { status: 200 }));
  return noStore(NextResponse.json({ ok: true }, { status: 200 }));
}
