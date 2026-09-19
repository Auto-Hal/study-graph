# Phase 5A-1c: Objective recovery and historical compatibility

Phase 5A-1c defines the read and recovery boundary for Objective attempts
before the v2 issuer and acceptance paths become part of the learner runtime.
It adds no database authority, writer, migration, or route cutover.

## Recovery authority

Recovery reads the accepted attempt and its stored immutable Receipt first. The
instance attribution and opportunity lifecycle are read-only context, followed
by current Objective state only when a later feature explicitly needs it. An
accepted Receipt is never reconstructed from current state, current grading,
Scope, or a replacement opportunity.

Receipt v1 and Receipt v2 coexist. The existing strict receipt reader accepts
only the reason vocabulary belonging to each version. The browser-safe recovery
view copies the stored authority fields and marks every accepted result as
terminal. In particular, `stale-opportunity`,
`issuance-context-missing`, `practice-only`, and `grader-unavailable` remain
accepted-no-SRS results on reload and retry; none can be retroactively applied
to SRS.

## Historical bindings

An all-null scheduling context is a proven historical v1 binding. It does not
mean state revision zero, and it does not authorize SRS. A missing or partial
context read fails closed instead of inferring v2 fields. Only a complete,
strictly validated v2 context can carry a pinned expected revision; `0` means
the issuer positively observed that the Objective state row was absent, while
`null` is reserved for practice-only.

Terminal opportunities are never active. A recovery reader can prove that an
active opportunity still owns the exact instance it was issued for, but it
cannot attach an old attempt to a replacement opportunity.

## Retry and offline compatibility

The same `attemptId` and six-field request hash continue to identify a retry.
The stored Receipt is returned verbatim through the existing descriptor-v1
offline wrapper. No grader, SRS calculation, opportunity validation, or state
mutation is repeated during reload/retry recovery. IndexedDB schema versions,
outbox identity, and service-worker behavior remain unchanged.

The current Kuzushiji v1 issuer/acceptance runtime remains in place. This
slice does not call the v2 RPCs, migrate historical rows, recreate
opportunities, or introduce a retroactive repair queue. Runtime cutover is a
later phase.


