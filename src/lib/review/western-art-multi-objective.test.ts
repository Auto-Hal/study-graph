import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { getStudyProject } from "../projects/registry.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { gradeExerciseRevision, hashExerciseAttemptRequest, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import {
  WESTERN_ART_CROMLECH_LECTURE_ID, WESTERN_ART_CROMLECH_LECTURE_URL,
} from "./exercises/western-art-cromlech.ts";
import { westernArtMenhir, westernArtDolmen, westernArtTrilithon } from "./exercises/western-art-megalith-additions.ts";
import { createContentRelease, createContentReleaseManifest, createExerciseRevision, getExerciseRevisionPayload } from "./exercises/revision.ts";
import { hashObjectiveDefinition } from "./objectives.ts";
import { ObjectiveRuntimeError } from "./objective-runtime-core.ts";
import { submitVersionedPilotAttempt } from "./pilot-attempt-dispatch.ts";
import { loadGraphPractice } from "./registry.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import {
  createWesternArtPresentation, decodeWesternArtInstance, hashWesternArtPresentation,
  westernArtCardFromPersisted, westernArtPilotEnabled,
} from "./western-art-pilot-core.ts";
import {
  issueWesternArtObjectiveCard, issueWesternArtObjectiveCards, submitWesternArtObjectiveAttempt,
} from "./western-art-pilot-runtime.ts";
import {
  getWesternArtObjectiveByExerciseId, westernArtObjectiveRegistry, westernArtObjectiveScopeSubjectIds,
  type WesternArtObjectiveEntry,
} from "./western-art-objective-registry.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const attemptId = "44444444-4444-4444-8444-444444444444";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

function numberOf(entry: WesternArtObjectiveEntry) { return westernArtObjectiveRegistry.indexOf(entry) + 1; }
function instanceId(entry: WesternArtObjectiveEntry) { return `22222222-2222-4222-8222-${String(numberOf(entry)).padStart(12, "0")}`; }
function revisionId(entry: WesternArtObjectiveEntry) { return `33333333-3333-4333-8333-${String(numberOf(entry)).padStart(12, "0")}`; }

function graph(ids: readonly string[] = westernArtObjectiveScopeSubjectIds, date = "2026-08-23"): GraphData & { mode: "notion" } {
  return {
    projectId: "western-art-history", mode: "notion",
    nodes: [...westernArtObjectiveRegistry.map((entry) => ({
      id: entry.scopeSubjectId, kind: "term" as const,
      label: entry.revisionPayload.answerSpec.acceptedAnswers[0],
      reviewText: entry.revisionPayload.explanation.summary,
      meta: "", href: null, notionUrl: entry.scopeSubjectUrl,
    })), { id: "other-art", kind: "term" as const, label: "Other", reviewText: "Other",
      meta: "", href: null, notionUrl: "https://example.test/other" }],
    edges: [], scope: { sourceState: "ready", anchors: [{
      id: WESTERN_ART_CROMLECH_LECTURE_ID, completion: "unknown", date,
      directRelations: [...ids, "other-art"].map((nodeId) => ({ nodeId, kind: "term" as const })),
    }] },
  };
}

function persisted(entry: WesternArtObjectiveEntry, patch: Partial<ResolvedObjectiveInstanceArchive> = {}): ResolvedObjectiveInstanceArchive {
  const presentation = createWesternArtPresentation(entry.revisionPayload, entry);
  return {
    instance_id: instanceId(entry), learner_id: learnerId,
    release_id: entry.contentRelease.manifestHash, revision_id: revisionId(entry),
    presentation, presentation_hash: hashWesternArtPresentation(presentation),
    renderer_version: null, adapter_version: null, locale: "ja-JP",
    scope_evidence: {}, knowledge_binding: { source: "notion", externalId: entry.scopeSubjectId, role: "scope-subject" },
    legacy_item_id: entry.scopeSubjectId, legacy_item_kind: "knowledge", legacy_exercise_id: entry.exerciseId,
    srs_target: "objective", srs_epoch: String(entry.srsEpoch), revision_payload: entry.revisionPayload,
    revision_status: "approved", project_id: "western-art-history", exercise_id: entry.exerciseId,
    exercise_version: entry.revision.exerciseVersion, content_hash: entry.revision.contentHash, ...patch,
  };
}

function setup(handler: (name: string, body: Record<string, unknown>) => unknown) {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.STUDY_GRAPH_LEARNER_ID = learnerId;
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED = "true";
  delete process.env.NOTION_TOKEN;
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

function receipt(entry: WesternArtObjectiveEntry) {
  return {
    receiptVersion: 2, attemptId, instanceId: instanceId(entry), acceptedAt: "2030-01-01T00:01:00Z",
    projectId: "western-art-history", objectiveId: entry.objectiveId, objectiveVersion: 1,
    srsEpoch: 1, evidenceUse: "srs", gradingStatus: "graded", isCorrect: true,
    applied: true, reason: "applied", effectiveGrade: "good", stateRevision: 1,
    dueAt: "2030-01-02T00:00:00Z",
  };
}

test("four trusted entries have pinned immutable content, order and deterministic grading", () => {
  assert.deepEqual(westernArtObjectiveRegistry.map((entry) => entry.exerciseId), [
    "western-art-history.menhir.term-recall", "western-art-history.dolmen.term-recall",
    "western-art-history.cromlech.term-recall", "western-art-history.trilithon.term-recall",
  ]);
  const hashes = [
    ["0a3f0aafad6441b5754d0304db84daf688bd2187ef34dafe8b8beaeec8994fc0", "056d17d96abbd802801d662708bbf91855736449d97f91c0182a0be40773232c", "406cbef1ff048e75d4cf5266689467a74fef5ffb81b9cb87a5df2ac594382e9c"],
    ["3e282a78882fc4c0816fbdd650afbdf31df62d0b51384aa46b27f1324ef68a4b", "8accad42a2e7d9e048fb02ab506ea81940a051c52e0ffa05a27f5e64ffee49cb", "bd37811d9a6e7e46bca3a908b8d7672cba58f784eae5e7bbf8c65fa741f59764"],
    ["45f396e0c74c6f725c4ecf200bd05d310d18690860e90a84f6f91fded43666a2", "12d874ecfd9fb2416b932f5efba77799bad2ccbe9616988d141c922456180fc8", "1d9c10b837b2a7ed91a7458221ad0dcdb23c73abfcee6758e0820800b352fbf5"],
    ["1ab7c95f1da0cde7d3be95bcbba0f000adc33abbad596891e7b21fecc0bdf2d4", "8f134dc8be07d4de83c2cef5a4b5ef6fa728d7e49724a81ab5d9d076f6b42a1a", "61a3a44f3dd5b05c671036460c4953f156630e0dad9e67b98d51bc480b761e9f"],
  ];
  westernArtObjectiveRegistry.forEach((entry, index) => {
    assert.equal(entry.revision.contentHash, hashes[index][0]);
    assert.equal(entry.contentRelease.manifestHash, hashes[index][1]);
    assert.equal(hashObjectiveDefinition(entry.objectiveDefinition), hashes[index][2]);
    assert.equal(entry.revisionPayload.projectId, "western-art-history");
    assert.equal(entry.revisionPayload.pilotMetadata, null);
    assert.deepEqual(entry.revisionPayload.stimuli, []);
    assert.deepEqual(entry.revisionPayload.visualAssets, []);
    assert.deepEqual(entry.contentRelease.manifest.revisionEntries[0].assets, []);
    assert.equal(entry.objectiveDefinition.objectiveVersion, 1);
    assert.equal(entry.srsEpoch, 1);
    assert.equal(entry.objectiveBinding.evidenceUse, "srs");
    assert.equal(entry.objectiveBinding.revisionContentHash, entry.revision.contentHash);
    assert.deepEqual(entry.revisionPayload.sources.map((source) => source.url), [WESTERN_ART_CROMLECH_LECTURE_URL, entry.scopeSubjectUrl]);
    assert.equal(gradeExerciseRevision(entry.revisionPayload, entry.revisionPayload.answerSpec.acceptedAnswers[0]).isCorrect, true);
    assert.equal(gradeExerciseRevision(entry.revisionPayload, "誤答").isCorrect, false);
  });
  assert.equal(westernArtMenhir.definition.answerSpec.acceptedAnswers[0], "メンヒル");
  assert.equal(westernArtDolmen.definition.answerSpec.acceptedAnswers[0], "ドルメン");
  assert.equal(westernArtTrilithon.definition.answerSpec.acceptedAnswers[0], "トリリトン");
  assert.deepEqual(westernArtObjectiveScopeSubjectIds, westernArtObjectiveRegistry.map((entry) => entry.scopeSubjectId));
  for (const entry of westernArtObjectiveRegistry) assert.equal(getWesternArtObjectiveByExerciseId(entry.exerciseId), entry);
  assert.equal(getWesternArtObjectiveByExerciseId("western-art-history.unsupported"), null);
});

test("Art flag remains exact true and all four Scope subjects retain date-only eligibility", () => {
  for (const value of [undefined, "", "false", "TRUE", "1", "on"]) assert.equal(westernArtPilotEnabled(value), false);
  assert.equal(westernArtPilotEnabled("true"), true);
  const now = new Date("2026-09-25T00:00:00Z");
  const ready = buildGraphScopeSnapshot("western-art-history", graph(), now);
  const future = buildGraphScopeSnapshot("western-art-history", graph(undefined, "2026-09-26"), now);
  for (const id of westernArtObjectiveScopeSubjectIds) {
    assert.equal(ready.decisions[id].status, "eligible");
    assert.equal(future.decisions[id].status, "ineligible");
  }
});

test("registry excludes all four before legacy selection, prepends Objective cards and caps session", async () => {
  process.env.STUDY_GRAPH_APP_TOKEN = "";
  const project = getStudyProject("western-art-history")!;
  delete process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED;
  const off = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => { throw Error("must not issue"); } });
  assert.ok(off.cards.some((card) => westernArtObjectiveScopeSubjectIds.includes(card.id)), JSON.stringify(off.cards.map((card) => card.id)));
  process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED = "true";
  const objectiveCards = westernArtObjectiveRegistry.map((entry) => westernArtCardFromPersisted(decodeWesternArtInstance(persisted(entry)), "unseen"));
  const on = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => objectiveCards });
  assert.deepEqual(on.cards.slice(0, 4).map((card) => card.id), westernArtObjectiveScopeSubjectIds);
  assert.equal(on.cards.length <= project.review.sessionSize, true);
  assert.equal(on.cards.filter((card) => westernArtObjectiveScopeSubjectIds.includes(card.id)).length, 4);
  const absent = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => [] });
  assert.ok(absent.cards.every((card) => !westernArtObjectiveScopeSubjectIds.includes(card.id)));
});

test("four independent issuances use per-entry archive, Scope and persisted instance", async () => {
  const calls = setup((name, body) => {
    if (name === "study_graph_register_objective_archive") {
      const entry = westernArtObjectiveRegistry.find((candidate) => candidate.exerciseId === body.p_exercise_id)!;
      assert.equal(body.p_content_hash, entry.revision.contentHash);
      return [{ release_id: entry.contentRelease.manifestHash, revision_id: revisionId(entry) }];
    }
    if (name === "study_graph_register_objective_definition") return [{ objective_id: body.p_objective_id }];
    if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
    if (name === "study_graph_issue_objective_instance_v2") {
      const entry = westernArtObjectiveRegistry.find((candidate) => candidate.scopeSubjectId === body.p_legacy_item_id)!;
      assert.equal(body.p_legacy_exercise_id, entry.exerciseId);
      assert.equal(body.p_srs_epoch, 1);
      assert.equal(body.p_intent, "scheduled");
      return [{ instance_id: instanceId(entry), release_id: entry.contentRelease.manifestHash,
        revision_id: revisionId(entry), opportunity_kind: "unseen", effective_evidence_use: "srs",
        expected_state_revision: 0, issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: false }];
    }
    if (name === "study_graph_resolve_objective_instance_archive") {
      const entry = westernArtObjectiveRegistry.find((candidate) => instanceId(candidate) === body.p_instance_id)!;
      return [persisted(entry)];
    }
    throw Error(name);
  });
  const cards = await issueWesternArtObjectiveCards(buildGraphScopeSnapshot("western-art-history", graph()));
  assert.deepEqual(cards.map((card) => card.id), westernArtObjectiveScopeSubjectIds);
  assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 4);
  assert.equal(calls.filter((call) => call.name === "study_graph_resolve_objective_instance_archive").length, 4);
});

test("not-due and failure are isolated; neither restores a legacy Art term", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const calls = setup((name, body) => {
      const entry = westernArtObjectiveRegistry.find((candidate) => candidate.exerciseId === body.p_exercise_id);
      if (name === "study_graph_register_objective_archive") {
        if (entry === westernArtObjectiveRegistry[1]) return Response.json({ message: "archive_unavailable" }, { status: 503 });
        return [{ release_id: entry!.contentRelease.manifestHash, revision_id: revisionId(entry!) }];
      }
      if (name === "study_graph_register_objective_definition") return [{ objective_id: body.p_objective_id }];
      if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
      if (name === "study_graph_issue_objective_instance_v2") {
        const selected = westernArtObjectiveRegistry.find((candidate) => candidate.scopeSubjectId === body.p_legacy_item_id)!;
        if (selected === westernArtObjectiveRegistry[0]) return Response.json({ message: "objective_not_due" }, { status: 409 });
        return [{ instance_id: instanceId(selected), release_id: selected.contentRelease.manifestHash,
          revision_id: revisionId(selected), opportunity_kind: "due", effective_evidence_use: "srs",
          expected_state_revision: 1, issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: true }];
      }
      if (name === "study_graph_resolve_objective_instance_archive") {
        const selected = westernArtObjectiveRegistry.find((candidate) => instanceId(candidate) === body.p_instance_id)!;
        return [persisted(selected)];
      }
      throw Error(name);
    });
    const cards = await issueWesternArtObjectiveCards(buildGraphScopeSnapshot("western-art-history", graph()));
    assert.deepEqual(cards.map((card) => card.id), westernArtObjectiveScopeSubjectIds.slice(2));
    assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 3);
    const project = getStudyProject("western-art-history")!;
    const loaded = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => cards });
    assert.ok(loaded.cards.every((card) => !westernArtObjectiveScopeSubjectIds.slice(0, 2).includes(card.id)));
  } finally { console.warn = originalWarn; }
});

test("reused instance is rendered from persisted archive and cannot cross registered Objectives", async () => {
  const entry = westernArtObjectiveRegistry[0];
  const original = westernArtMenhir.definition;
  const oldRevision = createExerciseRevision({ ...original, exerciseVersion: 2,
    prompt: "Persisted earlier Menhir prompt", front: "Persisted earlier front" }, new Map(), null);
  const oldPayload = getExerciseRevisionPayload(oldRevision);
  const oldRelease = createContentRelease(createContentReleaseManifest([oldRevision]));
  const oldPresentation = createWesternArtPresentation(oldPayload, entry);
  setup((name) => {
    if (name === "study_graph_register_objective_archive") return [{ release_id: entry.contentRelease.manifestHash, revision_id: revisionId(entry) }];
    if (name === "study_graph_register_objective_definition") return [{ objective_id: entry.objectiveId }];
    if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
    if (name === "study_graph_issue_objective_instance_v2") return [{ instance_id: instanceId(entry),
      release_id: oldRelease.manifestHash, revision_id: revisionId(westernArtObjectiveRegistry[3]),
      opportunity_kind: "due", effective_evidence_use: "srs", expected_state_revision: 2,
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: true }];
    if (name === "study_graph_resolve_objective_instance_archive") return [persisted(entry, {
      release_id: oldRelease.manifestHash, revision_id: revisionId(westernArtObjectiveRegistry[3]),
      exercise_version: 2, revision_payload: oldPayload, content_hash: oldRevision.contentHash,
      presentation: oldPresentation, presentation_hash: hashWesternArtPresentation(oldPresentation),
    })];
    throw Error(name);
  });
  const scope = buildGraphScopeSnapshot("western-art-history", graph([entry.scopeSubjectId]));
  const card = await issueWesternArtObjectiveCard(scope, entry);
  assert.equal(card?.prompt, oldPayload.prompt);
  assert.equal(card?.front, oldPayload.front);
  assert.notEqual(card?.prompt, entry.revisionPayload.prompt);
  assert.throws(() => decodeWesternArtInstance(persisted(entry, { exercise_id: westernArtObjectiveRegistry[1].exerciseId })));
  assert.throws(() => decodeWesternArtInstance(persisted(entry, { exercise_id: "western-art-history.unsupported" })));
});

test("accepted retry is Receipt-first before persisted routing, grading or Scope with Art flag off", async () => {
  const entry = westernArtObjectiveRegistry[0];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry), rawAnswer: "メンヒル",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  const stored = receipt(entry);
  const calls = setup((name) => {
    assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
    return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
  });
  delete process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED;
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  assert.deepEqual((await submitVersionedPilotAttempt(request)).receipt, stored);
  assert.equal(calls.length, 1);
});

test("dispatcher selects each Art entry only by persisted identity; unsupported identity fails closed", async () => {
  for (const entry of westernArtObjectiveRegistry) {
    const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry),
      rawAnswer: entry.revisionPayload.answerSpec.acceptedAnswers[0], selfEvaluation: "good",
      responseMs: 1000, usedHint: false };
    const calls = setup((name, body) => {
      if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
      if (name === "study_graph_resolve_objective_instance_archive") return [persisted(entry)];
      if (name === "study_graph_resolve_objective_instance_routing") return [{
        instance_id: request.instanceId, project_id: "western-art-history", objective_id: entry.objectiveId,
        objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
        opportunity_kind: "unseen", expected_state_revision: 0,
        grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
        issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
      }];
      assert.equal(name, "study_graph_record_objective_attempt_v2");
      assert.equal(body.p_is_correct, true);
      assert.equal(body.p_scope_accepted, false); // No Notion token: first acceptance must consult fresh unavailable Scope.
      assert.equal(body.p_epoch_active, true);
      assert.ok(!Object.hasOwn(body, "p_srs_plan"));
      return [{ receipt: { ...receipt(entry), applied: false, reason: "scope-not-eligible",
        effectiveGrade: null, stateRevision: null, dueAt: null } }];
    });
    assert.equal((await submitVersionedPilotAttempt(request)).srsApplied, false);
    assert.equal(calls.filter((call) => call.name === "study_graph_record_objective_attempt_v2").length, 1);
    assert.equal(calls.some((call) => call.name === "study_graph_record_review"), false);
  }
  const entry = westernArtObjectiveRegistry[0];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry), rawAnswer: "メンヒル",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  const calls = setup((name) => name === "study_graph_get_kuzushiji_pilot_attempt_receipt"
    ? [] : [persisted(entry, { exercise_id: "western-art-history.unregistered" })]);
  await assert.rejects(submitVersionedPilotAttempt(request), { code: "unsupported_pilot_instance" });
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_get_kuzushiji_pilot_attempt_receipt", "study_graph_resolve_objective_instance_archive",
  ]);
});

test("first acceptance grades persisted revision and checks each entry's own fresh Scope exactly once", async () => {
  for (const entry of westernArtObjectiveRegistry) {
    const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry),
      rawAnswer: entry.revisionPayload.answerSpec.acceptedAnswers[0], selfEvaluation: "good",
      responseMs: 1000, usedHint: false };
    let reads = 0;
    const calls = setup((name, body) => {
      if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
      if (name === "study_graph_resolve_objective_instance_routing") return [{
        instance_id: request.instanceId, project_id: "western-art-history", objective_id: entry.objectiveId,
        objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
        opportunity_kind: "unseen", expected_state_revision: 0,
        grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
        issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
      }];
      assert.equal(name, "study_graph_record_objective_attempt_v2");
      assert.equal(body.p_is_correct, true);
      assert.equal(body.p_scope_accepted, true);
      assert.equal(body.p_epoch_active, true);
      return [{ receipt: receipt(entry) }];
    });
    const result = await submitWesternArtObjectiveAttempt(request, persisted(entry), async () => {
      reads++;
      return graph([entry.scopeSubjectId]);
    });
    assert.equal(result.srsApplied, true);
    assert.equal(reads, 1);
    assert.equal(calls.some((call) => call.name === "study_graph_record_review"), false);
    setup((name, body) => {
      if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
      if (name === "study_graph_resolve_objective_instance_routing") return [{
        instance_id: request.instanceId, project_id: "western-art-history", objective_id: entry.objectiveId,
        objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
        opportunity_kind: "unseen", expected_state_revision: 0,
        grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
        issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
      }];
      assert.equal(name, "study_graph_record_objective_attempt_v2");
      assert.equal(body.p_scope_accepted, false);
      return [{ receipt: { ...receipt(entry), applied: false, reason: "scope-not-eligible",
        effectiveGrade: null, stateRevision: null, dueAt: null } }];
    });
    await submitWesternArtObjectiveAttempt(request, persisted(entry), async () => graph([]));
  }
});

test("first acceptance grades a persisted older revision instead of the current candidate", async () => {
  const entry = westernArtObjectiveRegistry[0];
  const oldRevision = createExerciseRevision({
    ...westernArtMenhir.definition,
    exerciseVersion: 2,
    answerSpec: { type: "text", acceptedAnswers: ["旧称"] },
  }, new Map(), null);
  const oldPayload = getExerciseRevisionPayload(oldRevision);
  const oldPresentation = createWesternArtPresentation(oldPayload, entry);
  const oldInstance = persisted(entry, {
    exercise_version: 2, revision_payload: oldPayload, content_hash: oldRevision.contentHash,
    presentation: oldPresentation, presentation_hash: hashWesternArtPresentation(oldPresentation),
  });
  const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry), rawAnswer: "旧称",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  assert.equal(gradeExerciseRevision(entry.revisionPayload, request.rawAnswer).isCorrect, false);
  const calls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_routing") return [{
      instance_id: request.instanceId, project_id: "western-art-history", objective_id: entry.objectiveId,
      objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
      opportunity_kind: "unseen", expected_state_revision: 0,
      grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
    }];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_is_correct, true);
    return [{ receipt: receipt(entry) }];
  });
  await submitWesternArtObjectiveAttempt(request, oldInstance, async () => graph([entry.scopeSubjectId]));
  assert.equal(calls.filter((call) => call.name === "study_graph_record_objective_attempt_v2").length, 1);
  assert.throws(() => decodeWesternArtInstance(persisted(entry, { legacy_item_id: westernArtObjectiveRegistry[1].scopeSubjectId })));
});
