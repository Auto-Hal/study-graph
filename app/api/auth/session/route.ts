import { NextResponse } from "next/server";
import { createAuthenticatedPilotSessionCookieValue, getStudyGraphAccessPassword } from "@/src/lib/review/pilot-auth-server";
import { PILOT_SESSION_COOKIE, PILOT_SESSION_TTL_SECONDS } from "@/src/lib/review/pilot-auth";
import { isSameOriginRequest } from "@/src/lib/review/pilot-auth-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !isSameOriginRequest(origin, request.headers.get("host"), new URL(request.url).protocol)) {
    return NextResponse.json({ error: "cross_origin_request" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  }
  if (!getStudyGraphAccessPassword()) {
    return NextResponse.json({ error: "access_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const password = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).password
    : null;
  if (typeof password !== "string" || password.length === 0 || password.length > 4_000) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const cookieValue = await createAuthenticatedPilotSessionCookieValue(password);
  if (!cookieValue) return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set({
    name: PILOT_SESSION_COOKIE,
    value: cookieValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PILOT_SESSION_TTL_SECONDS,
  });
  return response;
}
