"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ReviewSession from "./ReviewSession";
import {
  isOfflineAssetRenderable,
  readVerifiedOfflineAssetBytes,
} from "@/src/lib/review/offline/assets";
import {
  listReadyOfflineIssuedInstances,
  markOfflineInstanceAnswered,
  type OfflineIssuedInstanceRecord,
} from "@/src/lib/review/offline/instance-cache";
import { findOfflineAttemptByInstanceId } from "@/src/lib/review/offline/attempt-outbox";
import { createOfflineKuzushijiReviewCard } from "@/src/lib/review/offline/offline-card";
import type { ReviewCard } from "@/src/lib/review/types";

type OfflineReviewState =
  | { kind: "loading" }
  | { kind: "ready"; record: OfflineIssuedInstanceRecord; card: ReviewCard; objectUrl: string }
  | { kind: "unavailable"; message: string };

/**
 * Review entry for an already issued/verified card.  It never calls an issue
 * endpoint; a missing or answered instance simply cannot start offline.
 */
export default function OfflineKuzushijiReview() {
  const [state, setState] = useState<OfflineReviewState>({ kind: "loading" });
  const objectUrl = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    setState({ kind: "loading" });
    try {
      const records = await listReadyOfflineIssuedInstances();
      for (const record of records) {
        // A crash can occur after the durable attempt outbox commits but
        // before the separate instance-cache marker is written.  Reconcile
        // that local fact before deciding whether this instance is offerable;
        // never mint a second attempt for one server-issued instance.
        const existingAttempt = await findOfflineAttemptByInstanceId(record.instanceId);
        if (existingAttempt) {
          await markOfflineInstanceAnswered(record.instanceId, existingAttempt.attemptId);
          continue;
        }
        let verified = true;
        for (const asset of record.descriptor.assets) {
          if (!(await isOfflineAssetRenderable(asset))) {
            verified = false;
            break;
          }
        }
        if (!verified) continue;
        const asset = record.descriptor.assets[0];
        if (!asset) continue;
        const bytes = await readVerifiedOfflineAssetBytes(asset);
        if (!bytes) continue;
        const url = URL.createObjectURL(new Blob([bytes], { type: asset.mediaType }));
        const card = createOfflineKuzushijiReviewCard(record.descriptor, record.feedback, url);
        objectUrl.current = url;
        setState({ kind: "ready", record, card, objectUrl: url });
        return;
      }
      setState({ kind: "unavailable", message: "準備済みのオフライン復習がありません。オンライン時にダッシュボードから準備してください。" });
    } catch {
      setState({ kind: "unavailable", message: "オフライン復習を読み込めませんでした。端末の保存領域を確認してください。" });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [load]);

  const onPilotAttemptDurablyCommitted = useCallback(async (instanceId: string, attemptId: string) => {
    await markOfflineInstanceAnswered(instanceId, attemptId);
  }, []);

  if (state.kind === "loading") {
    return <main className="review-page-shell"><section className="review-stage empty-stage" aria-live="polite"><p className="eyebrow">OFFLINE REVIEW</p><h1>準備済みの復習を読み込んでいます…</h1></section></main>;
  }

  if (state.kind === "unavailable") {
    return <main className="review-page-shell"><section className="review-stage empty-stage"><p className="eyebrow">OFFLINE REVIEW</p><h1>オフライン復習を開始できません。</h1><p>{state.message}</p><div className="result-actions single-action-row"><Link className="secondary-action" href="/projects/kuzushiji">ダッシュボードへ戻る</Link></div></section></main>;
  }

  return (
    <main className="review-page-shell review-project-shell">
      <header className="review-page-header">
        <Link className="brand-link" href="/projects/kuzushiji"><span className="brand-mark">SG</span><span><strong>Study Graph</strong><small>くずし字・オフライン復習</small></span></Link>
        <div className="sync-pill demo"><span className="dot" />端末に準備済み</div>
      </header>
      <section className="review-project-intro">
        <div><p className="eyebrow">OFFLINE PILOT</p><h1>準備済みの問題を復習する。</h1><p>表示と回答は端末に保存されたサーバー発行済み問題を使います。送信は通信が戻った後に行われます。</p></div>
        <div className="review-session-badge"><strong>1</strong><span>端末保存済み</span></div>
      </section>
      <ReviewSession
        cards={[state.card]}
        persistence="supabase"
        session={{ projectId: "kuzushiji", projectTitle: "くずし字", projectHref: "/projects/kuzushiji", mode: "practice", historyHref: "/projects/kuzushiji/progress" }}
        onPilotAttemptDurablyCommitted={onPilotAttemptDurablyCommitted}
      />
    </main>
  );
}
