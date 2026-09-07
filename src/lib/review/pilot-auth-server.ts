import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createPilotSessionToken, derivePilotSessionSecret } from "./pilot-auth-core";

export function getStudyGraphAccessPassword() {
  return process.env.STUDY_GRAPH_ACCESS_PASSWORD?.trim() || null;
}
/** Return null when configuration is absent; never log or return the password. */
export function verifyStudyGraphAccessPassword(candidate: string) {
  const expected = getStudyGraphAccessPassword();
  if (!expected) return null;
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function createAuthenticatedPilotSessionCookieValue(password: string) {
  if (verifyStudyGraphAccessPassword(password) !== true) return null;
  return createPilotSessionToken(derivePilotSessionSecret(password));
}
