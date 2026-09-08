"use client";

import { useEffect } from "react";
import { syncObjectiveStateMirror } from "@/src/lib/review/offline/objective-state-mirror";
import { recoverAndFlushPilotOutbox } from "@/src/lib/review/offline/foreground-sync";

/**
 * Cold-start-safe foreground transport recovery. The service worker remains
 * cache-only; attempts are recovered and sent by the page while visible.
 */
export default function PilotOutboxForegroundSync() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await recoverAndFlushPilotOutbox();
      } catch (error) {
        console.error("Study Graph: pilot outbox foreground recovery failed", error);
      }
      if (cancelled) return;
      try {
        // This is a display/reconciliation mirror only. It runs after the
        // flush promise settles and never authorizes an attempt or SRS write.
        await syncObjectiveStateMirror();
      } catch (error) {
        console.error("Study Graph: Objective state mirror refresh failed", error);
      }
    };
    void run();
    const onOnline = () => { void run(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void run(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return null;
}
