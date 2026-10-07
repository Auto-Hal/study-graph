import { NextResponse } from "next/server";
import { getStudyUnit } from "@/src/lib/review/units/catalog";
import { startStudyUnit } from "@/src/lib/review/units/runtime";
import { pilotWriteSameOriginFailure } from "@/src/lib/review/pilot-auth";
import { objectiveRuntimeFailure } from "@/src/lib/review/objective-runtime-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const failure = pilotWriteSameOriginFailure(request);
  if (failure) return NextResponse.json({ error: failure }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || Object.keys(body).length !== 1 || !("unitId" in body) || typeof body.unitId !== "string" || !getStudyUnit(body.unitId)) {
    return NextResponse.json({ error: "invalid_unit_id" }, { status: 400 });
  }
  try {
    return NextResponse.json(await startStudyUnit(body.unitId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = objectiveRuntimeFailure(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
