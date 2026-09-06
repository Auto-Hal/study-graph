import { NextResponse } from "next/server";
import { isReviewPersistenceConfigured, recordReviewAttempt, type ReviewGrade } from "@/src/lib/supabase/review";
import type { ReviewItemKind } from "@/src/lib/review/types";

export const runtime = "nodejs";

const grades = new Set<ReviewGrade>(["again", "hard", "good", "easy"]);
const kinds = new Set<ReviewItemKind>(["character", "mistake", "knowledge"]);
const answerTypes = new Set(["text", "single-choice"]);

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const value = body as Record<string, unknown>;
  const itemId = typeof value.itemId === "string" ? value.itemId.trim() : "";
  const exerciseId = typeof value.exerciseId === "string" ? value.exerciseId.trim() : "";
  const itemKind = value.itemKind;
  const grade = value.grade;
  const answerType = value.answerType;
  const answerText = typeof value.answerText === "string" ? value.answerText.slice(0, 2000) : "";
  const isCorrect = typeof value.isCorrect === "boolean" ? value.isCorrect : null;
  const responseMs = typeof value.responseMs === "number" && Number.isFinite(value.responseMs) ? Math.max(0, Math.min(Math.trunc(value.responseMs), 3_600_000)) : null;
  const usedHint = value.usedHint === true;

  if (itemId.length === 0 || itemId.length > 200 || exerciseId.length === 0 || exerciseId.length > 400 || (itemKind !== "character" && itemKind !== "mistake" && itemKind !== "knowledge") || (grade !== "again" && grade !== "hard" && grade !== "good" && grade !== "easy") || !kinds.has(itemKind) || !grades.has(grade) || (answerType !== "text" && answerType !== "single-choice") || !answerTypes.has(answerType) || isCorrect === null || responseMs === null) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!isReviewPersistenceConfigured()) return NextResponse.json({ saved: false, persistence: "fallback", message: "Supabase review persistence is not configured yet." });

  try {
    const result = await recordReviewAttempt({ itemId, itemKind, grade, exerciseId, answerType, answerText, isCorrect, responseMs, usedHint });
    return NextResponse.json({ saved: true, persistence: "supabase", dueAt: result.due_at, intervalDays: result.interval_days, repetitions: result.repetitions });
  } catch (error) {
    console.error("Study Graph: review attempt save failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
