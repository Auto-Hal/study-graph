import { NextResponse } from "next/server";
import { loadProjectReadState } from "@/src/lib/projects/read-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const results = [];
  for (const projectId of ["western-art-history", "philosophy"] as const) {
    const state = await loadProjectReadState(projectId);
    results.push({
      projectId,
      kind: state.kind,
      errorCode: "errorCode" in state ? state.errorCode ?? null : null,
      reason: "reason" in state ? state.reason : null,
    });
  }

  return NextResponse.json({ results }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
