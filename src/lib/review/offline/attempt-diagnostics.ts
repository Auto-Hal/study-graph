import { requestBody } from "./pilot-transport.ts";
import type { OfflineAttemptStatus, OfflineReceiptKind } from "./model-core.ts";
import { listOfflineAttempts, type PersistedOfflineAttempt } from "./attempt-outbox.ts";
import { safeTransportErrorCode } from "./outbox-core.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OfflineAttemptDiagnostic = Readonly<{
  status: OfflineAttemptStatus;
  blockedReason: string | null;
  lastHttpStatus: number | null;
  lastServerErrorCode: string | null;
  lastTransportObservedAt: string | null;
  submissionSchemaVersion: number | null;
  requestHashVersion: number | null;
  attemptId: string;
  attemptIdValid: boolean;
  instanceId: string;
  rawAnswerType: string;
  rawAnswerStringLength: number | null;
  selfEvaluation: string | null;
  responseMsValue: number | null;
  responseMsType: string;
  usedHintValue: boolean | null;
  usedHintType: string;
  retryCount: number | null;
  receiptKind: OfflineReceiptKind | null;
}>;

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Produce screenshot-safe structural information without exposing answer
 * content. This is a read-only projection; it never changes the outbox.
 */
export function describeOfflineAttempt(record: PersistedOfflineAttempt): OfflineAttemptDiagnostic {
  const candidate = record as unknown as Record<string, unknown>;
  const nestedRecord = candidate.record && typeof candidate.record === "object"
    ? candidate.record as Record<string, unknown>
    : {};
  const submission = nestedRecord.submission && typeof nestedRecord.submission === "object"
    ? nestedRecord.submission as Record<string, unknown>
    : {};
  const transport = candidate.transport && typeof candidate.transport === "object"
    ? candidate.transport as Record<string, unknown>
    : {};
  const rawAnswer = submission.rawAnswer;
  return {
    status: typeof nestedRecord.status === "string" ? nestedRecord.status as OfflineAttemptStatus : "blocked",
    blockedReason: typeof nestedRecord.blockedReason === "string" ? nestedRecord.blockedReason : null,
    lastHttpStatus: nullableNumber(transport.lastHttpStatus),
    lastServerErrorCode: safeTransportErrorCode(transport.lastServerErrorCode),
    lastTransportObservedAt: typeof transport.lastTransportObservedAt === "string" ? transport.lastTransportObservedAt : null,
    submissionSchemaVersion: nullableNumber(submission.submissionSchemaVersion),
    requestHashVersion: nullableNumber(submission.requestHashVersion),
    attemptId: typeof candidate.attemptId === "string" ? candidate.attemptId : "",
    attemptIdValid: typeof candidate.attemptId === "string" && UUID_PATTERN.test(candidate.attemptId),
    instanceId: typeof candidate.instanceId === "string" ? candidate.instanceId : "",
    rawAnswerType: valueType(rawAnswer),
    rawAnswerStringLength: typeof rawAnswer === "string" ? rawAnswer.length : null,
    selfEvaluation: typeof submission.selfEvaluation === "string" ? submission.selfEvaluation : null,
    responseMsValue: nullableNumber(submission.responseMs),
    responseMsType: valueType(submission.responseMs),
    usedHintValue: nullableBoolean(submission.usedHint),
    usedHintType: valueType(submission.usedHint),
    retryCount: nullableNumber(transport.retryCount),
    receiptKind: nestedRecord.receipt && typeof nestedRecord.receipt === "object"
      && ((nestedRecord.receipt as Record<string, unknown>).kind === "legacy" || (nestedRecord.receipt as Record<string, unknown>).kind === "objective")
      ? (nestedRecord.receipt as Record<string, unknown>).kind as OfflineReceiptKind
      : null,
  };
}

/** Read all current blocked records without mutating any durable state. */
export async function listBlockedOfflineAttemptDiagnostics(): Promise<OfflineAttemptDiagnostic[]> {
  const records = await listOfflineAttempts();
  return records
    .filter((record) => record.record.status === "blocked")
    .map(describeOfflineAttempt);
}

/** Exact immutable wire tuple used by the explicit validation-only endpoint. */
export function diagnosticValidationRequestBody(record: PersistedOfflineAttempt) {
  return requestBody(record);
}
