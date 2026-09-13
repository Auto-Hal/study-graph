"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createProjectSnapshotRefreshCoordinator,
  type CoordinatorIntent,
  type CoordinatorProjectId,
  type CoordinatorResult,
  type CoordinatorResultKind,
} from "./project-snapshot-refresh-coordinator";

export { FOREGROUND_REFRESH_THROTTLE_MS } from "./project-snapshot-refresh-coordinator";

export type ClientSnapshotRefreshProjectId = CoordinatorProjectId;
export type ClientSnapshotRefreshIntent = CoordinatorIntent;
export type ClientSnapshotRefreshKind = CoordinatorResultKind;
type ClientRefreshResult = CoordinatorResult;

function isRefreshKind(value: unknown): value is ClientSnapshotRefreshKind {
  return value === "fresh"
    || value === "refreshed"
    || value === "cooldown"
    || value === "busy"
    || value === "missing"
    || value === "blocked"
    || value === "unavailable";
}

/**
 * Browser transport for the bounded native refresh route. The response is
 * deliberately reduced to a safe status union; infrastructure details never
 * reach learner UI.
 */
async function fetchProjectSnapshotRefresh(
  projectId: ClientSnapshotRefreshProjectId,
  intent: ClientSnapshotRefreshIntent,
): Promise<ClientRefreshResult> {
  try {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/snapshot/refresh`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent }),
      cache: "no-store",
    });
    let value: unknown = null;
    try {
      value = await response.json();
    } catch {
      // An unavailable response is enough for the learner-facing status.
    }
    const kind = value && typeof value === "object" && isRefreshKind((value as { status?: unknown }).status)
      ? (value as { status: ClientSnapshotRefreshKind }).status
      : "unavailable";
    return { projectId, kind };
  } catch {
    return { projectId, kind: "unavailable" };
  }
}

const refreshCoordinator = createProjectSnapshotRefreshCoordinator(fetchProjectSnapshotRefresh);

export function requestProjectSnapshotRefresh(
  projectId: ClientSnapshotRefreshProjectId,
  intent: ClientSnapshotRefreshIntent,
): Promise<ClientRefreshResult> {
  return refreshCoordinator.request(projectId, intent);
}

function refreshAfterSuccess(
  result: ClientRefreshResult,
  router: ReturnType<typeof useRouter>,
  onRefreshed: (() => void | Promise<void>) | undefined,
) {
  if (result.kind !== "refreshed") return;
  if (onRefreshed) {
    void onRefreshed();
  } else {
    router.refresh();
  }
}

/**
 * Mount on normal learner surfaces. The first request waits until this client
 * component hydrates and only runs while the document is visible. Visibility
 * changes are request-shaped per tab/project, never authority decisions.
 */
export default function ProjectSnapshotRefreshCoordinator({
  projectId,
  onRefreshed,
}: {
  projectId: ClientSnapshotRefreshProjectId;
  onRefreshed?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;

  useEffect(() => {
    let disposed = false;
    const requestForeground = () => {
      if (document.visibilityState !== "visible") return;
      const request = refreshCoordinator.requestForeground(projectId);
      if (!request) return;
      void request.then((result) => {
        if (!disposed) refreshAfterSuccess(result, router, onRefreshedRef.current);
      });
    };

    requestForeground();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestForeground();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [projectId, router]);

  return null;
}

function learnerStatus(kind: ClientSnapshotRefreshKind | "refreshing" | null) {
  switch (kind) {
    case "refreshing": return "更新中…";
    case "refreshed": return "更新しました";
    case "fresh":
    case "cooldown": return "最新の内容です";
    case "missing": return "学習状況はまだ準備されていません。";
    case "busy": return "別の更新処理が進行中です";
    case "blocked":
    case "unavailable": return "更新できませんでした。現在の内容は引き続き利用できます。";
    default: return null;
  }
}

/** Quiet secondary manual control shared by all project workspaces. */
export function ProjectSnapshotRefreshControl({
  projectId,
  onRefreshed,
}: {
  projectId: ClientSnapshotRefreshProjectId;
  onRefreshed?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const onRefreshedRef = useRef(onRefreshed);
  onRefreshedRef.current = onRefreshed;
  const [status, setStatus] = useState<ClientSnapshotRefreshKind | "refreshing" | null>(null);

  const requestManual = () => {
    setStatus("refreshing");
    void requestProjectSnapshotRefresh(projectId, "manual").then((result) => {
      setStatus(result.kind);
      refreshAfterSuccess(result, router, onRefreshedRef.current);
    });
  };

  return (
    <div className="phase5-refresh-control">
      <button type="button" onClick={requestManual} disabled={status === "refreshing"}>
        {status === "refreshing" ? "更新中…" : "更新"}
      </button>
      {status && <span className="phase5-refresh-status" role="status" aria-live="polite">{learnerStatus(status)}</span>}
    </div>
  );
}
