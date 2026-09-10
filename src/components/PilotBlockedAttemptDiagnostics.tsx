"use client";

import { useCallback, useEffect, useState } from "react";
import {
  diagnosticValidationRequestBody,
  describeOfflineAttempt,
  type OfflineAttemptDiagnostic,
} from "@/src/lib/review/offline/attempt-diagnostics";
import { listOfflineAttempts, type PersistedOfflineAttempt } from "@/src/lib/review/offline/attempt-outbox";
import {
  recoverBlockedPilotAttemptExplicitly,
  type ManualBlockedPilotRecoveryResult,
} from "@/src/lib/review/offline/pilot-transport";
import { syncObjectiveStateMirror } from "@/src/lib/review/offline/objective-state-mirror";

type ValidationResult = Readonly<{
  status: number | null;
  ok: boolean;
  error: string | null;
}>;

type BlockedRecord = Readonly<{
  record: PersistedOfflineAttempt;
  diagnostic: OfflineAttemptDiagnostic;
}>;

function safeDiagnosticError(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : null;
}

/**
 * Read-only local evidence for blocked pilot submissions. The validation
 * button is explicit and sends only the immutable six-field wire tuple to the
 * validation-only endpoint; it never retries or changes the outbox record.
 */
export default function PilotBlockedAttemptDiagnostics() {
  const [records, setRecords] = useState<BlockedRecord[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [checkingAttemptId, setCheckingAttemptId] = useState<string | null>(null);
  const [recoveringAttemptId, setRecoveringAttemptId] = useState<string | null>(null);
  const [validation, setValidation] = useState<Record<string, ValidationResult>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const current = await listOfflineAttempts();
      setRecords(current
        .filter((record) => record.record.status === "blocked")
        .map((record) => ({ record, diagnostic: describeOfflineAttempt(record) })));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function validateRecord(entry: BlockedRecord) {
    if (checkingAttemptId || recoveringAttemptId) return;
    setCheckingAttemptId(entry.diagnostic.attemptId);
    try {
      const response = await fetch("/api/review/pilot/attempt/validate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diagnosticValidationRequestBody(entry.record)),
      });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { payload = null; }
      const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      setValidation((current) => ({
        ...current,
        [entry.diagnostic.attemptId]: {
          status: response.status,
          ok: body.ok === true && response.ok,
          error: safeDiagnosticError(body.error),
        },
      }));
    } catch {
      setValidation((current) => ({
        ...current,
        [entry.diagnostic.attemptId]: { status: null, ok: false, error: "network_error" },
      }));
    } finally {
      setCheckingAttemptId(null);
    }
  }

  function recoveryMessage(outcome: ManualBlockedPilotRecoveryResult) {
    if (outcome.kind === "accepted") {
      return outcome.result.srsApplied
        ? "サーバー保存が完了しました。復習予定も更新されました。"
        : "サーバー保存が完了しました。今回の回答では復習予定は更新されませんでした。";
    }
    if (outcome.kind === "terminal") return "この回答は別の処理で確定済みです。保存済み状態を確認してください。";
    if (outcome.failure === "auth-required") return "送信には追加の確認が必要です。保存済み回答は端末にそのまま残っています。";
    if (outcome.failure === "network" || outcome.failure === "rate-limit" || outcome.failure === "server") {
      return "送信できませんでした。回答は端末にそのまま保存されています。";
    }
    if (outcome.reason === "attempt-conflict") return "保存済み回答とサーバー履歴が一致しません。再送を停止しました。";
    if (outcome.reason === "instance-already-answered") return "この問題には別の回答が保存されています。再送を停止しました。";
    if (outcome.serverErrorCode) return "送信は拒否されました: " + outcome.serverErrorCode;
    return "保存済み回答はblockedのままです。送信は完了していません。";
  }

  async function recoverRecord(entry: BlockedRecord) {
    if (checkingAttemptId || recoveringAttemptId) return;
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm("保存済みの同じ回答をサーバーへ送信します")) return;
    setRecoveringAttemptId(entry.diagnostic.attemptId);
    setNotice(null);
    try {
      const outcome = await recoverBlockedPilotAttemptExplicitly(entry.diagnostic.attemptId);
      if (!outcome) {
        setNotice("保存済み回答が見つかりません。blocked状態は変更していません。");
        return;
      }
      setNotice(recoveryMessage(outcome));
      if (outcome.kind === "accepted") {
        try {
          // The server attempt transaction is complete before the display-only
          // Objective mirror is refreshed.
          await syncObjectiveStateMirror();
        } catch (error) {
          console.error("Study Graph: Objective state mirror refresh failed after explicit recovery", error);
        }
      }
      await refresh();
    } catch {
      setNotice("送信できませんでした。回答は端末にそのまま保存されています。");
      await refresh();
    } finally {
      setRecoveringAttemptId(null);
    }
  }

  if (loadError || (records.length === 0 && notice === null)) return null;

  return <>
    {notice && <p className="persistence-note" role="status">{notice}</p>}
    {records.length > 0 && <details className="persistence-diagnostics">
      <summary>送信診断（確認が必要な回答 {records.length}件）</summary>
      <p className="persistence-note">IndexedDBの構造情報だけを表示します。回答本文は表示しません。</p>
      {records.map((entry) => {
        const diagnostic = entry.diagnostic;
        const result = validation[diagnostic.attemptId];
        return <article key={diagnostic.attemptId} className="persistence-diagnostic-record">
          <dl>
            <div><dt>status</dt><dd>{diagnostic.status}</dd></div>
            <div><dt>blockedReason</dt><dd>{diagnostic.blockedReason ?? "未記録"}</dd></div>
            <div><dt>last HTTP status</dt><dd>{diagnostic.lastHttpStatus ?? "未記録"}</dd></div>
            <div><dt>server error code</dt><dd>{diagnostic.lastServerErrorCode ?? "未記録"}</dd></div>
            <div><dt>submission schema</dt><dd>{diagnostic.submissionSchemaVersion ?? "未記録"}</dd></div>
            <div><dt>request hash version</dt><dd>{diagnostic.requestHashVersion ?? "未記録"}</dd></div>
            <div><dt>attemptId valid</dt><dd>{diagnostic.attemptIdValid ? "true" : "false"}</dd></div>
            <div><dt>attemptId</dt><dd><code>{diagnostic.attemptId || "未記録"}</code></dd></div>
            <div><dt>instanceId</dt><dd><code>{diagnostic.instanceId || "未記録"}</code></dd></div>
            <div><dt>rawAnswer</dt><dd>type={diagnostic.rawAnswerType}; stringLength={diagnostic.rawAnswerStringLength ?? "n/a"}</dd></div>
            <div><dt>selfEvaluation</dt><dd>{diagnostic.selfEvaluation ?? "未記録"}</dd></div>
            <div><dt>responseMs</dt><dd>type={diagnostic.responseMsType}; value={diagnostic.responseMsValue ?? "null/invalid"}</dd></div>
            <div><dt>usedHint</dt><dd>type={diagnostic.usedHintType}; value={diagnostic.usedHintValue === null ? "null/invalid" : String(diagnostic.usedHintValue)}</dd></div>
            <div><dt>retryCount</dt><dd>{diagnostic.retryCount ?? "未記録"}</dd></div>
            <div><dt>last observed</dt><dd>{diagnostic.lastTransportObservedAt ?? "未記録"}</dd></div>
          </dl>
          <button type="button" className="secondary-action" disabled={checkingAttemptId !== null || recoveringAttemptId !== null} onClick={() => void validateRecord(entry)}>
            {checkingAttemptId === diagnostic.attemptId ? "確認中…" : "保存済み入力を検証"}
          </button>
          {result && <p className="persistence-note" role="status">
            {result.ok ? "サーバー入力契約は有効です。送信は行っていません。" : `入力契約エラー: ${result.error ?? `HTTP ${result.status ?? "network"}`}`}
          </p>}
          {result?.ok && <div className="persistence-diagnostics-recovery">
            <p className="persistence-note">新しい回答は作成せず、同じattemptIdを1回だけ送信します。</p>
            <button type="button" className="secondary-action" disabled={checkingAttemptId !== null || recoveringAttemptId !== null} onClick={() => void recoverRecord(entry)}>
              {recoveringAttemptId === diagnostic.attemptId ? "送信中…" : "同じ保存済み回答を再送"}
            </button>
          </div>}
        </article>;
      })}
    </details>}
  </>;
}
