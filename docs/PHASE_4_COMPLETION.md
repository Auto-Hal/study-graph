# Study Graph Phase 4 completion

Phase 4 keeps human curriculum, immutable learning content, server history,
and local offline replicas at separate authority boundaries.

- **4A–4B:** Notion is read-only Scope/knowledge authority and the existing
  four-grade scheduler remains the runtime policy.
- **4C:** Git revisions/releases, server-issued instances, immutable attempts,
  receipts, and atomic legacy persistence establish historical integrity.
- **4D:** Objective definitions and Objective SRS use a fixed semantic identity
  and `learner + project + objective + epoch` state key. Objective and legacy
  writers remain isolated.
- **4E-1–4E-2:** Offline contracts and immutable server Scope/knowledge
  snapshots are versioned, hashed, and synchronized with a monotonic project
  pointer.
- **4E-3:** Authenticated current snapshot distribution and browser snapshot
  caching remove the normal dashboard's direct Notion dependency.
- **4E-4:** Answers are durably committed to an IndexedDB outbox before
  transport; server receipts determine terminal acceptance.
- **4E-5:** Only server-issued pilot instances and checksum-verified assets can
  be prepared for limited offline review.
- **4E-6:** A dedicated shell waits for an activated service worker, supports
  cold-start offline review, durably recovers foreground attempts, and keeps a
  server-derived Objective state mirror without moving authority into the
  browser. Versioned pilot results reconcile from the outbox/receipt and do
  not offer an answered instance again.

## Operational containment

1. Set `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` to stop new pilot instance
   issuance while preserving existing attempt/retry and receipt recovery.
2. Set `NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED=false` to stop new shell
   registration and safely unregister the Study Graph worker.
3. Keep pending outbox records, accepted receipts, issued instances,
   snapshots, and Objective state. Never repair history by deletion,
   backfill, or legacy copying.
4. Roll back the application to the last known-good commit if required. The
   service worker's online navigation is network-first, so a stale worker does
   not take precedence over the online rollback.

## Limitations carried forward

The offline pilot is one Objective and one prepared card per device. Storage
eviction cannot be prevented. Offline feedback is provisional. Fresh Scope is
rechecked at server acceptance. Background sync, full legacy Review offline,
multi-device merge, and local SRS authority are not part of Phase 4.


## Phase 5 access-policy override (2026-09-10)

The Phase 4 design and acceptance recorded above are historical. Phase 5A-0-3c changed the current runtime access policy: Study Graph-native learning data and native reads/writes no longer require interactive login. Same-origin mutation protection and the server-owned instance, requestHash, immutable attempt, Scope, grading, receipt, SRS, and offline invariants remain unchanged. Notion remains read-only; explicit authentication is reserved for future sensitive external-account access or external-system writes.
