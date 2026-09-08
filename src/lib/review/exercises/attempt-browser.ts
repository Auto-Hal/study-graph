import { canonicalizeExerciseAttemptRequest, type ExerciseAttemptHashInput } from "./attempt-content.ts";

export type BrowserCryptoProvider = Pick<Crypto, "subtle">;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Browser Web Crypto counterpart of hashExerciseAttemptRequest(). */
export async function hashExerciseAttemptRequestBrowser(
  request: ExerciseAttemptHashInput,
  cryptoProvider?: BrowserCryptoProvider,
) {
  const provider = cryptoProvider ?? globalThis.crypto;
  if (!provider?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const encoded = new TextEncoder().encode(canonicalizeExerciseAttemptRequest(request));
  const digest = await provider.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export { canonicalizeExerciseAttemptRequest } from "./attempt-content.ts";
