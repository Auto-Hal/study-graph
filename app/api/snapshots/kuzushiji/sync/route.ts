import { NextResponse } from "next/server";
import { pilotWriteSameOriginFailure } from "@/src/lib/review/pilot-auth";
import { runProjectSnapshotRefresh } from "@/src/lib/projects/foreground-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit manual sync only; never call this from screen rendering. */
export async function POST(request: Request) {
  const authorizationFailure = pilotWriteSameOriginFailure(request);
  if (authorizationFailure) {
    return NextResponse.json(
      { error: authorizationFailure },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    // Historical /api/snapshots/kuzushiji/sync remains a compatibility alias;
    // the shared dispatcher ultimately invokes syncKuzushijiScopeKnowledgeSnapshot().
    const result = await runProjectSnapshotRefresh("kuzushiji", "manual");
    const status = result.kind === "unavailable"
      ? 503
      : result.kind === "busy" || result.kind === "blocked" ? 409 : 200;
    return NextResponse.json(
      { status: result.kind, projectId: "kuzushiji" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Do not expose Notion, Supabase, or credential details to the browser.
    return NextResponse.json(
      { error: "snapshot_sync_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
