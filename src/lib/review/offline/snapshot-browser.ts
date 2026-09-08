import {
  assertValidScopeKnowledgeSnapshot,
  canonicalizeScopeKnowledgeSnapshotContent,
  type ScopeKnowledgeSnapshot,
  type ScopeKnowledgeSnapshotInput,
} from "./snapshot-content.ts";

/**
 * Browser counterpart of the server snapshot hash.  This module is kept
 * free of node:crypto imports so it can be included by client components.
 * The canonical semantic payload is shared with the server implementation.
 */
export type BrowserCryptoProvider = Pick<Crypto, "subtle">;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashScopeKnowledgeSnapshotContentBrowser(
  value: ScopeKnowledgeSnapshot | ScopeKnowledgeSnapshotInput,
  cryptoProvider?: BrowserCryptoProvider,
): Promise<string> {
  const provider = cryptoProvider ?? globalThis.crypto;
  if (!provider?.subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const encoded = new TextEncoder().encode(canonicalizeScopeKnowledgeSnapshotContent(value));
  const digest = await provider.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

export async function isScopeKnowledgeSnapshotHashValidBrowser(
  value: unknown,
  cryptoProvider?: BrowserCryptoProvider,
): Promise<boolean> {
  try {
    assertValidScopeKnowledgeSnapshot(value);
    return value.contentHash === await hashScopeKnowledgeSnapshotContentBrowser(value, cryptoProvider);
  } catch {
    return false;
  }
}
