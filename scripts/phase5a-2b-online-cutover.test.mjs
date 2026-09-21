import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const runtime = read("src/lib/review/pilot-runtime.ts");
const issueRoute = read("app/api/review/pilot/issue/route.ts");
const attemptRoute = read("app/api/review/pilot/attempt/route.ts");
const objectiveRuntime = read("src/lib/review/objective-runtime.ts");

function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  return source.slice(start);
}

test("the outer pilot kill switch remains before online issuer selection", () => {
  assert.match(issueRoute, /isPilotIssuanceEnabled\(\)/);
  assert.match(issueRoute, /pilot_issuance_disabled/);
  assert.match(runtime, /newObjectiveIssuanceVersion\(\) === "v2"/);
  assert.match(runtime, /issueKuzushijiPilotInstance\(/);
  assert.match(runtime, /issueObjectiveInstanceV2\(/);
});

test("v2 issuance sends only server-owned Kuzushiji facts", () => {
  const branch = runtime.slice(runtime.indexOf('if (newObjectiveIssuanceVersion() === "v2")'), runtime.indexOf("const issue = await issueKuzushijiPilotInstance"));
  for (const field of [
    "releaseId: archive.releaseId", "revisionId: archive.revisionId", "presentationHash: hashPilotPresentation(presentation)",
    "rendererVersion: null", "adapterVersion: null", 'locale: "ja-JP"',
    "scopeEvidence: buildPilotScopeEvidence", "knowledgeBinding: null", "legacyItemKind: \"character\"",
    "srsEpoch: KUZUSHIJI_PILOT_SRS_EPOCH", 'intent: "scheduled"',
  ]) assert.match(branch, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(branch, /expectedStateRevision|opportunityKind|effectiveEvidenceUse|gradePolicyVersion|activationPolicyVersion/);
});

test("new and reused v2 issuance resolve persisted presentation and attribution", () => {
  const branch = runtime.slice(runtime.indexOf('if (newObjectiveIssuanceVersion() === "v2")'), runtime.indexOf("const issue = await issueKuzushijiPilotInstance"));
  assert.match(branch, /resolveKuzushijiPilotInstance\(issued\.instanceId\)/);
  assert.match(branch, /persisted\.srs_target !== "objective"/);
  assert.match(branch, /persisted\.release_id !== issued\.releaseId/);
  assert.match(branch, /persisted\.revision_id !== issued\.revisionId/);
  assert.match(branch, /presentation: assertPersistedPilotPresentation\(persisted\.presentation\)/);
  assert.match(branch, /reused: issued\.reused/);
  assert.doesNotMatch(branch, /presentation: presentation[,}]/);
});

test("receipt recovery precedes instance routing, grading, Scope and epoch", () => {
  const submit = functionBody(runtime, "submitKuzushijiPilotAttempt");
  const receipt = submit.indexOf("const existing = await getKuzushijiPilotAttemptReceipt");
  const instance = submit.indexOf("const instance = assertResolvedKuzushijiPilotInstance");
  assert.ok(receipt >= 0 && instance > receipt);
  assert.ok(submit.indexOf("receiptResultFromStoredAttempt(existing.receipt") > receipt);
  assert.match(runtime, /resultFromStoredObjectiveReceipt/);
  assert.match(runtime, /resultFromStoredReceipt/);
});

test("acceptance is instance-pinned and issuance flag is absent from the acceptance function", () => {
  const submit = functionBody(runtime, "submitKuzushijiPilotAttempt");
  assert.match(submit, /instance\.srs_target === "objective"/);
  assert.match(submit, /resolveObjectiveAcceptanceRouting\(request\.instanceId\)/);
  assert.match(submit, /routing\.acceptanceVersion === "v2"/);
  assert.doesNotMatch(submit, /newObjectiveIssuanceVersion|STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED/);
  assert.doesNotMatch(submit.slice(submit.indexOf('if (routing.acceptanceVersion === "v2")'), submit.indexOf("const data = await getKuzushijiDashboard()", submit.indexOf('if (routing.acceptanceVersion === "v2")'))), /recordKuzushijiObjectivePilotAttempt/);
});

test("historical Objective and legacy instances retain their v1 writers", () => {
  const submit = functionBody(runtime, "submitKuzushijiPilotAttempt");
  assert.match(submit, /routing\.acceptanceVersion === "v2"/);
  assert.match(submit, /recordKuzushijiObjectivePilotAttempt/);
  assert.match(submit, /recordKuzushijiPilotAttempt/);
  assert.match(submit, /instance\.srs_target !== "legacy-item" && instance\.srs_target !== "objective"/);
});

test("v2 first acceptance uses persisted grading, fresh Notion Scope and trusted epoch", () => {
  const branchStart = runtime.indexOf('if (routing.acceptanceVersion === "v2")');
  const branchEnd = runtime.indexOf("\n      }\n\n      const data = await getKuzushijiDashboard();", branchStart);
  const branch = runtime.slice(branchStart, branchEnd);
  assert.match(branch, /gradeExerciseRevision\(instance\.revision_payload, immutableRequest\.rawAnswer\)/);
  assert.match(branch, /getKuzushijiDashboard\(\)/);
  assert.match(branch, /buildKuzushijiScopeSnapshot\(data\)/);
  assert.match(branch, /instance\.legacy_item_id/);
  assert.match(branch, /String\(KUZUSHIJI_PILOT_SRS_EPOCH\)/);
  assert.match(branch, /submitObjectiveAttemptV2\(immutableRequest/);
  assert.doesNotMatch(branch, /srsPlan|p_srs_applied|effectiveGrade|srsReason/);
});

test("v2 runtime errors are bounded and never fall back to the v1 writer", () => {
  assert.match(runtime, /objectiveRuntimeFailure/);
  assert.match(runtime, /objectivePilotError/);
  assert.match(runtime, /catch \(error\)[\s\S]*ObjectiveRuntimeError/);
  const branch = runtime.slice(runtime.indexOf('if (routing.acceptanceVersion === "v2")'), runtime.indexOf("const data = await getKuzushijiDashboard()", runtime.indexOf('if (routing.acceptanceVersion === "v2")')));
  assert.doesNotMatch(branch, /recordKuzushijiObjectivePilotAttempt/);
});

test("offline and browser boundaries remain unchanged", () => {
  for (const path of ["src/lib/review/offline/pilot-transport.ts", "src/lib/review/offline/pilot-prefetch.ts", "src/lib/review/offline/attempt-outbox.ts", "app/api/review/pilot/prefetch/route.ts"]) {
    assert.doesNotMatch(read(path), /issueObjectiveInstanceV2|submitObjectiveAttemptV2|resolveObjectiveAcceptanceRouting/);
  }
  assert.match(read("src/lib/review/offline/attempt-outbox.ts"), /ATTEMPT_OUTBOX_DB_VERSION = 1/);
  assert.match(read("src/lib/review/offline/model-core.ts"), /OFFLINE_RECEIPT_DESCRIPTOR_VERSION = 1/);
});

test("environment and rollback documentation keep production issuance off", () => {
  const env = read(".env.example");
  assert.match(env, /STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED=/);
  assert.match(env, /exact `true`|Exact \"true\"/);
  assert.doesNotMatch(env, /STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED=true/);
  const docs = read("docs/PHASE_5A_2B_ONLINE_OBJECTIVE_CUTOVER.md");
  for (const term of ["Receipt", "freshly read", "offline", "rollback", "never route a v2 instance through the v1 writer", "production v2 issuance remains disabled"]) {
    assert.match(docs, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("migration set is unchanged and no new migration is introduced", () => {
  const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql"));
  assert.equal(files.length, 19);
  for (const name of [
    "20260917021000_phase_5a_1b_objective_opportunity_rpc_foundation.sql",
    "20260918010500_phase_5a_1b_objective_issuer_lock_order.sql",
    "20260919132141_phase_5a_2a_objective_instance_routing.sql",
  ]) assert.ok(files.includes(name));
  // CI checks out a shallow synthetic PR merge, so neither the reviewed base
  // SHA nor a parent is guaranteed to be present locally. Compare to the
  // first parent when available; the exact committed inventory assertions
  // above remain the safe fallback for a parentless shallow checkout.
  let migrationDiff = "";
  try {
    execFileSync("git", ["rev-parse", "--verify", "HEAD^1"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    migrationDiff = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD", "--", "supabase/migrations"], { encoding: "utf8" });
  } catch {
    migrationDiff = "";
  }
  assert.equal(migrationDiff.trim(), "");
});

test("routes keep the public API boundary and do not expose authority selectors", () => {
  assert.match(issueRoute, /instanceId: issued\.instanceId/);
  assert.match(issueRoute, /releaseId: issued\.releaseId/);
  assert.match(issueRoute, /revisionId: issued\.revisionId/);
  assert.match(issueRoute, /presentation: issued\.presentation/);
  assert.doesNotMatch(`${issueRoute}\n${attemptRoute}`, /expectedStateRevision|opportunityKind|effectiveEvidenceUse|srsApplied|srsReason/);
});

test("strict Objective adapter remains server-only and receipt-first", () => {
  assert.match(objectiveRuntime, /import "server-only"/);
  const submit = functionBody(objectiveRuntime, "submitObjectiveAttemptV2");
  assert.ok(submit.indexOf("const existing = await lookup()") < submit.indexOf("const instance = await resolveRouting"));
  assert.doesNotMatch(submit, /newObjectiveIssuanceVersion|STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED/);
});
