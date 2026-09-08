# Phase 4E-5: offline prefetch and verified assets

Phase 4E-5 prepares one Kuzushiji pilot question for use while an already
loaded app is temporarily offline. The server remains the authority. It issues
and persists the instance, pins the current snapshot evidence and Objective
attribution, and later grades the immutable attempt through the existing
4E-4 endpoint. A device identifier is delivery metadata only; it is not an
authentication, learner, or Objective identity.

## Immutable content boundary

The original pilot revision (v1) remains unchanged. Its asset checksum is
unknown (`null`) and therefore it is not offline-ready. Revision v2 uses the
same repository PNG bytes, measured with SHA-256, and asset version 2. Its
prompt, accepted answer, grader, Objective ID/version, and epoch remain the
same. The new release/archive registration is additive and is used only by the
prefetch path; historical v1 instances continue to resolve and retry.

## Server-only issuance

The authenticated `POST /api/review/pilot/prefetch` route accepts only a
durably generated `deviceId` and `issuanceRequestId`. The server supplies the
fixed learner, v2 release/revision, Objective binding, epoch, presentation,
feedback bundle, and asset descriptors. The Supabase RPC serializes issuance by
learner/project/device, maps one request ID to one instance, and reuses one
unused instance for that device. A successful attempt in the authoritative
`private.exercise_attempts` table makes the next prefetch eligible for a new
instance. The request mapping is immutable and idempotent.

The current Scope snapshot is issuance evidence only. It must be complete and
eligible for the pilot; first accepted submission still performs the existing
fresh Notion Scope check. Prefetch does not apply SRS and does not change Review
or Objective semantics.

## Local cache and asset verification

Issued descriptors are stored in the independent
`study-graph-offline-instance-cache` IndexedDB database. Device and issuance
request IDs are committed before the prefetch request. No provisional
client-created instance exists. The issued instance is offered only while it
is `ready` and its asset bytes are verified.

The v2 PNG is fetched into `study-graph-offline-assets-v1` only after Web
Crypto SHA-256 matches its pinned checksum. The cache key contains the
checksum, and IndexedDB `offlineReady` is set only after `Cache.put` and its
own transaction complete. A missing or mismatched checksum/byte set is never
offline-ready. The existing v1 asset remains `offlineReady=false` because its
checksum is null. Provenance, license, dimensions, asset version, and the
revision content hash remain pinned to the descriptor; no current Notion/Git
data is used to overwrite them.

The feedback bundle contains accepted answers solely for provisional client
feedback. It is separate from the answer-free presentation. Client correctness
is never sent as an authority field and never authorizes SRS; the server grader
and receipt remain authoritative.

## Durable answer flow

An offline card uses the existing 4E-4 durable outbox. The attempt submission
is committed to `study-graph-attempt-outbox` before transport, then the local
instance marker changes from `ready` to `answered`. If the network is absent,
the immutable submission remains pending and is retried with the same attempt
ID and request hash when connectivity returns. Server acceptance performs the
normal fresh Scope/revision/epoch checks: offline transport itself is not a
no-SRS reason. Accepted receipts are terminal and no longer offered as a ready
card. A failed local commit does not advance the card.

## Rollback and scope limits

Rollback stops the prefetch control and new issuance. Existing v2 archives,
instances, requests, pending submissions, and receipts are retained; rows are
never deleted or rewritten, and v1 instances are never changed to v2. The
attempt and receipt endpoints remain available for retries. The normal Review
and legacy writer are not changed.

This phase does not add a service worker, PWA shell, cold-start offline mode,
bulk prefetch, more than one card per device, Cache Storage for other assets,
Background Sync, cron, multi-device merge, or local SRS authority. Those are
future Phase 4E work after supervisor review.

