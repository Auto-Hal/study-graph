import "server-only";

import {
  derivePilotSessionSecret,
  pilotAuthorizationFailure,
  verifyPilotSessionToken,
} from "./pilot-auth-core";

export { PILOT_SESSION_TTL_SECONDS } from "./pilot-auth-core";

export const PILOT_SESSION_COOKIE = "study_graph_pilot_session";

function accessPassword() {
  return process.env.STUDY_GRAPH_ACCESS_PASSWORD?.trim() || null;
}

function cookieValue(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const prefix = `${PILOT_SESSION_COOKIE}=`;
  const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  if (!value) return null;
  try {
    return decodeURIComponent(value.slice(prefix.length));
  } catch {
    return null;
  }
}

/** Server-side session check for authenticated read APIs. */
export async function isPilotSessionRequestAuthenticated(request: Request) {
  return isPilotSessionCookieValid(cookieValue(request));
}

export async function isPilotSessionCookieValid(value: string | null | undefined) {
  const password = accessPassword();
  const secret = password ? derivePilotSessionSecret(password) : null;
  return Boolean(secret) && await verifyPilotSessionToken(value, secret!);
}

export async function pilotWriteAuthorizationFailure(request: Request): Promise<"cross_origin_request" | "pilot_authorization_required" | null> {
  return pilotAuthorizationFailure({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    protocol: new URL(request.url).protocol,
    sessionToken: cookieValue(request),
    secret: accessPassword() ? derivePilotSessionSecret(accessPassword()!) : null,
  });
}
