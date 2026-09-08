"use client";

import { useEffect } from "react";
import { registerOfflineServiceWorker } from "@/src/lib/review/offline/service-worker";

/** Register the cache-only helper without changing ordinary online behavior. */
export default function OfflineShellRegistration() {
  useEffect(() => {
    void registerOfflineServiceWorker();
  }, []);
  return null;
}
