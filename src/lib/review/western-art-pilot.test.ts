import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { getStudyProject } from "../projects/registry.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { gradeExerciseRevision, hashExerciseAttemptRequest, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import { createExerciseRevision, getExerciseRevisionPayload } from "./exercises/revision.ts";
import {
  WESTERN_ART_CROMLECH_EXERCISE_ID,
  WESTERN_ART_CROMLECH_LECTURE_ID,
  WESTERN_ART_CROMLECH_LECTURE_URL,
  WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID,
  WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL,
  westernArtCromlechContentRelease,
  westernArtCromlechDefinition,
  westernArtCromlechObjectiveBinding,
  westernArtCromlechObjectiveDefinition,
  westernArtCromlechRevision,
  westernArtCromlechRevisionPayload,
} from "./exercises/western-art-cromlech.ts";
import { hashObjectiveDefinition } from "./objectives.ts";
import { ObjectiveRuntimeError } from "./objective-runtime-core.ts";
import { submitVersionedPilotAttempt } from "./pilot-attempt-dispatch.ts";
import { loadGraphPractice } from "./registry.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import type { ReviewCard } from "./types.ts";
import {
  createWesternArtPresentation,
  decodeWesternArtInstance,
  hashWesternArtPresentation,
  westernArtCardFromPersisted,
  westernArtPilotEnabled,
} from "./western-art-pilot-core.ts";
import { issueWesternArtObjectiveCard, submitWesternArtObjectiveAttempt } from "./western-art-pilot-runtime.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const request: ExerciseAttemptRequest = {
  attemptId, instanceId, rawAnswer: "クロムレック", selfEvaluation: "good", responseMs: 1500, usedHint: false,
};
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

function graph(options: { mode?: "notion" | "demo"; sourceState?: "ready" | "unavailable"; date?: string } = {}): GraphData & { mode: "notion" | "demo" } {
  const mode = options.mode ?? "notion";
  const ids = [WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID, "legacy-art-1", "legacy-art-2", "legacy-art-3", "legacy-art-4"];
  return {
    projectId: "western-art-history",
    mode,
    nodes: ids.map((id, index) => ({
      id, kind: "term", label: index === 0 ? "クロムレック" : `用語 ${index}`,
      reviewText: `説明 ${index}`, meta: "", href: null,
      notionUrl: index === 0 ? WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL : `https://example.test/${index}`,
    })),
    edges: [],
    scope: {
      sourceState: options.sourceState ?? "ready",
      anchors: [{
        id: WESTERN_ART_CROMLECH_LECTURE_ID,
        completion: "unknown",
        date: options.date ?? "2026-08-23",
        directRelations: ids.map((nodeId) => ({ nodeId, kind: "term" })),
      }],
    },
  };
}

function persisted(overrides: Partial<ResolvedObjectiveInstanceArchive> = {}): ResolvedObjectiveInstanceArchive {
  const presentation = createWesternArtPresentation(westernArtCromlechRevisionPayload);
  return {
    instance_id: instanceId, learner_id: learnerId,
    release_id: westernArtCromlechContentRelease.manifestHash, revision_id: revisionId,
    presentation, presentation_hash: hashWesternArtPresentation(presentation),
    renderer_version: null, adapter_version: null, locale: "ja-JP",
    scope_evidence: {}, knowledge_binding: { source: "notion", externalId: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID, role: "scope-subject" },
    legacy_item_id: WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID, legacy_item_kind: "knowledge",
    legacy_exercise_id: WESTERN_ART_CROMLECH_EXERCISE_ID, srs_target: "objective", srs_epoch: "1",
    revision_payload: westernArtCromlechRevisionPayload, revision_status: "approved",
    project_id: "western-art-history", exercise_id: WESTERN_ART_CROMLECH_EXERCISE_ID,
    exercise_version: 1, content_hash: westernArtCromlechRevision.contentHash,
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptVersion: 2, attemptId, instanceId, acceptedAt: "2030-01-01T00:01:00Z",
    projectId: "western-art-history", objectiveId: WESTERN_ART_CROMLECH_EXERCISE_ID,
    objectiveVersion: 1, srsEpoch: 1, evidenceUse: "srs", gradingStatus: "graded", isCorrect: true,
    applied: true, reason: "applied", effectiveGrade: "good", stateRevision: 1,
    dueAt: "2030-01-02T00:01:00Z", ...overrides,
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
    const name = new URL(String(url)).pathname.split("/").at(-1)!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ name, body });
    const result = await handler(name, body);
    return result instanceof Response ? result : Response.json(result);
  };
  return calls;
}

function issueHandler(name: string, body: Record<string, unknown>) {
  if (name === "study_graph_register_objective_archive") {
    assert.equal(body.p_project_id, "western-art-history");
    assert.equal(body.p_content_hash, westernArtCromlechRevision.contentHash);
    return [{ release_id: westernArtCromlechContentRelease.manifestHash, revision_id: revisionId }];
  }
  if (name === "study_graph_register_objective_definition") return [{ objective_id: WESTERN_ART_CROMLECH_EXERCISE_ID }];
  if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
  if (name === "study_graph_issue_objective_instance_v2") return [{
    instance_id: instanceId, release_id: westernArtCromlechContentRelease.manifestHash,
    revision_id: revisionId, opportunity_kind: "unseen", effective_evidence_use: "srs",
    expected_state_revision: 0, issued_at: "2030-01-01T00:00:00Z",
    expires_at: "2030-01-08T00:00:00Z", reused: false,
  }];
  if (name === "study_graph_resolve_objective_instance_archive") return [persisted()];
  throw new Error(`unexpected RPC ${name}`);
}

test("Cromlech immutable content and hashes are pinned", () => {
  assert.equal(westernArtCromlechDefinition.exerciseId, WESTERN_ART_CROMLECH_EXERCISE_ID);
  assert.equal(westernArtCromlechRevision.pilotMetadata, null);
  assert.deepEqual(westernArtCromlechRevision.stimuli, []);
  assert.deepEqual(westernArtCromlechRevision.visualAssets, []);
  assert.deepEqual(westernArtCromlechContentRelease.manifest.revisionEntries[0].assets, []);
  assert.deepEqual(westernArtCromlechRevision.answerSpec.acceptedAnswers, ["クロムレック"]);
  assert.deepEqual(westernArtCromlechDefinition.sources.map((source) => source.url), [
    WESTERN_ART_CROMLECH_LECTURE_URL, WESTERN_ART_CROMLECH_SCOPE_SUBJECT_URL,
  ]);
  assert.equal(westernArtCromlechRevision.contentHash, "45f396e0c74c6f725c4ecf200bd05d310d18690860e90a84f6f91fded43666a2");
  assert.equal(westernArtCromlechContentRelease.manifestHash, "12d874ecfd9fb2416b932f5efba77799bad2ccbe9616988d141c922456180fc8");
  assert.equal(hashObjectiveDefinition(westernArtCromlechObjectiveDefinition), "1d9c10b837b2a7ed91a7458221ad0dcdb23c73abfcee6758e0820800b352fbf5");
  assert.equal(westernArtCromlechObjectiveBinding.revisionContentHash, westernArtCromlechRevision.contentHash);
  assert.equal(westernArtCromlechObjectiveBinding.evidenceUse, "srs");
  assert.equal(westernArtCromlechObjectiveBinding.objectiveVersion, 1);
  assert.equal(gradeExerciseRevision(westernArtCromlechRevisionPayload, "クロムレック").isCorrect, true);
  assert.equal(gradeExerciseRevision(westernArtCromlechRevisionPayload, "ストーンヘンジ").isCorrect, false);
});

test("Art rollout flag is exact true only and date-based Scope remains authoritative", () => {
  for (const value of [undefined, "", "false", "1", "TRUE", "on", "yes"]) assert.equal(westernArtPilotEnabled(value), false);
  assert.equal(westernArtPilotEnabled("true"), true);
  const now = new Date("2026-09-25T00:00:00Z");
  assert.equal(buildGraphScopeSnapshot("western-art-history", graph(), now).decisions[WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID].status, "eligible");
  assert.equal(buildGraphScopeSnapshot("western-art-history", graph({ date: "2026-09-26" }), now).decisions[WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID].status, "ineligible");
  assert.equal(buildGraphScopeSnapshot("western-art-history", graph({ sourceState: "unavailable" }), now).decisions[WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID].status, "unknown");
});

test("issuance uses generic archive/issuer and persisted authority", async () => {
  const calls = setup(issueHandler);
  const scope = buildGraphScopeSnapshot("western-art-history", graph(), new Date("2026-09-25T00:00:00Z"));
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  assert.equal(await issueWesternArtObjectiveCard(scope), null);
  assert.equal(calls.length, 0);
  process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED = "true";
  const card = await issueWesternArtObjectiveCard(scope);
  assert.equal(card?.instanceId, instanceId);
  assert.equal(card?.prompt, westernArtCromlechRevision.prompt);
  assert.equal(card?.asset, undefined);
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_register_objective_archive", "study_graph_register_objective_definition",
    "study_graph_register_exercise_objective_binding", "study_graph_issue_objective_instance_v2",
    "study_graph_resolve_objective_instance_archive",
  ]);
  assert.equal(calls[3].body.p_legacy_item_id, WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID);
  assert.equal(calls[3].body.p_srs_epoch, 1);
  assert.ok(!Object.hasOwn(calls[3].body, "p_srs_plan"));

  const priorRevision = createExerciseRevision({
    ...westernArtCromlechDefinition,
    exerciseVersion: 2,
    prompt: "Persisted immutable prompt",
    front: "Persisted immutable front",
  }, new Map(), null);
  const priorPayload = getExerciseRevisionPayload(priorRevision);
  const priorPresentation = createWesternArtPresentation(priorPayload);
  const reused = persisted({
    release_id: "persisted-prior-release",
    revision_id: "66666666-6666-4666-8666-666666666666",
    exercise_version: 2,
    revision_payload: priorPayload,
    content_hash: priorRevision.contentHash,
    presentation: priorPresentation,
    presentation_hash: hashWesternArtPresentation(priorPresentation),
  });
  assert.equal(westernArtCardFromPersisted(decodeWesternArtInstance(reused), "unseen").prompt, priorPresentation.prompt);
  setup((name, body) => name === "study_graph_issue_objective_instance_v2"
    ? [{
      instance_id: instanceId, release_id: reused.release_id, revision_id: reused.revision_id,
      opportunity_kind: "unseen", effective_evidence_use: "srs", expected_state_revision: 0,
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: true,
    }]
    : name === "study_graph_resolve_objective_instance_archive" ? [reused] : issueHandler(name, body));
  assert.equal((await issueWesternArtObjectiveCard(scope))?.prompt, priorPresentation.prompt);
  assert.throws(() => decodeWesternArtInstance(persisted({ project_id: "philosophy" })));
  assert.throws(() => decodeWesternArtInstance(persisted({ exercise_id: "western-art-history.unsupported" })));
});

test("registry excludes Cromlech before legacy selection and prepends the Objective card", async () => {
  process.env.STUDY_GRAPH_APP_TOKEN = "";
  const project = getStudyProject("western-art-history")!;
  const objectiveCard = westernArtCardFromPersisted(decodeWesternArtInstance(persisted()), "unseen");
  delete process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED;
  const off = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => { throw new Error("must not issue"); } });
  assert.ok(off.cards.some((card) => card.id === WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID));

  process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED = "true";
  const on = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => [objectiveCard] });
  assert.equal(on.cards[0].persistenceKind, "versioned-pilot");
  assert.equal(on.cards.filter((card) => card.id === WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID).length, 1);

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const failed = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => { throw new Error("issuer failed"); } });
    assert.ok(failed.cards.every((card) => card.id !== WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID));
    const notDue = await loadGraphPractice(project, {
      loadGraph: async () => graph(),
      issueWesternArtCards: async () => { throw new ObjectiveRuntimeError("objective_not_due"); },
    });
    assert.ok(notDue.cards.every((card) => card.id !== WESTERN_ART_CROMLECH_SCOPE_SUBJECT_ID));
  } finally { console.warn = originalWarn; }
});

test("accepted retry returns before persisted routing, grading and fresh Scope", async () => {
  const stored = receipt();
  const calls = setup((name) => {
    assert.equal(name, "study_graph_get_kuzushiji_pilot_attempt_receipt");
    return [{ attempt_id: attemptId, request_hash: hashExerciseAttemptRequest(request), receipt: stored }];
  });
  delete process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED;
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  assert.deepEqual((await submitVersionedPilotAttempt(request)).receipt, stored);
  assert.equal(calls.length, 1);
});

test("first acceptance grades persisted revision, fresh-reads Art Scope and leaves SRS to DB", async () => {
  let graphReads = 0;
  const calls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_routing") return [{
      instance_id: instanceId, project_id: "western-art-history", objective_id: WESTERN_ART_CROMLECH_EXERCISE_ID,
      objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
      opportunity_kind: "unseen", expected_state_revision: 0,
      grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
    }];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_is_correct, true);
    assert.equal(body.p_scope_accepted, true);
    assert.equal(body.p_epoch_active, true);
    assert.ok(!Object.hasOwn(body, "p_srs_plan"));
    return [{ receipt: receipt() }];
  });
  const result = await submitWesternArtObjectiveAttempt(request, persisted(), async () => {
    graphReads++;
    return graph();
  });
  assert.equal(result.srsApplied, true);
  assert.equal(graphReads, 1);
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_get_kuzushiji_pilot_attempt_receipt",
    "study_graph_resolve_objective_instance_routing",
    "study_graph_record_objective_attempt_v2",
  ]);
});

test("dispatcher trusts persisted Art identity and rejects unsupported Art exercises", async () => {
  const calls = setup((name, body) => {
    if (name === "study_graph_get_kuzushiji_pilot_attempt_receipt") return [];
    if (name === "study_graph_resolve_objective_instance_archive") return [persisted()];
    if (name === "study_graph_resolve_objective_instance_routing") return [{
      instance_id: instanceId, project_id: "western-art-history", objective_id: WESTERN_ART_CROMLECH_EXERCISE_ID,
      objective_version: 1, srs_epoch: 1, evidence_use: "srs", scheduling_context_version: 1,
      opportunity_kind: "unseen", expected_state_revision: 0,
      grade_policy_version: "deterministic-correctness-cap-v1", activation_policy_version: "on-publication-v1",
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", due_at_observed: null,
    }];
    assert.equal(name, "study_graph_record_objective_attempt_v2");
    assert.equal(body.p_scope_accepted, false);
    return [{ receipt: receipt({ applied: false, reason: "scope-not-eligible", effectiveGrade: null, stateRevision: null, dueAt: null }) }];
  });
  assert.equal((await submitVersionedPilotAttempt(request)).srsApplied, false);
  assert.equal(calls.some((call) => call.name === "study_graph_record_review"), false);

  setup((name) => name === "study_graph_get_kuzushiji_pilot_attempt_receipt"
    ? [] : [persisted({ exercise_id: "western-art-history.unsupported" })]);
  await assert.rejects(submitVersionedPilotAttempt(request), { code: "unsupported_pilot_instance" });
});
