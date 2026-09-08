"use client";

import { useEffect } from "react";
import { syncObjectiveStateMirror } from "@/src/lib/review/offline/objective-state-mirror";

/** Foreground reconciliation of the server Objective state replica. */
export default function ObjectiveStateMirrorSync() {
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void syncObjectiveStateMirror().catch((error) => {
        if (!cancelled) console.error("Study Graph: Objective state mirror sync failed", error);
      });
    };
    sync();
    const onOnline = () => sync();
    const onVisibility = () => { if (document.visibilityState === "visible") sync(); };
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
