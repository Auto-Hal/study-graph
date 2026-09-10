import { NextResponse } from "next/server";
import {
  getCurrentScopeKnowledgeSnapshotModel,
  SnapshotRpcError,
} from "@/src/lib/supabase/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreHeaders(extra: Record<string, string> = {}) {
  return {
    "Cache-Control": "private, no-store",
    ...extra,
  };
}

/** Server-authoritative current snapshot distribution for native learner reads. */
export async function GET(request: Request) {
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
