import assert from "node:assert/strict";
import test from "node:test";
import {
  createPilotSessionToken,
  derivePilotSessionSecret,
  isSameOriginRequest,
  pilotAuthorizationFailure,
  pilotSameOriginFailure,
  verifyPilotSessionToken,
} from "../pilot-auth-core.ts";

test("pilot session token is server-signed and expires after the long-lived single-user window", async () => {
  const token = await createPilotSessionToken(derivePilotSessionSecret("study-graph-test-secret"), 1_000, "nonce");
  assert.ok(token);
  assert.equal(await verifyPilotSessionToken(token, derivePilotSessionSecret("study-graph-test-secret"), 1_001), true);
  assert.equal(await verifyPilotSessionToken(token, derivePilotSessionSecret("study-graph-test-secret"), 44_201), true);
  assert.equal(await verifyPilotSessionToken(token, derivePilotSessionSecret("wrong-secret"), 1_001), false);
  assert.equal(await verifyPilotSessionToken(token, derivePilotSessionSecret("study-graph-test-secret"), 7_777_001), false);
  assert.equal(await verifyPilotSessionToken(token, "study-graph-test-secret", 1_001), false);
});

test("origin is only a request boundary and does not replace the dormant session token", () => {
  assert.equal(isSameOriginRequest(null, "study-graph.test"), true);
  assert.equal(isSameOriginRequest("https://study-graph.test", "study-graph.test"), true);
  assert.equal(isSameOriginRequest("http://study-graph.test", "study-graph.test", "https:"), false);
  assert.equal(isSameOriginRequest("https://evil.test", "study-graph.test"), false);
});

test("native mutation authorization keeps same-origin protection without a session", () => {
  assert.equal(pilotSameOriginFailure({ origin: null, host: "study-graph.test" }), "cross_origin_request");
  assert.equal(pilotSameOriginFailure({ origin: "https://study-graph.test", host: "study-graph.test", protocol: "https:" }), null);
  assert.equal(pilotSameOriginFailure({ origin: "https://evil.test", host: "study-graph.test", protocol: "https:" }), "cross_origin_request");
  assert.equal(pilotSameOriginFailure({ origin: "http://study-graph.test", host: "study-graph.test", protocol: "https:" }), "cross_origin_request");
});

test("pilot write authorization rejects direct and cross-origin requests, then allows the signed same-user session", async () => {
  const secret = "study-graph-test-secret";
  const token = await createPilotSessionToken(derivePilotSessionSecret(secret), 1_000, "nonce");
  assert.equal(await pilotAuthorizationFailure({ origin: null, host: "study-graph.test", sessionToken: null, secret }), "pilot_authorization_required");
  assert.equal(await pilotAuthorizationFailure({ origin: "https://evil.test", host: "study-graph.test", protocol: "https:", sessionToken: token, secret: derivePilotSessionSecret(secret) }, 1_001), "cross_origin_request");
  assert.equal(await pilotAuthorizationFailure({ origin: "https://study-graph.test", host: "study-graph.test", protocol: "https:", sessionToken: token, secret: derivePilotSessionSecret(secret) }, 1_001), null);
  assert.equal(await pilotAuthorizationFailure({ origin: "http://study-graph.test", host: "study-graph.test", protocol: "https:", sessionToken: token, secret: derivePilotSessionSecret(secret) }, 1_001), "cross_origin_request");
  assert.equal(await pilotAuthorizationFailure({ origin: null, host: "study-graph.test", sessionToken: token, secret: derivePilotSessionSecret(secret) }, 1_001), "cross_origin_request");
});
