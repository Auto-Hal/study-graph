"use client";

import Link from "next/link";
import { useState } from "react";
import { prefetchPilotOfflineInstance } from "@/src/lib/review/offline/prefetch-client";

type PrefetchState =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "ready"; instanceId: string }
  | { kind: "answered" }
  | { kind: "error"; message: string };

/** Explicit, one-card pilot prefetch control. There is no screen-load issue. */
export default function OfflinePrefetchControl() {
  const [state, setState] = useState<PrefetchState>({ kind: "idle" });

  async function prepare() {
    if (state.kind === "syncing") return;
    setState({ kind: "syncing" });
    try {
      const record = await prefetchPilotOfflineInstance();
      setState(record.state === "answered"
        ? { kind: "answered" }
        : { kind: "ready", instanceId: record.instanceId });
    } catch (error) {
      console.error("Study Graph: offline prefetch failed", error);
      setState({ kind: "error", message: "オフライン復習を準備できませんでした。通信状態と保存領域を確認してください。" });
    }
  }

  if (state.kind === "ready") {
    return <div className="offline-prefetch-control" role="status"><p>オフライン復習 1問 準備済み</p><Link className="quick-action" href="/review/kuzushiji-offline">オフライン復習を開始</Link><button className="snapshot-sync-link" type="button" onClick={() => void prepare()}>もう一度準備</button><span className="sr-only">Instance {state.instanceId}</span></div>;
  }

  if (state.kind === "answered") {
    return <div className="offline-prefetch-control" role="status"><p>準備済みの回答は端末に保存されています。同期後に次の問題を準備できます。</p><button className="snapshot-sync-link" type="button" onClick={() => void prepare()}>もう一度準備</button></div>;
  }

  return <div className="offline-prefetch-control"><button className="quick-action" type="button" onClick={() => void prepare()} disabled={state.kind === "syncing"}>{state.kind === "syncing" ? "準備中…" : "オフライン復習を準備"}</button>{state.kind === "error" && <p className="save-error" role="alert">{state.message}</p>}</div>;
}
