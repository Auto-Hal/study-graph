import { NextResponse } from "next/server";
import { PILOT_SESSION_COOKIE } from "@/src/lib/review/pilot-auth";
import { isSameOriginRequest } from "@/src/lib/review/pilot-auth-core";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request.headers.get("origin"), request.headers.get("host"), new URL(request.url).protocol)) {
    return NextResponse.json({ error: "cross_origin_request" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set({
    name: PILOT_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
