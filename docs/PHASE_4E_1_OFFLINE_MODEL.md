# Phase 4E-1 Offline Model

Phase 4E-1 defines the pure contracts needed before a durable browser outbox
or cache is introduced. It does not open IndexedDB, write Cache Storage, read
Notion, change an API, or change any Supabase/runtime behavior.

## Authority boundaries

- **Notion** remains the read-only current curriculum Scope and
  human-managed knowledge authority.
- A **server ScopeKnowledgeSnapshot** is a complete projection observed at a
  point in time. It is useful for display, candidate selection, and historical
  evidence, but it is not current Scope authority and its `validUntil` is not
  an SRS authorization.
- **Git** remains the immutable/versioned authority for exercises, Objectives,
  graders, and assets.
- **Supabase** remains authoritative for server-issued instances, accepted
  attempts, Objective applications, receipts, and current Objective SRS
  state.
- **IndexedDB** will be only a local replica and durable unsent outbox.
  **Cache Storage** will hold verified immutable asset bytes. Neither local
  store is an authority.

## Snapshot contract

`ScopeKnowledgeSnapshot` has a server-managed monotonic `generation` and an
observation `snapshotId`. Its `contentHash` is calculated with the existing
Phase 4C `canonicalizeJson` and `sha256Hex` helpers over only the semantic
projection: schema/project/policy versions, structural source completeness,
scope decisions, and knowledge projection. Snapshot identity, generation,
read/publish timestamps, and `validUntil` are excluded. Thus re-observing the
same semantic content produces the same hash. A current pointer advances only
to a valid candidate with a greater generation; an expiry date never moves the
pointer backwards.

Set-like source identifiers, decision subjects, reason codes, and anchor
references are deterministically sorted for hashing; duplicate subjects or
duplicate set members are rejected. Arrays inside `knowledgeProjection` retain
their supplied order because that order may be semantic.

The initial operational guidance is a one-hour sync target and a two-hour
validity window after the completed source read. These values are freshness
guidance only; generation remains the pointer authority and neither value
authorizes SRS.

## Outbox contract

The first durable `pending` transition fixes an immutable submission containing
the existing Phase 4C request-hash fields: `attemptId`, `instanceId`,
`rawAnswer`, `selfEvaluation`, `responseMs`, and `usedHint`. The existing
`hashExerciseAttemptRequest` implementation is unchanged. Client timestamps and
snapshot references are optional historical claims and are excluded from the
request hash. `sending` is recoverable after a crash; transient network/5xx/429
failures return to `pending`, while 401 moves to `auth-required`. Accepted
states and `blocked` are terminal, and blocked payloads are retained without a
new UUID.

Receipt adoption is receipt-first. A local accepted state requires a complete
authoritative server receipt; an incomplete receipt is blocked and is never
repaired with the current request's grading result. An
`instance_already_answered` response without a receipt first produces the
non-terminal `receipt-lookup-required` classification. Only the server-derived
lookup result can then be terminal: a complete receipt for the same attempt is
accepted, a different attempt is blocked, and an incomplete receipt is blocked.
The transition function independently checks that an accepted receipt's
`attemptId` matches the outbox submission, even when the delivery classifier is
not used.

## Objective mirror and offline facts

Objective state mirrors are keyed by learner/project/objective/epoch and adopt
only a higher `stateRevision`. Equal revisions are idempotent only when all
mirrored fields match; a conflicting equal revision fails closed. Lower
revisions never roll a mirror back, and different epochs are separate keys.

An offline instance descriptor represents a server-issued instance only. It
does not define a client-created or provisional instance, and its learner,
Objective, epoch, evidence use, revision, presentation, and asset references
are immutable facts. Client grading can be provisional feedback only; server
grading and the server receipt remain authoritative.

An asset cannot be marked offline-ready without a verified SHA-256 checksum.
The current Kuzushiji pilot has no checksum, so the model correctly reports it
as not offline-ready until a later content change supplies one.
Immutable revision references and presentation hashes in offline descriptors
also require lowercase 64-character SHA-256 values; a missing checksum remains
valid metadata but never makes an asset offline-ready.

## Deliberately deferred to Phase 4E-2+

The next phases may add IndexedDB schema/open/upgrade, server snapshot sync,
prefetch of server-issued instances, asset verification/download, pending
attempt transport, fresh Scope recheck, receipt APIs, UI/offline indicators,
and multi-device delivery. This phase adds none of those mechanisms and does
not change the 4C/4D runtime contracts.
