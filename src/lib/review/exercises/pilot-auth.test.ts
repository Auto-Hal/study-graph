import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotSessionToken,
  isSameOriginRequest,
  pilotAuthorizationFailure,
  verifyPilotSessionToken,
} from "../pilot-auth-core.ts";

test("pilot session token is server-signed and expires", async () => {
  const token = await createPilotSessionToken("study-graph-test-secret", 1_000, "nonce");
  assert.ok(token);
  assert.equal(await verifyPilotSessionToken(token, "study-graph-test-secret", 1_001), true);
  assert.equal(await verifyPilotSessionToken(token, "wrong-secret", 1_001), false);
  assert.equal(await verifyPilotSessionToken(token, "study-graph-test-secret", 1_901), false);
});

test("origin is only a request boundary and does not replace the session token", () => {
  assert.equal(isSameOriginRequest(null, "study-graph.test"), true);
  assert.equal(isSameOriginRequest("https://study-graph.test", "study-graph.test"), true);
  assert.equal(isSameOriginRequest("https://evil.test", "study-graph.test"), false);
});

test("pilot write authorization rejects direct and cross-origin requests, then allows the signed same-user session", async () => {
  const secret = "study-graph-test-secret";
  const token = await createPilotSessionToken(secret, 1_000, "nonce");
  assert.equal(await pilotAuthorizationFailure({ origin: null, host: "study-graph.test", sessionToken: null, secret }), "pilot_authorization_required");
  assert.equal(await pilotAuthorizationFailure({ origin: "https://evil.test", host: "study-graph.test", sessionToken: token, secret }), "cross_origin_request");
  assert.equal(await pilotAuthorizationFailure({ origin: "https://study-graph.test", host: "study-graph.test", sessionToken: token, secret }, 1_001), null);
});
