import assert from "node:assert/strict";
import test from "node:test";
import {
  adoptObjectiveStateMirror,
  authoritativeReceiptResult,
  createOfflineAssetDescriptor,
  createOfflineReceiptRecord,
  createOfflineSubmission,
  createOfflineAttemptDraft,
  confirmOfflineSubmission,
  assertValidOfflineAssetDescriptor,
  assertValidOfflineSubmission,
  freezeServerIssuedOfflineInstance,
  hashOfflineSubmission,
  isOfflineAssetReady,
  objectiveStateMirrorKey,
  OFFLINE_GRADING_POLICY,
  scopeEvidenceProvesEligibility,
  type AttemptAcceptanceScopeEvidence,
  type ObjectiveStateMirror,
  type OfflineAttemptCommitted,
  type OfflineReceiptRecord,
  type OfflineSubmissionInput,
  type ServerIssuedOfflineInstance,
} from "./model.ts";
import {
  canonicalizeScopeKnowledgeSnapshotContent,
  createScopeKnowledgeSnapshot,
  evaluateSnapshotAdoption,
  hashScopeKnowledgeSnapshotContent,
  shouldAdoptSnapshot,
  type ScopeKnowledgeSnapshot,
} from "./snapshot.ts";
import {
  classifyOfflineServerOutcome,
  classifyStoredReceiptLookup,
  transitionFromDelivery,
  transitionOfflineAttempt,
} from "./outbox.ts";
import {
  hashExerciseAttemptRequest,
  type ExerciseAttemptRequest,
} from "../exercises/attempt.ts";
import {
  kuzushijiPilotRevision,
} from "../exercises/kuzushiji-revision.ts";

const attemptId = "11111111-1111-4111-8111-111111111111";
const instanceId = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Partial<Omit<ScopeKnowledgeSnapshot, "schemaVersion" | "contentHash">> = {}) {
  return createScopeKnowledgeSnapshot({
    snapshotId: "snapshot-1",
    projectId: "kuzushiji",
    generation: 1,
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:00:01.000Z",
    publishedAt: "2030-01-01T00:00:02.000Z",
    validUntil: "2030-01-01T02:00:01.000Z",
    scopePolicyVersion: "phase4b-v1",
    knowledgeProjectionVersion: "notion-v1",
    sourceEvidence: {
      sourceIdentifiers: ["notion:characters"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [{
      subjectId: "あ",
      status: "eligible",
      reasonCodes: ["learning"],
      anchorReferences: ["lecture:1"],
    }],
    knowledgeProjection: { label: "あ", reading: "あ" },
    ...overrides,
  });
}

function submission(overrides: Partial<OfflineSubmissionInput> = {}): OfflineSubmissionInput {
  return {
    attemptId,
    instanceId,
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
    ...overrides,
  };
}

function completeLegacyReceipt(overrides: Record<string, unknown> = {}) {
  return {
    receiptVersion: 1,
    attemptId,
    instanceId,
    acceptedAt: "2030-01-01T00:01:00.000Z",
    gradingStatus: "graded",
    isCorrect: true,
    effectiveSrsGrade: "good",
    srsApplied: true,
    srsReason: "applied",
    legacyReviewAttemptId: 7,
    reviewStateBefore: null,
    reviewStateAfter: { due_at: "2030-01-02T00:01:00.000Z" },
    ...overrides,
  };
}

function mirror(overrides: Partial<ObjectiveStateMirror> = {}): ObjectiveStateMirror {
  return {
    learnerId: "00000000-0000-4000-8000-000000000001",
    projectId: "kuzushiji",
    objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
    srsEpoch: 1,
    stateRevision: 1,
    dueAt: "2030-01-02T00:00:00.000Z",
    intervalDays: 1,
    repetitions: 1,
    lastGrade: "good",
    lastReviewedAt: "2030-01-01T00:00:00.000Z",
    schedulerVersion: "legacy-v1",
    ...overrides,
  };
}

test("snapshot hash is deterministic and excludes observation metadata", () => {
  const base = snapshot();
  const reordered = snapshot({
    sourceEvidence: {
      relationCompleteness: true,
      paginationComplete: true,
      sourceIdentifiers: ["notion:characters"],
    },
    knowledgeProjection: { reading: "あ", label: "あ" },
  });
  assert.equal(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(reordered));
  const { contentHash: _contentHash, ...withoutHash } = base;
  assert.equal(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(withoutHash));
  const changedObservation = snapshot({
    snapshotId: "snapshot-2",
    generation: 9,
    sourceReadStartedAt: "2030-02-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-02-01T00:00:01.000Z",
    publishedAt: "2030-02-01T00:00:02.000Z",
    validUntil: "2030-02-01T04:00:01.000Z",
  });
  assert.equal(canonicalizeScopeKnowledgeSnapshotContent(base), canonicalizeScopeKnowledgeSnapshotContent(changedObservation));
  assert.equal(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(changedObservation));
  assert.equal(base.contentHash, changedObservation.contentHash);
  assert.equal(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent({ ...base, contentHash: "f".repeat(64) }));
});

test("snapshot set-like collections are sorted while projection array order remains semantic", () => {
  const first = {
    subjectId: "い",
    status: "eligible" as const,
    reasonCodes: ["reason-b", "reason-a"],
    anchorReferences: ["lecture:2", "lecture:1"],
  };
  const second = {
    subjectId: "あ",
    status: "ineligible" as const,
    reasonCodes: ["reason-d", "reason-c"],
    anchorReferences: ["lecture:4", "lecture:3"],
  };
  const ordered = snapshot({
    sourceEvidence: {
      sourceIdentifiers: ["notion:characters", "notion:lectures"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [first, second],
  });
  const shuffled = snapshot({
    sourceEvidence: {
      sourceIdentifiers: ["notion:lectures", "notion:characters"],
      paginationComplete: true,
      relationCompleteness: true,
    },
    scopeDecisions: [
      { ...second, reasonCodes: [...second.reasonCodes].reverse(), anchorReferences: [...second.anchorReferences].reverse() },
      { ...first, reasonCodes: [...first.reasonCodes].reverse(), anchorReferences: [...first.anchorReferences].reverse() },
    ],
  });
  assert.equal(hashScopeKnowledgeSnapshotContent(ordered), hashScopeKnowledgeSnapshotContent(shuffled));
  assert.throws(() => snapshot({ scopeDecisions: [first, { ...first }] }), /unique/);
  assert.notEqual(
    hashScopeKnowledgeSnapshotContent(snapshot({ knowledgeProjection: { rows: ["a", "b"] } })),
    hashScopeKnowledgeSnapshotContent(snapshot({ knowledgeProjection: { rows: ["b", "a"] } })),
  );
});

test("snapshot semantic changes alter the hash", () => {
  const base = snapshot();
  assert.notEqual(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(snapshot({
    scopeDecisions: [{ ...base.scopeDecisions[0], status: "unknown" }],
  })));
  assert.notEqual(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(snapshot({
    knowledgeProjection: { label: "別の投影" },
  })));
  assert.notEqual(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(snapshot({
    scopePolicyVersion: "phase4b-v2",
  })));
  assert.notEqual(hashScopeKnowledgeSnapshotContent(base), hashScopeKnowledgeSnapshotContent(snapshot({
    sourceEvidence: { ...base.sourceEvidence, paginationComplete: false },
  })));
});

test("snapshot adoption is valid-hash and generation monotonic; validUntil is not authority", () => {
  const current = snapshot();
  const newer = snapshot({ generation: 2, validUntil: "2029-01-01T00:00:00.000Z" });
  const older = snapshot({ generation: 1 });
  assert.equal(shouldAdoptSnapshot(null, current), true);
  assert.equal(shouldAdoptSnapshot(current, newer), true);
  assert.equal(shouldAdoptSnapshot(current, older), false);
  assert.deepEqual(evaluateSnapshotAdoption(current, current), { kind: "ignore", reason: "same-generation" });
  assert.deepEqual(evaluateSnapshotAdoption(current, snapshot({ scopePolicyVersion: "other" })), {
    kind: "ignore",
    reason: "same-generation-conflict",
  });
  const invalid = { ...newer, contentHash: "f".repeat(64) };
  assert.deepEqual(evaluateSnapshotAdoption(current, invalid), { kind: "ignore", reason: "invalid-candidate" });
});

test("offline submission hash reuses the existing Phase 4C request hash contract", () => {
  const value = createOfflineSubmission({
    ...submission(),
    clientAnsweredAt: "2030-01-01T00:00:00.000Z",
    clientSnapshotId: "snapshot-1",
    clientSnapshotGeneration: 1,
  });
  const request: ExerciseAttemptRequest = {
    attemptId,
    instanceId,
    rawAnswer: "あ",
    selfEvaluation: "good",
    responseMs: 1200,
    usedHint: false,
  };
  assert.equal(hashOfflineSubmission(value), hashExerciseAttemptRequest(request));
  const changedClientContext = createOfflineSubmission({
    ...submission(),
    clientAnsweredAt: "2040-01-01T00:00:00.000Z",
    clientSnapshotId: "snapshot-9",
    clientSnapshotGeneration: 9,
  });
  assert.equal(hashOfflineSubmission(value), hashOfflineSubmission(changedClientContext));
});

test("pending confirmation fixes an immutable payload and preserves it through transitions", () => {
  const draft = createOfflineAttemptDraft({ createdAt: "2030-01-01T00:00:00.000Z", localSequence: 1 });
  const pending = confirmOfflineSubmission(draft, submission());
  assert.equal(pending.status, "pending");
  assert.equal(Object.isFrozen(pending.submission), true);
  const sending = transitionOfflineAttempt(pending, { type: "begin-send" }) as OfflineAttemptCommitted;
  const retry = transitionOfflineAttempt(sending, { type: "retryable-failure", reason: "network" });
  assert.equal(retry.status, "pending");
  assert.strictEqual(retry.submission, pending.submission);
  assert.throws(() => transitionOfflineAttempt(retry, { type: "confirm-submission", submission: submission({ rawAnswer: "い" }) }), /Invalid transition/);
});

test("unsupported future submission and asset descriptor versions fail closed", () => {
  assert.throws(() => assertValidOfflineSubmission({
    ...submission(),
    submissionSchemaVersion: 2,
  }), /submissionSchemaVersion/);
  assert.throws(() => assertValidOfflineSubmission({
    ...submission(),
    requestHashVersion: 2,
  }), /requestHashVersion/);
  const descriptor = createOfflineAssetDescriptor({
    assetId: "asset-version",
    assetVersion: 1,
    checksum: null,
    revisionContentHash: kuzushijiPilotRevision.contentHash,
    mediaType: "image/png",
    width: 1,
    height: 1,
    source: { title: "source" },
  });
  assert.throws(() => assertValidOfflineAssetDescriptor({ ...descriptor, descriptorVersion: 2 }), /descriptor version/);
});

test("outbox transitions support auth recovery, crash recovery, terminal acceptance, and blocked retention", () => {
  const pending = confirmOfflineSubmission(createOfflineAttemptDraft(), submission());
  const sending = transitionOfflineAttempt(pending, { type: "begin-send" }) as OfflineAttemptCommitted;
  const authRequired = transitionOfflineAttempt(sending, { type: "auth-required" });
  assert.equal(authRequired.status, "auth-required");
  const reauthed = transitionOfflineAttempt(authRequired, { type: "reauthenticated" });
  assert.equal(reauthed.status, "pending");
  const crashed = transitionOfflineAttempt(transitionOfflineAttempt(reauthed, { type: "begin-send" }), { type: "crash-recovered" });
  assert.equal(crashed.status, "pending");

  const receipt = createOfflineReceiptRecord("legacy", completeLegacyReceipt(), instanceId, attemptId);
  const accepted = transitionOfflineAttempt(
    transitionOfflineAttempt(crashed, { type: "begin-send" }),
    { type: "accepted", receipt },
  );
  assert.equal(accepted.status, "accepted-applied");
  assert.throws(() => transitionOfflineAttempt(accepted, { type: "begin-send" }), /Terminal/);

  const authRequiredWithReceipt = transitionOfflineAttempt(
    transitionOfflineAttempt(pending, { type: "begin-send" }),
    { type: "auth-required" },
  );
  const acceptedAfterAuthProbe = transitionOfflineAttempt(authRequiredWithReceipt, { type: "accepted", receipt });
  assert.equal(acceptedAfterAuthProbe.status, "accepted-applied");

  const blocked = transitionOfflineAttempt(
    transitionOfflineAttempt(pending, { type: "begin-send" }),
    { type: "blocked", reason: "attempt-conflict" },
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.submission.attemptId, attemptId);
  assert.throws(() => transitionOfflineAttempt(blocked, { type: "begin-send" }), /Terminal/);
});

test("delivery classification retries transient failures and fails closed for receipt problems", () => {
  const context = { attemptId, instanceId, receiptKind: "legacy" as const };
  assert.deepEqual(classifyOfflineServerOutcome({ type: "network-error" }, context), { kind: "retryable", reason: "network" });
  assert.deepEqual(classifyOfflineServerOutcome({ type: "http", status: 503 }, context), { kind: "retryable", reason: "server" });
  assert.deepEqual(classifyOfflineServerOutcome({ type: "http", status: 429 }, context), { kind: "retryable", reason: "rate-limit" });
  assert.deepEqual(classifyOfflineServerOutcome({ type: "http", status: 401 }, context), { kind: "auth-required" });
  assert.deepEqual(classifyOfflineServerOutcome({ type: "http", status: 409, code: "attempt_conflict" }, context), {
    kind: "blocked",
    reason: "attempt-conflict",
  });
  assert.deepEqual(classifyOfflineServerOutcome({ type: "http", status: 409, code: "instance_already_answered" }, context), {
    kind: "receipt-lookup-required",
    reason: "instance-already-answered",
  });
  assert.deepEqual(classifyOfflineServerOutcome({
    type: "http",
    status: 409,
    code: "instance_already_answered",
    receipt: { attemptId, instanceId, gradingStatus: "graded" },
  }, context), { kind: "blocked", reason: "incomplete-authoritative-receipt" });
  assert.deepEqual(classifyOfflineServerOutcome({
    type: "http",
    status: 200,
    receipt: { attemptId, instanceId },
  }, context), { kind: "blocked", reason: "incomplete-authoritative-receipt" });
});

test("instance_already_answered requires receipt lookup before terminal classification", () => {
  const context = { attemptId, instanceId, receiptKind: "legacy" as const };
  const pending = confirmOfflineSubmission(createOfflineAttemptDraft(), submission());
  const sending = transitionOfflineAttempt(pending, { type: "begin-send" }) as OfflineAttemptCommitted;
  const lookupRequired = classifyOfflineServerOutcome({
    type: "http",
    status: 409,
    code: "instance_already_answered",
  }, context);
  assert.deepEqual(lookupRequired, { kind: "receipt-lookup-required", reason: "instance-already-answered" });
  const unchanged = transitionFromDelivery(sending, lookupRequired);
  assert.equal(unchanged.status, "sending");
});

test("stored receipt lookup accepts only a complete receipt for this attempt", () => {
  const context = { attemptId, instanceId, receiptKind: "legacy" as const, requestHash: "a".repeat(64) };
  const same = classifyStoredReceiptLookup({
    attemptId,
    requestHash: context.requestHash,
    receipt: completeLegacyReceipt({ isCorrect: false, effectiveSrsGrade: "again" }),
  }, context);
  assert.equal(same.kind, "accepted");
  if (same.kind === "accepted") {
    const restored = authoritativeReceiptResult(same.receipt, instanceId);
    assert.equal(restored.isCorrect, false);
    assert.equal(restored.effectiveSrsGrade, "again");
  }

  const differentAttempt = classifyStoredReceiptLookup({
    attemptId: "33333333-3333-4333-8333-333333333333",
    requestHash: context.requestHash,
    receipt: completeLegacyReceipt({ attemptId: "33333333-3333-4333-8333-333333333333" }),
  }, context);
  assert.deepEqual(differentAttempt, { kind: "blocked", reason: "instance-already-answered" });
  assert.deepEqual(classifyStoredReceiptLookup({}, context), {
    kind: "blocked",
    reason: "incomplete-authoritative-receipt",
  });
  assert.deepEqual(classifyStoredReceiptLookup({
    attemptId,
    requestHash: "b".repeat(64),
    receipt: completeLegacyReceipt(),
  }, context), {
    kind: "blocked",
    reason: "attempt-conflict",
  });
  assert.deepEqual(classifyStoredReceiptLookup({
    attemptId,
    receipt: completeLegacyReceipt(),
  }, context), {
    kind: "blocked",
    reason: "incomplete-authoritative-receipt",
  });
  assert.deepEqual(classifyStoredReceiptLookup({
    attemptId: "33333333-3333-4333-8333-333333333333",
    requestHash: context.requestHash,
    receipt: completeLegacyReceipt(),
  }, context), {
    kind: "blocked",
    reason: "incomplete-authoritative-receipt",
  });
});

test("accepted transition checks receipt attemptId independently of delivery classification", () => {
  const pending = confirmOfflineSubmission(createOfflineAttemptDraft(), submission());
  const sending = transitionOfflineAttempt(pending, { type: "begin-send" }) as OfflineAttemptCommitted;
  const sameReceipt = createOfflineReceiptRecord("legacy", completeLegacyReceipt(), instanceId);
  const accepted = transitionOfflineAttempt(sending, { type: "accepted", receipt: sameReceipt });
  assert.equal(accepted.status, "accepted-applied");

  const sendingAgain = transitionOfflineAttempt(
    confirmOfflineSubmission(createOfflineAttemptDraft(), submission({ attemptId: "44444444-4444-4444-8444-444444444444" })),
    { type: "begin-send" },
  ) as OfflineAttemptCommitted;
  const differentReceipt = createOfflineReceiptRecord("legacy", completeLegacyReceipt({
    attemptId: "55555555-5555-4555-8555-555555555555",
  }), instanceId);
  assert.throws(
    () => transitionOfflineAttempt(sendingAgain, { type: "accepted", receipt: differentReceipt }),
    /attemptId/,
  );
  assert.equal(sendingAgain.status, "sending");
});

test("Objective state mirror adopts only newer revisions and never rolls back", () => {
  const current = mirror();
  assert.deepEqual(adoptObjectiveStateMirror(null, current), { kind: "adopt", reason: "no-current" });
  assert.deepEqual(adoptObjectiveStateMirror(current, mirror({ stateRevision: 2, repetitions: 2 })), {
    kind: "adopt",
    reason: "newer-revision",
  });
  assert.deepEqual(adoptObjectiveStateMirror(mirror({ stateRevision: 2 }), mirror({ stateRevision: 1 })), {
    kind: "ignore",
    reason: "older-revision",
  });
  assert.deepEqual(adoptObjectiveStateMirror(current, mirror()), { kind: "idempotent", reason: "same-revision" });
  assert.deepEqual(adoptObjectiveStateMirror(current, mirror({ dueAt: "2031-01-01T00:00:00.000Z" })), {
    kind: "conflict",
    reason: "same-revision-different-content",
  });
  assert.notEqual(objectiveStateMirrorKey(current), objectiveStateMirrorKey(mirror({ srsEpoch: 2 })));
  assert.deepEqual(adoptObjectiveStateMirror(current, mirror({ srsEpoch: 2 })), { kind: "conflict", reason: "different-key" });
});

test("asset descriptor requires a verified checksum before offline readiness", () => {
  const missing = createOfflineAssetDescriptor({
    assetId: "asset-1",
    assetVersion: 1,
    checksum: null,
    revisionContentHash: kuzushijiPilotRevision.contentHash,
    mediaType: "image/png",
    width: 100,
    height: 100,
    source: { title: "source" },
  });
  assert.equal(missing.offlineReady, false);
  assert.equal(isOfflineAssetReady(missing), false);

  const checksum = "a".repeat(64);
  const ready = createOfflineAssetDescriptor({
    ...missing,
    checksum,
    verifiedChecksum: checksum,
    offlineReady: true,
  });
  assert.equal(ready.offlineReady, true);
  assert.equal(isOfflineAssetReady(ready, checksum), true);
  assert.equal(isOfflineAssetReady(ready, "b".repeat(64)), false);
  const changedVersion = createOfflineAssetDescriptor({ ...ready, assetVersion: 2, verifiedChecksum: checksum });
  assert.notEqual(changedVersion.assetVersion, ready.assetVersion);
  assert.notEqual(changedVersion.assetVersion + ":" + changedVersion.checksum, ready.assetVersion + ":" + ready.checksum);
  assert.throws(() => createOfflineAssetDescriptor({
    ...missing,
    revisionContentHash: "not-a-sha256",
  }), /SHA-256/);
  assert.throws(() => assertValidOfflineAssetDescriptor({
    ...missing,
    revisionContentHash: "not-a-sha256",
  }), /SHA-256/);
});

test("server-issued instance descriptor keeps server facts immutable and has no provisional form", () => {
  const asset = createOfflineAssetDescriptor({
    assetId: "asset-1",
    assetVersion: 1,
    checksum: null,
    revisionContentHash: kuzushijiPilotRevision.contentHash,
    mediaType: "image/png",
    width: 100,
    height: 100,
    source: { title: "source" },
  });
  const instance = {
    descriptorVersion: 1 as const,
    instanceId,
    learnerId: "00000000-0000-4000-8000-000000000001",
    projectId: "kuzushiji",
    revision: { revisionId: "archive-uuid", revisionContentHash: kuzushijiPilotRevision.contentHash },
    presentation: { prompt: "画像を読む", front: "画像" },
    presentationHash: "c".repeat(64),
    issuedAt: "2030-01-01T00:00:00.000Z",
    scopeSnapshot: { snapshotId: "snapshot-1", generation: 1 },
    objectiveId: "kuzushiji.a.eitaigura-u3042-00032-1.read",
    objectiveVersion: 1,
    srsEpoch: 1,
    evidenceUse: "srs" as const,
    assets: [asset],
    delivery: { deviceId: "phone-1" },
  } satisfies ServerIssuedOfflineInstance;
  const frozen = freezeServerIssuedOfflineInstance(instance);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(frozen.learnerId, instance.learnerId);
  assert.throws(() => { (frozen as { objectiveId: string }).objectiveId = "other"; }, /read only|Cannot assign|object is not extensible/i);
  assert.throws(() => freezeServerIssuedOfflineInstance({ ...instance, presentationHash: "not-a-sha256" }), /presentationHash/);
  assert.throws(() => freezeServerIssuedOfflineInstance({
    ...instance,
    revision: { ...instance.revision, revisionContentHash: "not-a-sha256" },
  }), /revision/);
});

test("Scope evidence separates issuance/client context from first-acceptance authority", () => {
  const acceptance: AttemptAcceptanceScopeEvidence = {
    authority: "server-first-acceptance",
    snapshotId: "snapshot-2",
    sourceReadStartedAt: "2030-01-01T00:00:00.000Z",
    sourceReadCompletedAt: "2030-01-01T00:00:01.000Z",
    status: "eligible",
    reasonCodes: ["direct-lecture-relation"],
    complete: true,
  };
  assert.equal(scopeEvidenceProvesEligibility(acceptance), true);
  assert.equal(scopeEvidenceProvesEligibility({ ...acceptance, complete: false }), false);
  assert.equal(scopeEvidenceProvesEligibility({ ...acceptance, status: "unknown" }), false);
  assert.equal(scopeEvidenceProvesEligibility({ ...acceptance, authority: "server-issuance" } as never), false);
});

test("offline grading policy keeps client correctness provisional", () => {
  assert.deepEqual(OFFLINE_GRADING_POLICY, {
    clientAuthority: "provisional",
    serverAuthority: "authoritative",
    clientCorrectnessCanAuthorizeSrs: false,
  });
});

test("delivery transition stores authoritative receipt and derives terminal SRS status from it", () => {
  const pending = confirmOfflineSubmission(createOfflineAttemptDraft(), submission());
  const sending = transitionOfflineAttempt(pending, { type: "begin-send" }) as OfflineAttemptCommitted;
  const receipt = createOfflineReceiptRecord("legacy", completeLegacyReceipt({ srsApplied: false, srsReason: "scope-not-eligible", effectiveSrsGrade: null, reviewStateAfter: null }), instanceId, attemptId);
  const classified = { kind: "accepted" as const, receipt };
  const result = transitionFromDelivery(sending, classified) as OfflineAttemptCommitted;
  assert.equal(result.status, "accepted-no-srs");
  assert.equal(result.receipt?.receipt !== undefined, true);
  assert.equal(authoritativeReceiptResult(result.receipt as OfflineReceiptRecord, instanceId).srsApplied, false);
  assert.throws(() => transitionOfflineAttempt(result, { type: "begin-send" }), /Terminal/);
});
