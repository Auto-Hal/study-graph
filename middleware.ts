import { NextRequest, NextResponse } from "next/server";
import {
  createPilotSessionCookieValue,
  isPilotSessionCookieValid,
  PILOT_SESSION_COOKIE,
} from "@/src/lib/review/pilot-auth";

export const config = {
  matcher: ["/review/:path*"],
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!await isPilotSessionCookieValid(request.cookies.get(PILOT_SESSION_COOKIE)?.value)) {
    const value = await createPilotSessionCookieValue();
    if (value) {
      response.cookies.set({
        name: PILOT_SESSION_COOKIE,
        value,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/api/review/pilot",
        maxAge: 15 * 60,
      });
    }
  }
  return response;
}
