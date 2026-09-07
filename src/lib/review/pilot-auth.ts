import "server-only";

import {
  createPilotSessionToken,
  pilotAuthorizationFailure,
  verifyPilotSessionToken,
} from "./pilot-auth-core";

export { PILOT_SESSION_TTL_SECONDS } from "./pilot-auth-core";

export const PILOT_SESSION_COOKIE = "study_graph_pilot_session";

function appToken() {
  return process.env.STUDY_GRAPH_APP_TOKEN?.trim() || process.env.StudyGraph_APP_TOKEN?.trim() || null;
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

export async function createPilotSessionCookieValue() {
  const secret = appToken();
  return secret ? createPilotSessionToken(secret) : null;
}

export async function isPilotSessionCookieValid(value: string | null | undefined) {
  const secret = appToken();
  return Boolean(secret) && await verifyPilotSessionToken(value, secret!);
}

export async function pilotWriteAuthorizationFailure(request: Request): Promise<"cross_origin_request" | "pilot_authorization_required" | null> {
  return pilotAuthorizationFailure({
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    sessionToken: cookieValue(request),
    secret: appToken(),
  });
}
