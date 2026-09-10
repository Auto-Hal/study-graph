import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: ["/review", "/review/:path*"],
};

export async function middleware(request: NextRequest) {
  // Study Graph-native Review is available without the dormant compatibility
  // login session. Keep the middleware boundary so the route remains easy to
  // extend, but never redirect normal learners to /login.
  void request;
  return NextResponse.next();
}
