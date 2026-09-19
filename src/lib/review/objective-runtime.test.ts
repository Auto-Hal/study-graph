import assert from "node:assert/strict";
import { after, test } from "node:test";
import { hashExerciseAttemptRequest, type ExerciseAttemptRequest, type ExerciseGradingResult } from "./exercises/attempt.ts";
import { resultFromStoredObjectiveReceipt } from "./exercises/receipt.ts";
import {
  decodeObjectiveAcceptance, decodeObjectiveInstanceRouting, decodeObjectiveIssue, objectiveAcceptanceParameters,
  objectiveIssueParameters, objectiveRpcFailure, ObjectiveRuntimeError, objectiveRuntimeFailure, recoverObjectiveV2Retry,
  selectNewObjectiveIssuer, type ObjectiveIssueInput,
} from "./objective-runtime-core.ts";
import { issueObjectiveInstanceV2, newObjectiveIssuanceVersion, resolveObjectiveAcceptanceRouting, submitObjectiveAttemptV2 } from "./objective-runtime.ts";

const instanceId = "11111111-1111-4111-8111-111111111111";
const learnerId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const request: ExerciseAttemptRequest = { attemptId, instanceId, rawAnswer: { type: "text", value: "答え" }, selfEvaluation: "easy", responseMs: 120, usedHint: false };
const grading: ExerciseGradingResult = { gradingStatus: "graded", normalizedAnswer: "答え", isCorrect: false,
  gradingAuthority: "server", gradingStrategyId: "legacy-text-v1", gradingStrategyVersion: 1, normalizerVersion: "review-session-ja-v1" };
const input: ObjectiveIssueInput = { releaseId: "release", revisionId, presentation: { prompt: "Question" }, presentationHash: "a".repeat(64),
  rendererVersion: null, adapterVersion: null, locale: "ja-JP", scopeEvidence: {}, knowledgeBinding: null,
  legacyItemId: "item", legacyItemKind: "knowledge", legacyExerciseId: "exercise", srsEpoch: 1, intent: "scheduled" };

function issueRow(overrides: Record<string, unknown> = {}) {
  return { instance_id: instanceId, release_id: "release", revision_id: revisionId, opportunity_kind: "unseen",
    effective_evidence_use: "srs", expected_state_revision: 0, issued_at: "2030-01-01T00:00:00Z",
    expires_at: "2030-01-08T00:00:00Z", reused: false, ...overrides };
}
function routingRow(overrides: Record<string, unknown> = {}) {
  return { instance_id: instanceId, project_id: "kuzushiji", objective_id: "objective", objective_version: 1, srs_epoch: 1, evidence_use: "srs",
    scheduling_context_version: 1, opportunity_kind: "unseen", expected_state_revision: 0,
    grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
    issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null, ...overrides };
}
function historicalRow() {
  return routingRow({ scheduling_context_version: null, opportunity_kind: null, expected_state_revision: null,
    grade_policy_version: null, activation_policy_version: null, issued_at: null, expires_at: null });
}
function receipt(overrides: Record<string, unknown> = {}) {
  return { receiptVersion: 2, attemptId, instanceId, acceptedAt: "2030-01-01T00:01:00Z", projectId: "kuzushiji", objectiveId: "objective",
    objectiveVersion: 1, srsEpoch: 1, evidenceUse: "srs", gradingStatus: "graded", isCorrect: false, applied: true,
    reason: "applied", effectiveGrade: "again", stateRevision: 1, dueAt: "2030-01-01T00:11:00Z", ...overrides };
}
const bad = (fn: () => unknown, code = "invalid_authority_response") => assert.throws(fn, (e: unknown) => e instanceof ObjectiveRuntimeError && e.code === code);

test("issuer maps only trusted archive facts and intent; rejects caller authority", () => {
  for (const intent of ["scheduled", "practice"] as const) {
    const body = objectiveIssueParameters({ ...input, intent }, learnerId);
    assert.equal(body.p_intent, intent);
    assert.equal(body.p_learner_id, learnerId);
    assert.equal(body.p_revision_id, revisionId);
    assert.equal(Object.keys(body).length, 15);
  }
  for (const key of ["expectedStateRevision", "opportunityKind", "effectiveEvidenceUse", "opportunityId", "gradePolicyVersion", "activationPolicyVersion"]) {
    bad(() => objectiveIssueParameters({ ...input, [key]: "forged" }, learnerId), "invalid_runtime_input");
  }
});

test("unseen/due/practice/reused issuer results validate without repairing fields", () => {
  assert.equal(decodeObjectiveIssue([issueRow()], input).expectedStateRevision, 0);
  assert.equal(decodeObjectiveIssue([issueRow({ opportunity_kind: "due", expected_state_revision: 9 })], input).expectedStateRevision, 9);
  assert.equal(decodeObjectiveIssue([issueRow({ opportunity_kind: "practice", effective_evidence_use: "practice-only", expected_state_revision: null, expires_at: null })], { ...input, intent: "practice" }).opportunityKind, "practice");
  assert.equal(decodeObjectiveIssue([issueRow({ reused: true, release_id: "older-release", revision_id: learnerId })], input).revisionId, learnerId);
  for (const patch of [{ expected_state_revision: null }, { expected_state_revision: 1 }, { expires_at: null }, { issued_at: "bad" },
    { opportunity_kind: "due", expected_state_revision: 0 }, { reused: "true" }, { hidden: true }, { instance_id: "" }, { revision_id: "bad" }]) {
    bad(() => decodeObjectiveIssue([issueRow(patch)], input));
  }
  bad(() => decodeObjectiveIssue([issueRow(), issueRow()], input));
  bad(() => decodeObjectiveIssue([issueRow()], { ...input, intent: "practice" }));
});

test("acceptance routing is pinned to persisted context, including v2 practice and expired context", () => {
  assert.equal(selectNewObjectiveIssuer(), "v1");
  assert.equal(selectNewObjectiveIssuer(false), "v1");
  assert.equal(selectNewObjectiveIssuer(true), "v2");
  assert.equal(decodeObjectiveInstanceRouting([historicalRow()], instanceId).acceptanceVersion, "v1");
  for (const patch of [{}, { opportunity_kind: "due", expected_state_revision: 4 },
    { opportunity_kind: "practice", evidence_use: "practice-only", expected_state_revision: null, expires_at: null },
    { issued_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-08T00:00:00Z" }]) {
    assert.equal(selectNewObjectiveIssuer(false), "v1");
    assert.equal(decodeObjectiveInstanceRouting([routingRow(patch)], instanceId).acceptanceVersion, "v2");
  }
  bad(() => decodeObjectiveInstanceRouting([], instanceId), "instance_unavailable");
  for (const patch of [{ expected_state_revision: null }, { scheduling_context_version: null }, { routing_version: 1 }, { instance_id: learnerId }]) {
    bad(() => decodeObjectiveInstanceRouting([routingRow(patch)], instanceId));
  }
  const partial = routingRow(); delete (partial as Record<string, unknown>).issued_at;
  bad(() => decodeObjectiveInstanceRouting([partial], instanceId));
});

test("acceptance preserves six-field hash, raw self-evaluation and trusted facts, never supplies an SRS plan", () => {
  const requestHash = hashExerciseAttemptRequest(request);
  const facts = { request, requestHash, grading, scopeAccepted: false, epochActive: true };
  const body = objectiveAcceptanceParameters(facts, learnerId);
  assert.equal(body.p_request_hash, requestHash);
  assert.deepEqual(body.p_raw_answer, request.rawAnswer);
  assert.equal(body.p_self_evaluation, "easy");
  assert.equal(body.p_is_correct, false);
  assert.equal(body.p_scope_accepted, false);
  assert.equal(body.p_epoch_active, true);
  for (const key of ["p_srs_applied", "p_srs_reason", "p_effective_srs_grade", "p_expected_state_revision"]) assert.ok(!(key in body));
  for (const key of ["srsApplied", "srsReason", "effectiveGrade", "expectedStateRevision"]) {
    bad(() => objectiveAcceptanceParameters({ ...facts, [key]: true }, learnerId), "invalid_runtime_input");
  }
  bad(() => objectiveAcceptanceParameters({ ...facts, requestHash: "0".repeat(64) }, learnerId), "invalid_runtime_input");
  bad(() => objectiveAcceptanceParameters({ ...facts, grading: { ...grading, gradingAuthority: "client" } as never }, learnerId), "invalid_runtime_input");
  assert.equal(objectiveAcceptanceParameters({ ...facts, grading: { ...grading, gradingStatus: "ungraded", isCorrect: null } }, learnerId).p_is_correct, null);
});

test("Receipt v2 uses the existing reader, v1 historical reader is unchanged", () => {
  const stored = receipt();
  assert.deepEqual(decodeObjectiveAcceptance([{ receipt: stored }], request), resultFromStoredObjectiveReceipt(stored, instanceId));
  assert.equal(resultFromStoredObjectiveReceipt(receipt({ receiptVersion: 1 }), instanceId).saved, true);
  for (const patch of [{ receiptVersion: 1 }, { receiptVersion: 3 }, { applied: false }, { stateRevision: 0 }, { attemptId: learnerId }, { privateDetail: "unexpected" }]) {
    bad(() => decodeObjectiveAcceptance([{ receipt: receipt(patch) }], request));
  }
  for (const reason of ["stale-opportunity", "issuance-context-missing", "practice-only", "grader-unavailable"]) {
    const stored = receipt({ applied: false, reason, effectiveGrade: null, stateRevision: null, dueAt: null });
    const rows = [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
    assert.deepEqual(recoverObjectiveV2Retry(rows, request, hashExerciseAttemptRequest(request))?.receipt, stored);
    bad(() => recoverObjectiveV2Retry(rows, request, "a".repeat(64)), "attempt_conflict");
    bad(() => recoverObjectiveV2Retry(rows, { ...request, attemptId: learnerId }, hashExerciseAttemptRequest(request)), "instance_already_answered");
  }
});

// Exercise the actual server wrappers and fetch boundary without any real network.
const oldFetch = globalThis.fetch;
const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STUDY_GRAPH_LEARNER_ID", "STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED"];
const oldEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
after(() => { globalThis.fetch = oldFetch; for (const key of envKeys) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; } });
function setup(handler: (name: string, body: Record<string, unknown>) => unknown) {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-not-a-secret";
  process.env.STUDY_GRAPH_LEARNER_ID = learnerId;
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(String(url)).hostname, "fixture.invalid");
    assert.equal(init?.method, "POST"); assert.equal(init?.cache, "no-store");
    const name = new URL(String(url)).pathname.split("/").at(-1)!; calls.push(name);
    const result = await handler(name, JSON.parse(String(init?.body)));
    return result instanceof Response ? result : Response.json(result);
  };
  return calls;
}

test("server gate is OFF by default; opt-in issuer accepts reuse and maps not-due", async () => {
  const calls = setup(() => [issueRow({ reused: true })]);
  assert.equal(newObjectiveIssuanceVersion(), "v1");
  await assert.rejects(issueObjectiveInstanceV2(input), { code: "v2_issuance_disabled" });
  assert.equal(calls.length, 0);
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  assert.equal((await issueObjectiveInstanceV2(input)).reused, true);
  setup(() => Response.json({ message: "objective_not_due", details: "private SQL" }, { status: 400 }));
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  await assert.rejects(issueObjectiveInstanceV2(input), { code: "objective_not_due" });
});

test("first acceptance reads server routing/grade/fresh Scope/epoch even with issuance disabled", async () => {
  const events: string[] = [];
  setup((name, body) => {
    assert.equal(body.p_learner_id, learnerId);
    if (name.includes("attempt_receipt")) return [];
    if (name.includes("routing")) return [routingRow()];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_scope_accepted, true); assert.equal(body.p_epoch_active, false);
    assert.equal(body.p_is_correct, false); assert.equal(body.p_self_evaluation, "easy");
    assert.equal(body.p_request_hash, hashExerciseAttemptRequest(request));
    return [{ receipt: receipt({ applied: false, reason: "epoch-inactive", effectiveGrade: null, stateRevision: null, dueAt: null }) }];
  });
  const result = await submitObjectiveAttemptV2(request, {
    grade: async (instance, observed) => { events.push("grade"); assert.equal(instance.acceptanceVersion, "v2"); assert.deepEqual(observed, request); return grading; },
    freshScope: async () => { events.push("fresh-scope"); return true; },
    epochActive: async () => { events.push("epoch"); return false; },
  });
  assert.equal(result.srsReason, "epoch-inactive"); assert.deepEqual(events, ["grade", "fresh-scope", "epoch"]);
});

test("commit then lost response converges on stored Receipt with no second grading/scope/state mutation", async () => {
  let stored: ReturnType<typeof receipt> | null = null; let writes = 0; let grades = 0; let scopeReads = 0;
  const calls = setup((name) => {
    if (name.includes("attempt_receipt")) return stored ? [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }] : [];
    if (name.includes("routing")) return [routingRow()];
    writes++; stored = receipt(); throw new Error("network response lost after commit");
  });
  const authority = { grade: async () => { grades++; return grading; }, freshScope: async () => { scopeReads++; return true; }, epochActive: async () => true };
  await assert.rejects(submitObjectiveAttemptV2(request, authority), { code: "objective_runtime_unavailable" });
  assert.deepEqual((await submitObjectiveAttemptV2(request, authority)).receipt, stored);
  assert.equal(writes, 1); assert.equal(grades, 1); assert.equal(scopeReads, 1);
  assert.equal(calls.at(-1), "study_graph_get_kuzushiji_pilot_attempt_receipt");
});

test("routing read rejects wrong-owner/absent binding and never defaults to v1", async () => {
  setup((name, body) => { assert.ok(name.includes("routing")); assert.equal(body.p_learner_id, learnerId); return []; });
  await assert.rejects(resolveObjectiveAcceptanceRouting(instanceId), { code: "instance_unavailable" });
  setup(() => [historicalRow()]);
  assert.equal((await resolveObjectiveAcceptanceRouting(instanceId)).acceptanceVersion, "v1");
});

test("v2 submit refuses historical context and all failures remain bounded without v1 fallback", async () => {
  const authority = { grade: async () => { throw new Error("must not grade"); }, freshScope: async () => true, epochActive: async () => true };
  const calls = setup((name) => name.includes("attempt_receipt") ? [] : [historicalRow()]);
  await assert.rejects(submitObjectiveAttemptV2(request, authority), { code: "acceptance_version_mismatch" });
  assert.equal(calls.length, 2);
  for (const message of ["password=secret SQL internal", "attempt_conflict", "instance_already_answered", "objective_archive_not_registered"]) {
    const failure = objectiveRuntimeFailure(objectiveRpcFailure({ message, details: "private SQL", hint: "secret" }));
    assert.doesNotMatch(JSON.stringify(failure), /private SQL|secret|password/);
  }
  const failed = setup(() => { throw new Error("Authorization private"); });
  await assert.rejects(submitObjectiveAttemptV2(request, authority), { code: "objective_runtime_unavailable" });
  assert.equal(failed.length, 1);
});

test("terminal no-SRS retry restores verbatim before any replacement context or grading", async () => {
  for (const reason of ["stale-opportunity", "issuance-context-missing", "practice-only", "grader-unavailable"]) {
    const stored = receipt({ applied: false, reason, effectiveGrade: null, stateRevision: null, dueAt: null });
    const calls = setup((name) => {
      assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
      return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
    });
    const mustNotRun = async () => { throw new Error("accepted result must not be recomputed"); };
    assert.deepEqual((await submitObjectiveAttemptV2(request, { grade: mustNotRun, freshScope: mustNotRun, epochActive: mustNotRun })).receipt, stored);
    assert.equal(calls.length, 1);
  }
});

test("concurrent same-instance receipt is reconciled, different attempt remains conflict", async () => {
  for (const storedAttempt of [attemptId, learnerId]) {
    let lookups = 0; let writes = 0;
    setup((name) => {
      if (name.includes("attempt_receipt")) return ++lookups === 1 ? []
        : [{ attempt_id: storedAttempt, request_hash: hashExerciseAttemptRequest(request), receipt: receipt() }];
      if (name.includes("routing")) return [routingRow()];
      writes++;
      return Response.json({ message: "instance_already_answered" }, { status: 400 });
    });
    const result = submitObjectiveAttemptV2(request, { grade: async () => grading, freshScope: async () => true, epochActive: async () => true });
    if (storedAttempt === attemptId) assert.deepEqual((await result).receipt, receipt());
    else await assert.rejects(result, { code: "instance_already_answered" });
    assert.equal(writes, 1); assert.equal(lookups, 2);
  }
});

test("malformed successful response, HTTP error and Scope source failure never invoke a legacy writer", async () => {
  for (const response of [new Response("not JSON"), Response.json([{ unexpected: true }]), Response.json({ message: "private SQL secret" }, { status: 500 })]) {
    const calls = setup(() => response);
    process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
    await assert.rejects(issueObjectiveInstanceV2(input), (error: unknown) => {
      assert.doesNotMatch(JSON.stringify(objectiveRuntimeFailure(error)), /private|SQL|secret/); return error instanceof ObjectiveRuntimeError;
    });
    assert.deepEqual(calls, ["study_graph_issue_objective_instance_v2"]);
  }
  const calls = setup((name) => name.includes("attempt_receipt") ? [] : [routingRow()]);
  await assert.rejects(submitObjectiveAttemptV2(request, {
    grade: async () => grading, freshScope: async () => { throw new Error("source failed"); }, epochActive: async () => true,
  }), { code: "objective_runtime_unavailable" });
  assert.deepEqual(calls, ["study_graph_get_kuzushiji_pilot_attempt_receipt", "study_graph_resolve_objective_instance_routing"]);
});
