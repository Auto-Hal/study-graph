import { NextResponse } from "next/server";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { createKuzushijiPilotReviewCard } from "@/src/lib/review/exercises/kuzushiji-adapter";
import { issueKuzushijiPilotReview } from "@/src/lib/review/pilot-runtime";
import { buildKuzushijiScopeSnapshot } from "@/src/lib/review/scope";
import { getStudyProject } from "@/src/lib/projects/registry";
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
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const characterId = typeof body.characterId === "string" ? body.characterId : null;
    if (!characterId) return NextResponse.json({ error: "invalid_character_id" }, { status: 400 });
    const data = await getKuzushijiDashboard();
    const character = data.characters.find((candidate) => candidate.id === characterId);
    const item = data.reviewQueue.find((candidate) => candidate.id === characterId && candidate.kind === "character");
    const project = getStudyProject("kuzushiji");
    if (!character || !item || !project) return NextResponse.json({ error: "pilot_not_eligible" }, { status: 409 });
    const card = createKuzushijiPilotReviewCard(project, character, item);
    if (!card) return NextResponse.json({ error: "pilot_not_eligible" }, { status: 409 });
    const issued = await issueKuzushijiPilotReview({
      character,
      item,
      scope: buildKuzushijiScopeSnapshot(data),
      legacyExerciseId: card.exerciseId,
    });
    return NextResponse.json({
      instanceId: issued.instanceId,
      releaseId: issued.releaseId,
      revisionId: issued.revisionId,
      presentation: issued.presentation,
    });
  } catch (error) {
    const pilotError = error instanceof PilotRpcError ? error : null;
    const status = pilotError?.status && pilotError.status >= 400 && pilotError.status < 600 ? pilotError.status : 503;
    return NextResponse.json({ error: pilotError?.code ?? "pilot_issue_unavailable" }, { status });
  }
}
