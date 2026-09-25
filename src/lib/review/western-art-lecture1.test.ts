import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { GraphData } from "../graph/types.ts";
import { getStudyProject } from "../projects/registry.ts";
import type { ResolvedObjectiveInstanceArchive } from "../supabase/objective-archive.ts";
import { gradeExerciseRevision, hashExerciseAttemptRequest, type ExerciseAttemptRequest } from "./exercises/attempt.ts";
import {
  WESTERN_ART_LECTURE1_ID, WESTERN_ART_LECTURE1_URL,
  WESTERN_ART_PALEOLITHIC_SUBJECT_URL, WESTERN_ART_EXAGGERATION_SUBJECT_URL,
  WESTERN_ART_ABSTRACTION_SUBJECT_URL,
  westernArtPaleolithic, westernArtExaggeration, westernArtAbstraction,
} from "./exercises/western-art-prehistory-additions.ts";
import { WESTERN_ART_CROMLECH_LECTURE_ID } from "./exercises/western-art-cromlech.ts";
import { createContentRelease, createContentReleaseManifest, createExerciseRevision, getExerciseRevisionPayload } from "./exercises/revision.ts";
import { hashObjectiveDefinition } from "./objectives.ts";
import { submitVersionedPilotAttempt } from "./pilot-attempt-dispatch.ts";
import { loadGraphPractice } from "./registry.ts";
import { buildGraphScopeSnapshot } from "./scope.ts";
import {
  createWesternArtPresentation, decodeWesternArtInstance, hashWesternArtPresentation,
  westernArtCardFromPersisted, westernArtPilotEnabled,
} from "./western-art-pilot-core.ts";
import { issueWesternArtObjectiveCard, issueWesternArtObjectiveCards, submitWesternArtObjectiveAttempt } from "./western-art-pilot-runtime.ts";
import { westernArtObjectiveRegistry, westernArtObjectiveScopeSubjectIds, type WesternArtObjectiveEntry } from "./western-art-objective-registry.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const attemptId = "44444444-4444-4444-8444-444444444444";
const newEntries = westernArtObjectiveRegistry.slice(0, 3);
const oldEntries = westernArtObjectiveRegistry.slice(3);
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
after(() => { globalThis.fetch = originalFetch; process.env = originalEnv; });

function numberOf(entry: WesternArtObjectiveEntry) { return westernArtObjectiveRegistry.indexOf(entry) + 1; }
function instanceId(entry: WesternArtObjectiveEntry) { return `22222222-2222-4222-8222-${String(numberOf(entry)).padStart(12, "0")}`; }
function revisionId(entry: WesternArtObjectiveEntry) { return `33333333-3333-4333-8333-${String(numberOf(entry)).padStart(12, "0")}`; }

function graph(options: {
  lecture1Date?: string;
  lecture1Ids?: readonly string[];
  lecture2Ids?: readonly string[];
  sourceState?: "ready" | "unavailable";
} = {}): GraphData & { mode: "notion" } {
  const lecture1Ids = options.lecture1Ids ?? newEntries.map((entry) => entry.scopeSubjectId);
  const lecture2Ids = options.lecture2Ids ?? oldEntries.map((entry) => entry.scopeSubjectId);
  return {
    projectId: "western-art-history", mode: "notion",
    nodes: [
      ...westernArtObjectiveRegistry.map((entry) => ({
        id: entry.scopeSubjectId,
        kind: entry === newEntries[0] ? "period" : "term",
        label: entry.revisionPayload.answerSpec.acceptedAnswers[0],
        reviewText: entry.revisionPayload.explanation.summary,
        meta: "", href: null, notionUrl: entry.scopeSubjectUrl,
      })),
      { id: "unrelated-art", kind: "term", label: "Other", reviewText: "Other",
        meta: "", href: null, notionUrl: "https://example.test/other" },
      { id: "unanchored-lecture3", kind: "term", label: "No Lecture 3", reviewText: "No lecture",
        meta: "", href: null, notionUrl: "https://example.test/lecture3" },
    ],
    edges: [],
    scope: {
      sourceState: options.sourceState ?? "ready",
      anchors: [
        { id: WESTERN_ART_LECTURE1_ID, completion: "unknown", date: options.lecture1Date ?? "2026-08-15",
          directRelations: lecture1Ids.map((nodeId) => ({
            nodeId, kind: nodeId === newEntries[0].scopeSubjectId ? "period" : "term",
          })) },
        { id: WESTERN_ART_CROMLECH_LECTURE_ID, completion: "unknown", date: "2026-08-23",
          directRelations: [...lecture2Ids, "unrelated-art"].map((nodeId) => ({ nodeId, kind: "term" })) },
      ],
    },
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

test("seven trusted entries preserve old hashes and pin Lecture 1 content", () => {
  assert.deepEqual(westernArtObjectiveRegistry.map((entry) => entry.exerciseId), [
    "western-art-history.paleolithic.period-recall",
    "western-art-history.exaggeration.term-recall",
    "western-art-history.abstraction.term-recall",
    "western-art-history.menhir.term-recall",
    "western-art-history.dolmen.term-recall",
    "western-art-history.cromlech.term-recall",
    "western-art-history.trilithon.term-recall",
  ]);
  const hashes = [
    ["eb55d0e08bf4e0495b310a56f45878a8e59930988b72a99b779d5e85fd868745", "9ea5a3e5a3d98ce07f43a725043327294e2fae52176268ccd8ec088ff57527e3", "172f5c4ab568b5fbbe7108f8b7820293093fcc8738027977ae5b75abbbf27632"],
    ["d047eb7baa5f3613bbdddf6da1fd148dbf64685fa0d06289117be57d0d3c6ca6", "44569d8b42aec86a68f33009306210f6242dcb7ba1a06b6172c1a9b6896eee17", "0871e4790ea1cd49821958a3a6b2630911a29b83569de47649239bd1188f6dbf"],
    ["5b7235c2351098ece56bdddb429db49d2c38f6bf1aec6f38556e7e58c26d5354", "352b09740f46ed44b898515d09b06695bbb5ff38f0dc67f0cd87ea7f26a6ccd8", "b9bf236b70da1aef1f1d398169911589236090f123c974582df07844450b7ea1"],
    ["0a3f0aafad6441b5754d0304db84daf688bd2187ef34dafe8b8beaeec8994fc0", "056d17d96abbd802801d662708bbf91855736449d97f91c0182a0be40773232c", "406cbef1ff048e75d4cf5266689467a74fef5ffb81b9cb87a5df2ac594382e9c"],
    ["3e282a78882fc4c0816fbdd650afbdf31df62d0b51384aa46b27f1324ef68a4b", "8accad42a2e7d9e048fb02ab506ea81940a051c52e0ffa05a27f5e64ffee49cb", "bd37811d9a6e7e46bca3a908b8d7672cba58f784eae5e7bbf8c65fa741f59764"],
    ["45f396e0c74c6f725c4ecf200bd05d310d18690860e90a84f6f91fded43666a2", "12d874ecfd9fb2416b932f5efba77799bad2ccbe9616988d141c922456180fc8", "1d9c10b837b2a7ed91a7458221ad0dcdb23c73abfcee6758e0820800b352fbf5"],
    ["1ab7c95f1da0cde7d3be95bcbba0f000adc33abbad596891e7b21fecc0bdf2d4", "8f134dc8be07d4de83c2cef5a4b5ef6fa728d7e49724a81ab5d9d076f6b42a1a", "61a3a44f3dd5b05c671036460c4953f156630e0dad9e67b98d51bc480b761e9f"],
  ];
  westernArtObjectiveRegistry.forEach((entry, index) => {
    assert.equal(entry.revision.contentHash, hashes[index][0]);
    assert.equal(entry.contentRelease.manifestHash, hashes[index][1]);
    assert.equal(hashObjectiveDefinition(entry.objectiveDefinition), hashes[index][2]);
    assert.equal(entry.revisionPayload.pilotMetadata, null);
    assert.deepEqual(entry.revisionPayload.stimuli, []);
    assert.deepEqual(entry.revisionPayload.visualAssets, []);
    assert.deepEqual(entry.contentRelease.manifest.revisionEntries[0].assets, []);
    assert.equal(entry.revisionPayload.gradingSpec.strategyId, "legacy-text-v1");
    assert.equal(entry.revisionPayload.gradingSpec.strategyVersion, 1);
    assert.equal(entry.revisionPayload.gradingSpec.normalization, "review-session-ja-v1");
    assert.equal(entry.objectiveDefinition.objectiveVersion, 1);
    assert.equal(entry.srsEpoch, 1);
    assert.equal(entry.objectiveBinding.evidenceUse, "srs");
    assert.equal(entry.objectiveBinding.revisionContentHash, entry.revision.contentHash);
    assert.equal(gradeExerciseRevision(entry.revisionPayload, entry.revisionPayload.answerSpec.acceptedAnswers[0]).isCorrect, true);
    assert.equal(gradeExerciseRevision(entry.revisionPayload, "誤答").isCorrect, false);
  });
  assert.deepEqual(newEntries.map((entry) => entry.revisionPayload.prompt), [
    "狩猟採集を基本とし、洞窟壁画や小型彫像などの造形が残された時代を何と呼びますか。漢字で答えてください。",
    "伝えたい意味や重要性を強調するため、対象の特定部分を実際以上に強く表現することを何と呼びますか。漢字で答えてください。",
    "対象の個別的・具体的特徴を整理または省略し、重要な特徴や意味を取り出して表現することを何と呼びますか。漢字で答えてください。",
  ]);
  assert.deepEqual(newEntries.map((entry) => entry.revisionPayload.answerSpec.acceptedAnswers), [
    ["旧石器時代"], ["誇張"], ["抽象化"],
  ]);
  assert.deepEqual(newEntries.map((entry) => entry.scopeSubjectUrl), [
    WESTERN_ART_PALEOLITHIC_SUBJECT_URL, WESTERN_ART_EXAGGERATION_SUBJECT_URL, WESTERN_ART_ABSTRACTION_SUBJECT_URL,
  ]);
  for (const entry of newEntries) {
    assert.deepEqual(entry.revisionPayload.sources.map((source) => source.url), [WESTERN_ART_LECTURE1_URL, entry.scopeSubjectUrl]);
    assert.deepEqual(entry.revisionPayload.relatedKnowledgeBindings, [
      { source: "notion", externalId: entry.scopeSubjectId, role: "scope-subject" },
    ]);
  }
  assert.equal(westernArtPaleolithic.definition.answerSpec.acceptedAnswers[0], "旧石器時代");
  assert.equal(westernArtExaggeration.definition.answerSpec.acceptedAnswers[0], "誇張");
  assert.equal(westernArtAbstraction.definition.answerSpec.acceptedAnswers[0], "抽象化");
});

test("Lecture 1 period and terms require a direct dated relation; Lecture 3 is never inferred", () => {
  const now = new Date("2026-09-25T00:00:00Z");
  const ready = buildGraphScopeSnapshot("western-art-history", graph(), now);
  const future = buildGraphScopeSnapshot("western-art-history", graph({ lecture1Date: "2026-09-26" }), now);
  for (const entry of newEntries) {
    assert.equal(ready.decisions[entry.scopeSubjectId].status, "eligible");
    assert.ok(ready.decisions[entry.scopeSubjectId].reasonCodes.includes("direct-relation"));
    assert.deepEqual(ready.decisions[entry.scopeSubjectId].anchorIds, [WESTERN_ART_LECTURE1_ID]);
    assert.equal(future.decisions[entry.scopeSubjectId].status, "ineligible");
  }
  for (const entry of oldEntries) assert.equal(future.decisions[entry.scopeSubjectId].status, "eligible");
  assert.equal(ready.decisions["unanchored-lecture3"].status, "unknown");
  assert.equal(graph().scope?.anchors.some((anchor) => anchor.id === "lecture-3"), false);
  assert.equal(westernArtObjectiveRegistry.some((entry) => entry.exerciseId.includes("lecture3")), false);
  const project = getStudyProject("western-art-history")!;
  assert.ok(project.review.eligibleKinds.includes("period"));
  assert.ok(project.review.eligibleKinds.includes("term"));
});

test("flag off keeps legacy Art; flag on excludes seven before selection, orders and caps cards", async () => {
  for (const value of [undefined, "", "false", "1", "TRUE", "on"]) assert.equal(westernArtPilotEnabled(value), false);
  assert.equal(westernArtPilotEnabled("true"), true);
  process.env.STUDY_GRAPH_APP_TOKEN = "";
  const project = getStudyProject("western-art-history")!;
  delete process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED;
  const off = await loadGraphPractice(project, {
    loadGraph: async () => graph(),
    issueWesternArtCards: async () => { throw Error("flag off must not issue"); },
  });
  assert.ok(off.cards.some((card) => westernArtObjectiveScopeSubjectIds.includes(card.id)));
  process.env.STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED = "true";
  const cards = westernArtObjectiveRegistry.map((entry) =>
    westernArtCardFromPersisted(decodeWesternArtInstance(persisted(entry)), "unseen"));
  const on = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => cards });
  assert.deepEqual(on.cards.slice(0, 7).map((card) => card.id), westernArtObjectiveScopeSubjectIds);
  assert.equal(on.cards.length <= project.review.sessionSize, true);
  assert.equal(on.cards[0].kindLabel, "時代");
  const noIssue = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => [] });
  assert.ok(noIssue.cards.every((card) => !westernArtObjectiveScopeSubjectIds.includes(card.id)));
});

test("all seven eligible Objectives issue independently in trusted order", async () => {
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
  assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 7);
  assert.equal(calls.filter((call) => call.name === "study_graph_resolve_objective_instance_archive").length, 7);
});

test("the global v2 gate independently prevents new Art issuance", async () => {
  const calls = setup(() => { throw Error("global v2 gate must prevent RPC calls"); });
  delete process.env.STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED;
  const cards = await issueWesternArtObjectiveCards(buildGraphScopeSnapshot("western-art-history", graph()));
  assert.deepEqual(cards, []);
  assert.equal(calls.length, 0);
});

test("not-due and archive failure never restore legacy candidates or block later Objectives", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const calls = setup((name, body) => {
      const entry = westernArtObjectiveRegistry.find((candidate) => candidate.exerciseId === body.p_exercise_id);
      if (name === "study_graph_register_objective_archive") {
        if (entry === newEntries[1]) return Response.json({ message: "archive_unavailable" }, { status: 503 });
        return [{ release_id: entry!.contentRelease.manifestHash, revision_id: revisionId(entry!) }];
      }
      if (name === "study_graph_register_objective_definition") return [{ objective_id: body.p_objective_id }];
      if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
      if (name === "study_graph_issue_objective_instance_v2") {
        const selected = westernArtObjectiveRegistry.find((candidate) => candidate.scopeSubjectId === body.p_legacy_item_id)!;
        if (selected === newEntries[0]) return Response.json({ message: "objective_not_due" }, { status: 409 });
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
    assert.equal(calls.filter((call) => call.name === "study_graph_issue_objective_instance_v2").length, 6);
    const project = getStudyProject("western-art-history")!;
    const loaded = await loadGraphPractice(project, { loadGraph: async () => graph(), issueWesternArtCards: async () => cards });
    assert.ok(loaded.cards.every((card) => !westernArtObjectiveScopeSubjectIds.slice(0, 2).includes(card.id)));
  } finally { console.warn = originalWarn; }
});

test("active reuse displays persisted Lecture 1 revision, not candidate content", async () => {
  const entry = newEntries[0];
  const oldRevision = createExerciseRevision({
    ...westernArtPaleolithic.definition, exerciseVersion: 2,
    prompt: "Persisted older Paleolithic prompt", front: "Persisted older front",
  }, new Map(), null);
  const oldPayload = getExerciseRevisionPayload(oldRevision);
  const oldRelease = createContentRelease(createContentReleaseManifest([oldRevision]));
  const oldPresentation = createWesternArtPresentation(oldPayload, entry);
  setup((name) => {
    if (name === "study_graph_register_objective_archive") return [{ release_id: entry.contentRelease.manifestHash, revision_id: revisionId(entry) }];
    if (name === "study_graph_register_objective_definition") return [{ objective_id: entry.objectiveId }];
    if (name === "study_graph_register_exercise_objective_binding") return [{ binding_id: "55555555-5555-4555-8555-555555555555" }];
    if (name === "study_graph_issue_objective_instance_v2") return [{ instance_id: instanceId(entry),
      release_id: oldRelease.manifestHash, revision_id: revisionId(newEntries[2]),
      opportunity_kind: "due", effective_evidence_use: "srs", expected_state_revision: 2,
      issued_at: "2030-01-01T00:00:00Z", expires_at: "2030-01-08T00:00:00Z", reused: true }];
    if (name === "study_graph_resolve_objective_instance_archive") return [persisted(entry, {
      release_id: oldRelease.manifestHash, revision_id: revisionId(newEntries[2]),
      exercise_version: 2, revision_payload: oldPayload, content_hash: oldRevision.contentHash,
      presentation: oldPresentation, presentation_hash: hashWesternArtPresentation(oldPresentation),
    })];
    throw Error(name);
  });
  const scope = buildGraphScopeSnapshot("western-art-history", graph());
  const card = await issueWesternArtObjectiveCard(scope, entry);
  assert.equal(card?.prompt, oldPayload.prompt);
  assert.equal(card?.front, oldPayload.front);
  assert.notEqual(card?.prompt, entry.revisionPayload.prompt);
  assert.throws(() => decodeWesternArtInstance(persisted(entry, { exercise_id: newEntries[1].exerciseId })));
  assert.throws(() => decodeWesternArtInstance(persisted(entry, { exercise_id: "western-art-history.unsupported" })));
});

test("accepted retry recovers Receipt before routing, grading, Scope or epoch with rollout flags off", async () => {
  const entry = newEntries[1];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry), rawAnswer: "誇張",
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

test("first acceptance grades persisted content and checks each entry's own fresh Scope", async () => {
  for (const entry of newEntries) {
    const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry),
      rawAnswer: entry.revisionPayload.answerSpec.acceptedAnswers[0], selfEvaluation: "good",
      responseMs: 1000, usedHint: false };
    let graphReads = 0;
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
      assert.ok(!Object.hasOwn(body, "p_srs_plan"));
      return [{ receipt: receipt(entry) }];
    });
    const result = await submitWesternArtObjectiveAttempt(request, persisted(entry), async () => {
      graphReads++;
      return graph({ lecture1Ids: [entry.scopeSubjectId] });
    });
    assert.equal(result.srsApplied, true);
    assert.equal(graphReads, 1);
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
    await submitWesternArtObjectiveAttempt(request, persisted(entry), async () => graph({ lecture1Ids: [] }));
  }
});

test("first acceptance grades a persisted older Lecture 1 revision", async () => {
  const entry = newEntries[0];
  const oldRevision = createExerciseRevision({
    ...westernArtPaleolithic.definition,
    exerciseVersion: 2,
    answerSpec: { type: "text", acceptedAnswers: ["旧称"] },
  }, new Map(), null);
  const oldPayload = getExerciseRevisionPayload(oldRevision);
  const presentation = createWesternArtPresentation(oldPayload, entry);
  const oldInstance = persisted(entry, {
    exercise_version: 2, revision_payload: oldPayload, content_hash: oldRevision.contentHash,
    presentation, presentation_hash: hashWesternArtPresentation(presentation),
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
  await submitWesternArtObjectiveAttempt(request, oldInstance, async () => graph({ lecture1Ids: [entry.scopeSubjectId] }));
  assert.equal(calls.filter((call) => call.name === "study_graph_record_objective_attempt_v2").length, 1);
});

test("dispatcher selects new entries from persisted identity and rejects unsupported Art exercises", async () => {
  for (const entry of newEntries) {
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
      assert.equal(body.p_scope_accepted, false); // No Notion token: fresh Scope unavailable.
      return [{ receipt: { ...receipt(entry), applied: false, reason: "scope-not-eligible",
        effectiveGrade: null, stateRevision: null, dueAt: null } }];
    });
    assert.equal((await submitVersionedPilotAttempt(request)).srsApplied, false);
    assert.equal(calls.filter((call) => call.name === "study_graph_record_objective_attempt_v2").length, 1);
    assert.equal(calls.some((call) => call.name === "study_graph_record_review"), false);
  }
  const entry = newEntries[0];
  const request: ExerciseAttemptRequest = { attemptId, instanceId: instanceId(entry), rawAnswer: "旧石器時代",
    selfEvaluation: "good", responseMs: 1000, usedHint: false };
  const calls = setup((name) => name === "study_graph_get_kuzushiji_pilot_attempt_receipt"
    ? [] : [persisted(entry, { exercise_id: "western-art-history.unregistered" })]);
  await assert.rejects(submitVersionedPilotAttempt(request), { code: "unsupported_pilot_instance" });
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_get_kuzushiji_pilot_attempt_receipt", "study_graph_resolve_objective_instance_archive",
  ]);
});
