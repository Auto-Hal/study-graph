import { NextResponse } from "next/server";
import { pilotWriteAuthorizationFailure } from "@/src/lib/review/pilot-auth";
import { syncKuzushijiScopeKnowledgeSnapshot } from "@/src/lib/review/snapshot-sync/kuzushiji";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit manual sync only; never call this from screen rendering. */
export async function POST(request: Request) {
  const authorizationFailure = await pilotWriteAuthorizationFailure(request);
  if (authorizationFailure) {
    return NextResponse.json(
      { error: authorizationFailure },
      { status: authorizationFailure === "cross_origin_request" ? 403 : 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await syncKuzushijiScopeKnowledgeSnapshot();
    return NextResponse.json(
      {
        snapshotId: result.snapshotId,
        projectId: "kuzushiji",
        generation: result.generation,
        contentHash: result.contentHash,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Do not expose Notion, Supabase, or credential details to the browser.
    return NextResponse.json(
      { error: "snapshot_sync_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
