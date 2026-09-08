import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const authCore = readFileSync(resolve(root, "src/lib/review/pilot-auth-core.ts"), "utf8");
const operations = readFileSync(resolve(root, "src/lib/review/pilot-operations.ts"), "utf8");
const registry = readFileSync(resolve(root, "src/lib/review/registry.ts"), "utf8");
const issueRoute = readFileSync(resolve(root, "app/api/review/pilot/issue/route.ts"), "utf8");
const attemptRoute = readFileSync(resolve(root, "app/api/review/pilot/attempt/route.ts"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");

test("Phase 4C-5 keeps the single-user session for 90 days", () => {
  assert.match(authCore, /PILOT_SESSION_TTL_SECONDS = 90 \* 24 \* 60 \* 60/);
  assert.match(authCore, /derivePilotSessionSecret/);
});

test("new pilot issuance has an operational kill switch", () => {
  assert.match(operations, /STUDY_GRAPH_PILOT_ISSUANCE_ENABLED/);
  assert.match(operations, /\["0", "false", "off", "disabled"\]/);
  assert.match(registry, /!isPilotIssuanceEnabled\(\)/);
  assert.match(issueRoute, /!isPilotIssuanceEnabled\(\)/);
  assert.match(issueRoute, /pilot_issuance_disabled/);
  assert.match(envExample, /STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=/);
});

test("rollback disables issuance without disabling existing attempt handling", () => {
  assert.doesNotMatch(attemptRoute, /isPilotIssuanceEnabled/);
  assert.match(attemptRoute, /submitKuzushijiPilotAttempt/);
  assert.match(registry, /never falls back to[\s\S]{0,100}the legacy writer/);
});

test("4C-5 does not introduce destructive database or client-secret changes", () => {
  assert.doesNotMatch(operations, /NEXT_PUBLIC_/);
  assert.doesNotMatch(operations, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(issueRoute, /learnerId/);
});
