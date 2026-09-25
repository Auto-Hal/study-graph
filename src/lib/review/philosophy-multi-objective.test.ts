import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { gradeExerciseRevision, hashExerciseAttemptRequest, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { philosophyAnaximenes, philosophyThales } from "./exercises/philosophy-arche-additions.ts";
import { PHILOSOPHY_ARCHE_LECTURE_ID } from "./exercises/philosophy-anaximander.ts";
import { hashObjectiveDefinition } from "./objectives.ts";
import { philosophyObjectiveRegistry, philosophyObjectiveScopeSubjectIds, type PhilosophyObjectiveEntry } from "./philosophy-objective-registry.ts";
import { createPhilosophyPresentation, decodePhilosophyInstance, hashPhilosophyPresentation } from "./philosophy-pilot-core.ts";
import { issuePhilosophyObjectiveCards, submitPhilosophyObjectiveAttempt } from "./philosophy-pilot-runtime.ts";
import { submitVersionedPilotAttempt } from "./pilot-attempt-dispatch.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const attemptId = "44444444-4444-4444-8444-444444444444";
const originalFetch = globalThis.fetch;
const oldEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = oldEnv; });

function uuid(index: number) { return `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`; }
function revisionUuid(index: number) { return `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`; }
function indexOf(entry: PhilosophyObjectiveEntry) { return philosophyObjectiveRegistry.indexOf(entry) + 1; }

function graph(eligibleIds = philosophyObjectiveScopeSubjectIds): GraphData {
  return {
    projectId: "philosophy", mode: "notion",
    nodes: philosophyObjectiveRegistry.map((entry) => ({ id: entry.scopeSubjectId, kind: "term" as const,
      label: entry.revisionPayload.front, meta: "", href: null, notionUrl: entry.scopeSubjectUrl })),
    edges: [], scope: { sourceState: "ready", anchors: [{ id: PHILOSOPHY_ARCHE_LECTURE_ID, completion: "completed",
      date: null, directRelations: eligibleIds.map((nodeId) => ({ nodeId, kind: "term" as const })) }] },
  };
}

function persisted(entry: PhilosophyObjectiveEntry, patch: Partial<ResolvedObjectiveInstanceArchive> = {}): ResolvedObjectiveInstanceArchive {
  const index = indexOf(entry);
  const presentation = createPhilosophyPresentation(entry.revisionPayload, entry);
  return {
    instance_id: uuid(index), learner_id: learnerId, release_id: entry.contentRelease.manifestHash,
    revision_id: revisionUuid(index), presentation, presentation_hash: hashPhilosophyPresentation(presentation),
    renderer_version: null, adapter_version: null, locale: "ja-JP", scope_evidence: {}, knowledge_binding: null,
    legacy_item_id: entry.scopeSubjectId, legacy_item_kind: "knowledge", legacy_exercise_id: entry.exerciseId,
    srs_target: "objective", srs_epoch: String(entry.srsEpoch), revision_payload: entry.revisionPayload,
    revision_status: "approved", project_id: "philosophy", exercise_id: entry.exerciseId,
    exercise_version: entry.revision.exerciseVersion, content_hash: entry.revision.contentHash, ...patch,
  };
}

function setup(handler: (name: string, body: Record<string, unknown>) => unknown) {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.STUDY_GRAPH_LEARNER_ID = learnerId;
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED = "true";
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.hostname, "fixture.invalid");
    const name = parsed.pathname.split("/").at(-1)!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ name, body });
    const result = handler(name, body);
    return result instanceof Response ? result : Response.json(result);
  };
  return calls;
}

test("trusted registry pins order, immutable hashes and text-only Git content", () => {
  assert.deepEqual(philosophyObjectiveRegistry.map((entry) => entry.exerciseId), [
    "philosophy.thales.arche-recall", "philosophy.anaximander.arche-recall", "philosophy.anaximenes.arche-recall",
  ]);
  const hashes = [
    ["912c2a4ef680477847ea3b801fce9e569e6b6f73c980980dd88cf1885a0424d1", "9a0027343407db622e87a6eaa64fcf8fb7f5e6e9df3d8f84a81f53f16a81ccaa", "2d4b2c056a5bee927d426faa165b34da1994578bc860efda02be63a8fc9a5697"],
    ["e447af0932b075e2b57cc6ce200cfc499ef4f6dd002196ee4ceb9a9bbfc27318", "d16990dd6dc12cbca7187f10e626f520c9bace8572fa94a02c2bad1ce0f1e064", "03b0197db1ca4ce1ef90301035715c412d8cc49f98ef78d438c490276d86652f"],
    ["8890890620cf98838bf698af8fb5cf7bbc3f52a4d54c42e2e40f5234c5233898", "53e994bdad3c2e75b3c4e6f733eb0b89f5f07fe2d591e43eee150377a7376c3a", "2f8b7edbf67b766f877792213c36f5f5fab1ac9d636b617e92f1d4d6272c0b78"],
  ];
  philosophyObjectiveRegistry.forEach((entry, index) => {
    assert.equal(entry.revision.contentHash, hashes[index][0]);
    assert.equal(entry.contentRelease.manifestHash, hashes[index][1]);
    assert.equal(hashObjectiveDefinition(entry.objectiveDefinition), hashes[index][2]);
    assert.equal(entry.revisionPayload.pilotMetadata, null);
    assert.equal(entry.revisionPayload.stimuli.length, 0);
    assert.equal(entry.revisionPayload.visualAssets.length, 0);
    assert.equal(entry.contentRelease.manifest.revisionEntries[0].assets.length, 0);
    assert.equal(entry.objectiveBinding.revisionContentHash, entry.revision.contentHash);
    assert.equal(entry.objectiveBinding.evidenceUse, "srs");
    assert.equal(entry.revisionPayload.gradingSpec.strategyId, "legacy-text-v1");
    assert.equal(entry.revisionPayload.gradingSpec.normalization, "review-session-ja-v1");
    assert.deepEqual(entry.revisionPayload.sources.map((source) => source.url), [
      "https://app.notion.com/p/3bdd279341348105904bd47a4f0f6f52", entry.scopeSubjectUrl,
    ]);
    assert.ok(entry.revisionPayload.sources.every((source) => !source.url.includes("example.invalid")));
    assert.equal(gradeExerciseRevision(entry.revisionPayload, entry.revisionPayload.answerSpec.acceptedAnswers[0]).isCorrect, true);
    assert.equal(gradeExerciseRevision(entry.revisionPayload, "誤答").isCorrect, false);
  });
  assert.equal(philosophyThales.definition.answerSpec.acceptedAnswers[0], "水");
  assert.equal(philosophyAnaximenes.definition.answerSpec.acceptedAnswers[0], "空気");
});

test("each registered subject is eligible only through the completed lecture", () => {
  const ready = buildGraphScopeSnapshot("philosophy", graph());
  for (const id of philosophyObjectiveScopeSubjectIds) assert.equal(ready.decisions[id]?.status, "eligible");
  const partial = buildGraphScopeSnapshot("philosophy", graph([philosophyObjectiveScopeSubjectIds[1]]));
  assert.equal(partial.decisions[philosophyObjectiveScopeSubjectIds[0]]?.status, "unknown");
  assert.equal(partial.decisions[philosophyObjectiveScopeSubjectIds[1]]?.status, "eligible");
});

test("three independent scheduled issuances are ordered and use their own authority", async () => {
  const calls = setup((name, body) => {
    if (name === "study_graph_register_objective_archive") {
      const entry = philosophyObjectiveRegistry.find((candidate) => candidate.exerciseId === body.p_exercise_id)!;
      assert.equal(body.p_content_hash, entry.revision.contentHash);
      return [{ release_id: entry.contentRelease.manifestHash, revision_id: revisionUuid(indexOf(entry)) }];
    }
    if (name === "study_graph_register_objective_definition") return [{ objective_id: body.p_objective_id }];
    if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
    if (name === "study_graph_issue_objective_instance_v2") {
      const entry = philosophyObjectiveRegistry.find((candidate) => candidate.scopeSubjectId === body.p_legacy_item_id)!;
      assert.equal(body.p_legacy_exercise_id, entry.exerciseId);
      assert.equal(body.p_srs_epoch, entry.srsEpoch);
      assert.equal(body.p_intent, "scheduled");
      return [{ instance_id: uuid(indexOf(entry)), release_id: entry.contentRelease.manifestHash,
        revision_id: revisionUuid(indexOf(entry)), opportunity_kind: "unseen", effective_evidence_use: "srs",
        expected_state_revision: 0, issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: false }];
    }
    if (name === "study_graph_resolve_objective_instance_archive") {
      const entry = philosophyObjectiveRegistry.find((candidate) => uuid(indexOf(candidate)) === body.p_instance_id)!;
      return [persisted(entry)];
    }
    throw new Error(name);
  });
  const cards = await issuePhilosophyObjectiveCards(buildGraphScopeSnapshot("philosophy", graph()));
  assert.deepEqual(cards.map((card) => card.id), philosophyObjectiveScopeSubjectIds);
  assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 3);
  assert.equal(calls.filter((call) => call.name === "study_graph_resolve_objective_instance_archive").length, 3);
});

test("registered persisted identity chooses the decoder; cross-objective and unsupported rows fail closed", () => {
  for (const entry of philosophyObjectiveRegistry) {
    assert.equal(decodePhilosophyInstance(persisted(entry)).entry.exerciseId, entry.exerciseId);
    assert.throws(() => decodePhilosophyInstance(persisted(entry, { legacy_item_id: "wrong" })));
    assert.throws(() => decodePhilosophyInstance(persisted(entry, { exercise_id: "philosophy.unsupported" })));
    assert.throws(() => decodePhilosophyInstance(persisted(entry, { revision_payload: { ...entry.revisionPayload,
      answerSpec: { type: "text", acceptedAnswers: ["forged"] } } })));
  }
});

test("accepted retry returns before resolving any project or Scope", async () => {
  const entry = philosophyObjectiveRegistry[0];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: uuid(1), rawAnswer: "水",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  const stored = { receiptVersion: 2, attemptId, instanceId: uuid(1), acceptedAt: "2030-01-01T00:01:00Z",
    projectId: "philosophy", objectiveId: entry.objectiveId, objectiveVersion: 1, srsEpoch: 1,
    evidenceUse: "srs", gradingStatus: "graded", isCorrect: true, applied: true, reason: "applied",
    effectiveGrade: "good", stateRevision: 1, dueAt: "2030-01-02T00:00:00Z" };
  const calls = setup((name) => {
    assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
    return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
  });
  delete process.env.STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED;
  assert.deepEqual((await submitVersionedPilotAttempt(request)).receipt, stored);
  assert.equal(calls.length, 1);
});

test("first acceptance rejects an unregistered persisted Philosophy exercise before routing or grading", async () => {
  const entry = philosophyObjectiveRegistry[0];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: uuid(1), rawAnswer: "水",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  const calls = setup((name) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    assert.equal(name, "study_graph_resolve_objective_instance_archive");
    return [persisted(entry, { exercise_id: "philosophy.unregistered" })];
  });
  await assert.rejects(submitVersionedPilotAttempt(request), { code: "unsupported_pilot_instance" });
  assert.deepEqual(calls.map((call) => call.name), ["study_graph_get_kuzushiji_pilot_attempt_receipt",
    "study_graph_resolve_objective_instance_archive"]);
});

test("not-due and failed issuance are isolated; neither falls back to another Objective", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const calls = setup((name, body) => {
      if (name === "study_graph_register_objective_archive") {
        const entry = philosophyObjectiveRegistry.find((candidate) => candidate.exerciseId === body.p_exercise_id)!;
        if (entry === philosophyObjectiveRegistry[1]) return Response.json({ message: "archive_unavailable" }, { status: 503 });
        return [{ release_id: entry.contentRelease.manifestHash, revision_id: revisionUuid(indexOf(entry)) }];
      }
      if (name === "study_graph_register_objective_definition") return [{ objective_id: body.p_objective_id }];
      if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
      if (name === "study_graph_issue_objective_instance_v2") {
        if (body.p_legacy_item_id === philosophyObjectiveRegistry[0].scopeSubjectId) {
          return Response.json({ message: "objective_not_due" }, { status: 409 });
        }
        const entry = philosophyObjectiveRegistry[2];
        return [{ instance_id: uuid(3), release_id: entry.contentRelease.manifestHash, revision_id: revisionUuid(3),
          opportunity_kind: "due", effective_evidence_use: "srs", expected_state_revision: 1,
          issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: true }];
      }
      if (name === "study_graph_resolve_objective_instance_archive") return [persisted(philosophyObjectiveRegistry[2])];
      throw new Error(name);
    });
    const cards = await issuePhilosophyObjectiveCards(buildGraphScopeSnapshot("philosophy", graph()));
    assert.deepEqual(cards.map((card) => card.id), [philosophyObjectiveRegistry[2].scopeSubjectId]);
    assert.equal(cards[0].reason, "Objective 復習期限到来");
    assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 2);
  } finally { console.warn = originalWarn; }
});

test("each registered Objective grades its persisted revision with its own fresh Scope and trusted epoch", async () => {
  for (const entry of philosophyObjectiveRegistry) {
    const request: ExerciseAttemptRequest = { attemptId, instanceId: uuid(indexOf(entry)),
      rawAnswer: entry.revisionPayload.answerSpec.acceptedAnswers[0], selfEvaluation: "good", responseMs: 1000, usedHint: false };
    let graphReads = 0;
    const calls = setup((name, body) => {
      if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
      if (name === "study_graph_resolve_objective_instance_routing") return [{
        instance_id: request.instanceId, project_id: "philosophy", objective_id: entry.objectiveId,
        objective_version: entry.objectiveDefinition.objectiveVersion, srs_epoch: entry.srsEpoch,
        evidence_use: "srs", scheduling_context_version: 1, opportunity_kind: "unseen",
        expected_state_revision: 0, grade_policy_version: "deterministic-correctness-cap-v1",
        activation_policy_version: "on-publication-v1", issued_at: "2030-01-01T00:00:00Z",
        expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
      }];
      assert.equal(name, "study_graph_record_objective_attempt_v2");
      assert.equal(body.p_is_correct, true);
      assert.equal(body.p_scope_accepted, true);
      assert.equal(body.p_epoch_active, true);
      assert.equal(body.p_request_hash, hashExerciseAttemptRequest(request));
      assert.equal(Object.hasOwn(body, "p_srs_plan"), false);
      return [{ receipt: { receiptVersion: 2, attemptId, instanceId: request.instanceId,
        acceptedAt: "2030-01-01T00:01:00Z", projectId: "philosophy", objectiveId: entry.objectiveId,
        objectiveVersion: 1, srsEpoch: 1, evidenceUse: "srs", gradingStatus: "graded", isCorrect: true,
        applied: true, reason: "applied", effectiveGrade: "good", stateRevision: 1,
        dueAt: "2030-01-02T00:00:00Z" } }];
    });
    const result = await submitPhilosophyObjectiveAttempt(request, persisted(entry), async () => { graphReads++; return graph(); });
    assert.equal(result.srsApplied, true);
    assert.equal(graphReads, 1);
    assert.deepEqual(calls.map((call) => call.name), ["study_graph_get_kuzushiji_pilot_attempt_receipt",
      "study_graph_resolve_objective_instance_routing", "study_graph_record_objective_attempt_v2"]);
  }
});
