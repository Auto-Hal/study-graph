import { NextResponse } from "next/server";
import { pilotWriteSameOriginFailure } from "@/src/lib/review/pilot-auth";
import { PilotRpcError } from "@/src/lib/supabase/pilot";
import { prefetchKuzushijiOfflineInstance } from "@/src/lib/review/offline/pilot-prefetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function parsePrefetchInput(value: unknown): { deviceId: string; issuanceRequestId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "deviceId" && key !== "issuanceRequestId")) return null;
  if (typeof body.deviceId !== "string" || !UUID_PATTERN.test(body.deviceId)) return null;
  if (typeof body.issuanceRequestId !== "string" || !UUID_PATTERN.test(body.issuanceRequestId)) return null;
  return { deviceId: body.deviceId, issuanceRequestId: body.issuanceRequestId };
}

/** Server-issued prefetch; no browser content/identity fields are accepted. */
export async function POST(request: Request) {
  const authorizationFailure = pilotWriteSameOriginFailure(request);
  if (authorizationFailure) {
    return noStore(NextResponse.json(
      { error: authorizationFailure },
      { status: 403 },
    ));
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    return noStore(NextResponse.json({ error: "body_too_large" }, { status: 413 }));
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore(NextResponse.json({ error: "invalid_json" }, { status: 400 }));
  }
  const input = parsePrefetchInput(body);
  if (!input) return noStore(NextResponse.json({ error: "invalid_prefetch_request" }, { status: 400 }));

  try {
    const result = await prefetchKuzushijiOfflineInstance(input);
    return noStore(NextResponse.json(result, { status: 200 }));
  } catch (error) {
    const pilotError = error instanceof PilotRpcError ? error : null;
    const status = pilotError?.status && pilotError.status >= 400 && pilotError.status < 600
      ? pilotError.status
      : 503;
    return noStore(NextResponse.json({ error: pilotError?.code ?? "pilot_prefetch_unavailable" }, { status }));
  }
}
