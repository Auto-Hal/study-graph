import { NextRequest, NextResponse } from "next/server";
import {
  isPilotSessionCookieValid,
  PILOT_SESSION_COOKIE,
} from "@/src/lib/review/pilot-auth";

export const config = {
  matcher: ["/review", "/review/:path*"],
};

export async function middleware(request: NextRequest) {
  if (!await isPilotSessionCookieValid(request.cookies.get(PILOT_SESSION_COOKIE)?.value)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}
