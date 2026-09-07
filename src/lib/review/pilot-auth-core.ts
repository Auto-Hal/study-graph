const TOKEN_VERSION = "v1";
export const PILOT_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Keep the web-login signing domain separate from the legacy Supabase token. */
export function derivePilotSessionSecret(accessPassword: string) {
  return `study-graph-session-v1|${accessPassword}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(payload: string, secret: string, operation: "sign" | "verify", signature?: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [operation],
  );
  if (operation === "sign") return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  if (!signature) return false;
  try {
    return await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

export async function createPilotSessionToken(secret: string, nowSeconds = Math.floor(Date.now() / 1000), nonce = crypto.randomUUID()) {
  if (!secret.trim()) return null;
  const expiresAt = nowSeconds + PILOT_SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}.${nonce}`;
  return `${payload}.${await hmac(payload, secret, "sign")}`;
}

export async function verifyPilotSessionToken(token: string | null | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !secret.trim()) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < nowSeconds || expiresAt > nowSeconds + PILOT_SESSION_TTL_SECONDS + 60) return false;
  return hmac(`${parts[0]}.${parts[1]}.${parts[2]}`, secret, "verify", parts[3]);
}

export function isSameOriginRequest(origin: string | null, host: string | null, protocol?: string | null) {
  if (!origin) return true;
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && (!protocol || parsed.protocol === protocol);
  } catch {
    return false;
  }
}

export async function pilotAuthorizationFailure(input: {
  origin: string | null;
  host: string | null;
  protocol?: string | null;
  sessionToken: string | null | undefined;
  secret: string | null | undefined;
}, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!input.secret || !await verifyPilotSessionToken(input.sessionToken, input.secret, nowSeconds)) return "pilot_authorization_required" as const;
  if (!input.origin || !isSameOriginRequest(input.origin, input.host, input.protocol)) return "cross_origin_request" as const;
  return null;
}
