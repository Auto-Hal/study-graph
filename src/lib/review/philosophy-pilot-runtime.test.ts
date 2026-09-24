import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { hashExerciseAttemptRequest, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { KUZUSHIJI_PILOT_EXERCISE_ID } from "./exercises/kuzushiji-pilot.ts";
import { kuzushijiPilotRevisionPayload } from "./exercises/kuzushiji-revision.ts";
import {
  PHILOSOPHY_ARCHE_EXERCISE_ID, PHILOSOPHY_ARCHE_LECTURE_ID, PHILOSOPHY_ARCHE_TERM_ID,
  PHILOSOPHY_ARCHE_TERM_URL, philosophyArcheContentRelease, philosophyArcheDefinition, philosophyArcheRevision,
  philosophyArcheRevisionPayload,
} from "./exercises/philosophy-anaximander.ts";
import { createContentRelease, createContentReleaseManifest, createExerciseRevision, getExerciseRevisionPayload } from "./exercises/revision.ts";
import { createPhilosophyPresentation, hashPhilosophyPresentation } from "./philosophy-pilot-core.ts";
import { issuePhilosophyObjectiveCard, submitPhilosophyObjectiveAttempt } from "./philosophy-pilot-runtime.ts";
import { submitVersionedPilotAttempt } from "./pilot-attempt-dispatch.ts";
import { GET as getPilotReceipt } from "../../../app/api/review/pilot/receipt/route.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const request: ExerciseAttemptRequest = { attemptId, instanceId, rawAnswer: "アペイロン", selfEvaluation: "good", responseMs: 1800, usedHint: false };
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = oldEnv; });

function graph(completion: "completed" | "incomplete" = "completed", sourceState: "ready" | "unavailable" = "ready"): GraphData {
  return { projectId: "philosophy", mode: "notion", nodes: [
    { id: PHILOSOPHY_ARCHE_TERM_ID, kind: "term", label: "アペイロン", meta: "", href: null, notionUrl: PHILOSOPHY_ARCHE_TERM_URL },
  ], edges: [], scope: { sourceState, anchors: [{ id: PHILOSOPHY_ARCHE_LECTURE_ID, completion, date: null,
    directRelations: [{ nodeId: PHILOSOPHY_ARCHE_TERM_ID, kind: "term" }] }] } };
}

function persisted(overrides: Partial<ResolvedObjectiveInstanceArchive> = {}): ResolvedObjectiveInstanceArchive {
  const presentation = createPhilosophyPresentation(philosophyArcheRevisionPayload);
  return {
    instance_id: instanceId, learner_id: learnerId, release_id: philosophyArcheContentRelease.manifestHash,
    revision_id: revisionId, presentation, presentation_hash: hashPhilosophyPresentation(presentation),
    renderer_version: null, adapter_version: null, locale: "ja-JP", scope_evidence: {}, knowledge_binding: null,
    legacy_item_id: PHILOSOPHY_ARCHE_TERM_ID, legacy_item_kind: "knowledge",
    legacy_exercise_id: PHILOSOPHY_ARCHE_EXERCISE_ID, srs_target: "objective", srs_epoch: "1",
    revision_payload: philosophyArcheRevisionPayload, revision_status: "approved",
    project_id: "philosophy", exercise_id: PHILOSOPHY_ARCHE_EXERCISE_ID,
    exercise_version: 1, content_hash: philosophyArcheRevision.contentHash, ...overrides,
  };
}

function issueRow(patch: Record<string, unknown> = {}) {
  return { instance_id: instanceId, release_id: philosophyArcheContentRelease.manifestHash,
    revision_id: revisionId, opportunity_kind: "unseen", effective_evidence_use: "srs", expected_state_revision: 0,
    issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: false, ...patch };
}

function routingRow() {
  return { instance_id: instanceId, project_id: "philosophy", objective_id: PHILOSOPHY_ARCHE_EXERCISE_ID,
    objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
    opportunity_kind: "unseen", expected_state_revision: 0,
    grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
    issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return { receiptVersion: 2, attemptId, instanceId, acceptedAt: "2030-01-01T00:01:00Z",
    projectId: "philosophy", objectiveId: PHILOSOPHY_ARCHE_EXERCISE_ID, objectiveVersion: 1,
    srsEpoch: 1, evidenceUse: "srs", gradingStatus: "graded", isCorrect: true,
    applied: true, reason: "applied", effectiveGrade: "good", stateRevision: 1,
    dueAt: "2030-01-02T00:01:00Z", ...overrides };
}

function setup(handler: (name: string, body: Record<string, unknown>) => unknown) {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.STUDY_GRAPH_LEARNER_ID = learnerId;
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  delete process.env.NOTION_TOKEN;
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.hostname, "fixture.invalid");
    assert.equal(init?.method, "POST");
    const name = parsed.pathname.split("/").at(-1)!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ name, body });
    const response = await handler(name, body);
    return response instanceof Response ? response : Response.json(response);
  };
  return calls;
}

function archiveOrIssue(name: string, body: Record<string, unknown>) {
  if (name === "study_graph_register_objective_archive") {
    assert.equal(body.p_project_id, "philosophy");
    assert.equal(body.p_content_hash, philosophyArcheRevision.contentHash);
    return [{ release_id: philosophyArcheContentRelease.manifestHash, revision_id: revisionId }];
  }
  if (name === "study_graph_register_objective_definition") return [{ objective_id: PHILOSOPHY_ARCHE_EXERCISE_ID }];
  if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
  if (name === "study_graph_issue_objective_instance_v2") {
    assert.equal(body.p_learner_id, learnerId);
    assert.equal(body.p_legacy_item_id, PHILOSOPHY_ARCHE_TERM_ID);
    assert.equal(body.p_legacy_item_kind, "knowledge");
    assert.equal(body.p_intent, "scheduled");
    assert.ok(!Object.hasOwn(body, "p_srs_plan"));
    return [issueRow()];
  }
  if (name === "study_graph_resolve_objective_instance_archive") return [persisted()];
  throw new Error(`unexpected RPC ${name}`);
}

test("issuance requires both exact flags and eligible current Scope", async () => {
  const calls = setup(archiveOrIssue);
  const scope = buildGraphScopeSnapshot("philosophy", graph());
  delete process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
  assert.equal(await issuePhilosophyObjectiveCard(scope), null);
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  assert.equal(await issuePhilosophyObjectiveCard(scope), null);
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  assert.equal(await issuePhilosophyObjectiveCard(buildGraphScopeSnapshot("philosophy", graph("incomplete"))), null);
  assert.equal(await issuePhilosophyObjectiveCard(buildGraphScopeSnapshot("philosophy", graph("completed", "unavailable"))), null);
  assert.equal(calls.length, 0);
});

test("unseen/due issuance and active reuse resolve the persisted instance", async () => {
  const scope = buildGraphScopeSnapshot("philosophy", graph());
  const calls = setup(archiveOrIssue);
  const card = await issuePhilosophyObjectiveCard(scope);
  assert.equal(card?.instanceId, instanceId);
  assert.equal(card?.prompt, philosophyArcheRevision.prompt);
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_register_objective_archive", "study_graph_register_objective_definition",
    "study_graph_register_exercise_objective_binding", "study_graph_issue_objective_instance_v2",
    "study_graph_resolve_objective_instance_archive",
  ]);
  const dueCalls = setup((name, body) => name === "study_graph_issue_objective_instance_v2"
    ? [issueRow({ opportunity_kind: "due", expected_state_revision: 3 })] : archiveOrIssue(name, body));
  assert.equal((await issuePhilosophyObjectiveCard(scope))?.reason, "Objective 復習期限到来");
  assert.equal(dueCalls.length, 5);
  const olderRevision = createExerciseRevision({ ...philosophyArcheDefinition, exerciseVersion: 2,
    prompt: "Earlier immutable prompt", front: "Earlier front" }, new Map(), null);
  const olderRelease = createContentRelease(createContentReleaseManifest([olderRevision]));
  const olderRevisionId = "66666666-6666-4666-8666-666666666666";
  const reusedPresentation = createPhilosophyPresentation(getExerciseRevisionPayload(olderRevision));
  setup((name, body) => name === "study_graph_issue_objective_instance_v2"
    ? [issueRow({ reused: true, release_id: olderRelease.manifestHash, revision_id: olderRevisionId })]
    : name === "study_graph_resolve_objective_instance_archive"
      ? [persisted({ release_id: olderRelease.manifestHash, revision_id: olderRevisionId,
        exercise_version: 2, revision_payload: getExerciseRevisionPayload(olderRevision), content_hash: olderRevision.contentHash,
        presentation: reusedPresentation, presentation_hash: hashPhilosophyPresentation(reusedPresentation) })]
      : archiveOrIssue(name, body));
  assert.equal((await issuePhilosophyObjectiveCard(scope))?.prompt, reusedPresentation.prompt);
});

test("not due is a bounded scheduling result and resolver mismatches fail closed", async () => {
  const scope = buildGraphScopeSnapshot("philosophy", graph());
  setup((name, body) => name === "study_graph_issue_objective_instance_v2"
    ? Response.json({ message: "objective_not_due" }, { status: 409 }) : archiveOrIssue(name, body));
  await assert.rejects(issuePhilosophyObjectiveCard(scope), { code: "objective_not_due" });
  setup((name, body) => name === "study_graph_resolve_objective_instance_archive"
    ? [persisted({ release_id: "wrong" })] : archiveOrIssue(name, body));
  await assert.rejects(issuePhilosophyObjectiveCard(scope), /philosophy_pilot_instance_mismatch/);
});

test("accepted Philosophy retry returns before instance, routing, grading and Scope reads, even with flag OFF", async () => {
  const stored = receipt();
  const calls = setup((name) => {
    assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
    return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
  });
  delete process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  assert.deepEqual((await submitVersionedPilotAttempt(request)).receipt, stored);
  assert.equal(calls.length, 1);
  await assert.rejects(submitVersionedPilotAttempt({ ...request, rawAnswer: "別" }), { code: "attempt_conflict" });
  assert.equal(calls.length, 2);
});

test("legacy and Objective v1 accepted retries also return before project resolution", async () => {
  const legacy = {
    receiptVersion: 1, attemptId, instanceId, acceptedAt: "2030-01-01T00:01:00Z",
    gradingStatus: "graded", isCorrect: true, effectiveSrsGrade: "good",
    srsApplied: true, srsReason: "applied", legacyReviewAttemptId: 1,
    reviewStateBefore: null, reviewStateAfter: { due_at: "2030-01-02T00:00:00Z" },
  };
  for (const stored of [legacy, receipt({ receiptVersion: 1 })]) {
    const calls = setup((name) => {
      assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
      return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
    });
    assert.deepEqual((await submitVersionedPilotAttempt(request)).receipt, stored);
    assert.equal(calls.length, 1);
  }
});

test("Philosophy first acceptance grades immutable revision, re-reads Scope, and leaves SRS plan to DB", async () => {
  let scopeReads = 0;
  const calls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_routing") return [routingRow()];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_is_correct, true);
    assert.equal(body.p_scope_accepted, true);
    assert.equal(body.p_epoch_active, true);
    assert.equal(body.p_request_hash, hashExerciseAttemptRequest(request));
    assert.ok(!Object.hasOwn(body, "p_srs_applied"));
    assert.ok(!Object.hasOwn(body, "p_srs_reason"));
    return [{ receipt: receipt() }];
  });
  const result = await submitPhilosophyObjectiveAttempt(request, persisted(), async () => { scopeReads++; return graph(); });
  assert.equal(result.srsApplied, true);
  assert.equal(scopeReads, 1);
  assert.deepEqual(calls.map((call) => call.name), ["study_graph_get_kuzushiji_pilot_attempt_receipt",
    "study_graph_resolve_objective_instance_routing", "study_graph_record_objective_attempt_v2"]);
  const noSrsCalls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_routing") return [routingRow()];
    assert.equal(body.p_scope_accepted, false);
    return [{ receipt: receipt({ applied: false, reason: "scope-not-eligible", effectiveGrade: null, stateRevision: null, dueAt: null }) }];
  });
  assert.equal((await submitPhilosophyObjectiveAttempt(request, persisted(), async () => graph("incomplete"))).srsApplied, false);
  assert.equal(noSrsCalls.length, 3);
  await assert.rejects(submitPhilosophyObjectiveAttempt(request, persisted({ legacy_item_id: "wrong" }), async () => graph()));
});

test("dispatcher uses persisted Philosophy project, not a browser selector", async () => {
  const calls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_archive") return [persisted()];
    if (name === "study_graph_resolve_objective_instance_routing") return [routingRow()];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_scope_accepted, false); // No Notion token: fresh source is unavailable.
    return [{ receipt: receipt({ applied: false, reason: "scope-not-eligible", effectiveGrade: null, stateRevision: null, dueAt: null }) }];
  });
  const result = await submitVersionedPilotAttempt(request);
  assert.equal(result.srsApplied, false);
  assert.equal(calls.filter((call) => call.name === "study_graph_record_objective_attempt_v2").length, 1);
  setup((name) => name === "study_graph_get_kuzushiji_pilot_attempt_receipt" ? [] : [persisted({ project_id: "unsupported" })]);
  await assert.rejects(submitVersionedPilotAttempt(request), { code: "unsupported_pilot_instance" });
});

test("persisted Kuzushiji project still dispatches through the historical v1 writer", async () => {
  const legacyReceipt = {
    receiptVersion: 1, attemptId, instanceId, acceptedAt: "2030-01-01T00:01:00Z",
    gradingStatus: "graded", isCorrect: false, effectiveSrsGrade: null,
    srsApplied: false, srsReason: "scope-not-eligible", legacyReviewAttemptId: null,
    reviewStateBefore: null, reviewStateAfter: null,
  };
  const calls = setup((name) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_archive") return [persisted({ project_id: "kuzushiji", exercise_id: KUZUSHIJI_PILOT_EXERCISE_ID, srs_target: "legacy-item" })];
    if (name === "study_graph_resolve_kuzushiji_pilot_instance") return [{
      instance_id: instanceId, project_id: "kuzushiji", exercise_id: KUZUSHIJI_PILOT_EXERCISE_ID,
      srs_target: "legacy-item", legacy_item_id: "fixture-character", revision_status: "approved",
      revision_payload: kuzushijiPilotRevisionPayload,
    }];
    assert.equal(name, "study_graph_record_exercise_attempt");
    return [{ receipt: legacyReceipt }];
  });
  assert.equal((await submitVersionedPilotAttempt(request)).srsApplied, false);
  assert.equal(calls.filter((call) => call.name === "study_graph_record_exercise_attempt").length, 1);
  assert.equal(calls.some((call) => call.name === "study_graph_record_objective_attempt_v2"), false);
});

test("read-only receipt endpoint resolves Philosophy and Kuzushiji through trusted learner ownership", async () => {
  for (const [projectId, target, kind] of [
    ["philosophy", "objective", "objective"], ["kuzushiji", "legacy-item", "legacy"],
  ] as const) {
    const calls = setup((name, body) => {
      assert.equal(body.p_instance_id, instanceId);
      assert.equal(body.p_learner_id, learnerId);
      if (name === "study_graph_resolve_objective_instance_archive") return [persisted({ project_id: projectId, srs_target: target })];
      assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
      return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: receipt() }];
    });
    const response = await getPilotReceipt(new Request(`https://fixture.invalid/api/review/pilot/receipt?instanceId=${instanceId}`));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).receiptKind, kind);
    assert.deepEqual(calls.map((call) => call.name), ["study_graph_resolve_objective_instance_archive",
      "study_graph_get_kuzushiji_pilot_attempt_receipt"]);
  }
  const calls = setup((name) => {
    assert.equal(name, "study_graph_resolve_objective_instance_archive");
    return [];
  });
  assert.equal((await getPilotReceipt(new Request(`https://fixture.invalid/api/review/pilot/receipt?instanceId=${instanceId}`))).status, 404);
  assert.equal(calls.length, 1);
  const mismatchCalls = setup((name) => {
    assert.equal(name, "study_graph_resolve_objective_instance_archive");
    return [persisted({ learner_id: "99999999-9999-4999-8999-999999999999" })];
  });
  assert.equal((await getPilotReceipt(new Request(`https://fixture.invalid/api/review/pilot/receipt?instanceId=${instanceId}`))).status, 409);
  assert.equal(mismatchCalls.length, 1);
});
