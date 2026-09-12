import { NextResponse } from "next/server";
import { pilotWriteSameOriginFailure } from "@/src/lib/review/pilot-auth";
import {
  isSnapshotRefreshProjectId,
  runProjectSnapshotRefresh,
  type SnapshotRefreshIntent,
} from "@/src/lib/projects/foreground-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REFRESH_BODY_BYTES = 1_024;

function responseBody(body: Record<string, string>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function invalidRequest() {
  return responseBody({ error: "invalid_request" }, 400);
}

async function readIntent(request: Request): Promise<SnapshotRefreshIntent | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.isFinite(Number(contentLength)) && Number(contentLength) > MAX_REFRESH_BODY_BYTES) {
    return null;
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (new TextEncoder().encode(text).byteLength > MAX_REFRESH_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Object.prototype.hasOwnProperty.call(record, "intent")) return null;
    if (record.intent !== "foreground" && record.intent !== "manual") return null;
    return record.intent;
  } catch {
    return null;
  }
}

function resultStatus(kind: string) {
  if (kind === "unavailable") return 503;
  if (kind === "busy" || kind === "blocked") return 409;
  return 200;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!isSnapshotRefreshProjectId(projectId)) return responseBody({ error: "unsupported_project" }, 404);

  const originFailure = pilotWriteSameOriginFailure(request);
  if (originFailure) return responseBody({ error: originFailure }, 403);

  const intent = await readIntent(request);
  if (!intent) return invalidRequest();

  try {
    const result = await runProjectSnapshotRefresh(projectId, intent);
    return responseBody({ projectId, status: result.kind }, resultStatus(result.kind));
  } catch {
    // Keep unexpected server failures as a safe learner status. Source and
    // persistence details stay in server-side health logs only.
    return responseBody({ projectId, status: "unavailable" }, 503);
  }
}
