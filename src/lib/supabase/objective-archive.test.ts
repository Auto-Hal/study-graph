import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  ensureObjectiveArchive,
  resolveObjectiveInstanceArchive,
} from "./objective-archive.ts";

const learnerId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";
const revisionId = "33333333-3333-4333-8333-333333333333";
const bindingId = "44444444-4444-4444-8444-444444444444";
const releaseHash = "a".repeat(64);
const contentHash = "b".repeat(64);
const objectiveId = "philosophy.anaximander.arche-recall";
const exerciseId = "philosophy.anaximander.arche-recall";

const objectiveDefinition = {
  projectId: "philosophy",
  objectiveId,
  objectiveVersion: 1,
  title: "Recall arche",
  target: "arche",
  action: "recall",
  responseMode: "recall" as const,
  conditions: "given a prompt",
  successCriterion: "states the target meaning",
};

const revision = {
  projectId: "philosophy",
  exerciseId,
  exerciseVersion: 1,
  objectiveId,
  contentHash,
  canonicalizationVersion: 1,
  status: "approved",
  prompt: "What is arche?",
  projectOnlyFixture: true,
} as never;

const contentRelease = {
  manifestHash: releaseHash,
  manifest: {
    manifestSchemaVersion: 1 as const,
    revisionEntries: [{
      projectId: "philosophy",
      exerciseId,
      exerciseVersion: 1,
      contentHash,
      assets: [],
      grader: { strategyId: "deterministic-text-v1", strategyVersion: 1 },
      normalizerVersion: "review-session-ja-v1",
    }],
  },
  provenance: { sourceGitSha: "fixture-source-sha" },
} as never;

const exerciseObjectiveBinding = {
  revisionContentHash: contentHash,
  objectiveId,
  objectiveVersion: 1,
  evidenceUse: "srs" as const,
};

const resolvedRow = {
  instance_id: instanceId,
  learner_id: learnerId,
  release_id: releaseHash,
  revision_id: revisionId,
  presentation: { prompt: "persisted" },
  presentation_hash: "c".repeat(64),
  renderer_version: null,
  adapter_version: null,
  locale: "ja-JP",
  scope_evidence: {},
  knowledge_binding: null,
  legacy_item_id: "arche",
  legacy_item_kind: "knowledge",
  legacy_exercise_id: exerciseId,
  srs_target: "objective",
  srs_epoch: "1",
  revision_payload: { projectId: "philosophy", exerciseId, objectiveId },
  revision_status: "approved",
  project_id: "philosophy",
  exercise_id: exerciseId,
  exercise_version: 1,
  content_hash: contentHash,
};

const oldFetch = globalThis.fetch;
const oldEnv = { ...process.env };
after(() => {
  globalThis.fetch = oldFetch;
  process.env = oldEnv;
});

test("generic archive helper registers archive before Objective definition and binding", async () => {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (url, init) => {
    const name = new URL(String(url)).pathname.split("/").at(-1)!;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ name, body });
    if (name === "study_graph_register_objective_archive") return Response.json([{ release_id: releaseHash, revision_id: revisionId }]);
    if (name === "study_graph_register_objective_definition") return Response.json([{ objective_id: objectiveId }]);
    if (name === "study_graph_register_exercise_objective_binding") return Response.json([{ binding_id: bindingId }]);
    throw new Error(`unexpected RPC ${name}`);
  };

  const result = await ensureObjectiveArchive({ contentRelease, revision, objectiveDefinition, exerciseObjectiveBinding });
  assert.deepEqual(result, { releaseId: releaseHash, revisionId, bindingId });
  assert.deepEqual(calls.map((call) => call.name), [
    "study_graph_register_objective_archive",
    "study_graph_register_objective_definition",
    "study_graph_register_exercise_objective_binding",
  ]);
  assert.equal(calls[0].body.p_project_id, "philosophy");
  assert.equal(calls[0].body.p_exercise_id, exerciseId);
  assert.equal(calls[0].body.p_objective_id, objectiveId);
  assert.equal("p_revision_id" in calls[0].body, false, "database-generated revision UUID must not be caller authority");
});

test("generic archive helper rejects inconsistent Git identities before any RPC", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json([]); };
  await assert.rejects(
    ensureObjectiveArchive({
      contentRelease,
      revision,
      objectiveDefinition,
      exerciseObjectiveBinding: { ...exerciseObjectiveBinding, objectiveId: "philosophy.other" },
    }),
    /identity is inconsistent/,
  );
  assert.equal(called, false);
});

test("generic resolver is learner-scoped and returns persisted authority fields", async () => {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    const name = new URL(String(url)).pathname.split("/").at(-1)!;
    calls.push(name);
    return name === "study_graph_resolve_objective_instance_archive"
      ? Response.json([resolvedRow])
      : Response.json([]);
  };
  const resolved = await resolveObjectiveInstanceArchive(instanceId, learnerId);
  assert.equal(resolved?.project_id, "philosophy");
  assert.equal(resolved?.exercise_id, exerciseId);
  assert.equal(resolved?.revision_id, revisionId);
  assert.equal(resolved?.srs_target, "objective");
  assert.deepEqual(calls, ["study_graph_resolve_objective_instance_archive"]);
  await assert.rejects(resolveObjectiveInstanceArchive("not-a-uuid", learnerId), /invalid_instance_identity/);
});

test("generic archive transport errors are bounded", async () => {
  process.env.SUPABASE_URL = "https://fixture.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role";
  globalThis.fetch = async () => Response.json({ message: "column private_sql is ambiguous", details: "password=secret" }, { status: 500 });
  await assert.rejects(
    ensureObjectiveArchive({ contentRelease, revision, objectiveDefinition, exerciseObjectiveBinding }),
    (error: unknown) => {
      assert.match(String(error), /objective_archive_rpc_failed_500/);
      assert.doesNotMatch(String(error), /private_sql|password|secret/);
      return true;
    },
  );
});
