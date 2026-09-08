import { NextResponse } from "next/server";
import {
  getCurrentScopeKnowledgeSnapshotModel,
  SnapshotRpcError,
} from "@/src/lib/supabase/snapshots";
import { isPilotSessionRequestAuthenticated } from "@/src/lib/review/pilot-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-store",
    ...extra,
  };
}

/** Authenticated, server-authoritative current snapshot distribution. */
export async function GET(request: Request) {
  if (!(await isPilotSessionRequestAuthenticated(request))) {
    return NextResponse.json({ error: "pilot_authorization_required" }, { status: 401, headers: noStoreHeaders() });
  }

  try {
    const snapshot = await getCurrentScopeKnowledgeSnapshotModel("kuzushiji");
    if (!snapshot) {
      return NextResponse.json({ error: "snapshot_not_available" }, { status: 404, headers: noStoreHeaders() });
    }

    // The ETag is an observation identity, not an authority or freshness
    // ordering value. Generation remains the cache adoption authority.
    const etag = `"${encodeURIComponent(`${snapshot.snapshotId}:${snapshot.generation}:${snapshot.contentHash}`)}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: noStoreHeaders({ ETag: etag }) });
    }
    return NextResponse.json({ snapshot }, { status: 200, headers: noStoreHeaders({ ETag: etag }) });
  } catch (error) {
    const snapshotError = error instanceof SnapshotRpcError ? error : null;
    const status = snapshotError?.status === 502 ? 502 : 503;
    return NextResponse.json(
      { error: snapshotError?.code ?? "snapshot_unavailable" },
      { status, headers: noStoreHeaders() },
    );
  }
}
