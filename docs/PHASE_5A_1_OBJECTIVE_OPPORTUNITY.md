# Phase 5A-1 Objective opportunity contract

This document describes the browser-safe contract and stored-receipt reader added in Phase 5A-1a. It does not change issuance or acceptance behavior.

## SRS opportunity and practice

An SRS opportunity is one server-issued chance to apply a response to the learner/project/objective/epoch schedule observed at issue time. The future database contract will allow at most one active SRS-bearing opportunity for that key. Practice is outside that unique slot and always has effective evidence use `practice-only`; practice can never be upgraded by a client.

The immutable scheduling context distinguishes:

- `unseen` + expected revision `0`: the issuer transaction positively read the Objective state and observed that no row existed;
- `due` + a positive revision: the issuer observed that exact state revision;
- `practice` + expected revision `null`: the instance has no SRS application right.

Database read failure, timeout, or unknown state must never be converted to revision `0`. `0` is a positive observation, not a default.

The initial Phase 5A SRS opportunity TTL is seven days (`604800` seconds), pinned when a future instance is issued. Practice has no opportunity expiry. Expiry is a future acceptance fact and does not alter the already issued context.

## Stale evidence and historical instances

`stale-opportunity` means a v2 instance has trustworthy pinned scheduling context, but its opportunity expired or its expected state revision no longer matches.

`issuance-context-missing` means a historical/pre-v2 instance has no trustworthy pinned context, so its SRS eligibility cannot be proven. The system must not infer an expected revision for it.

Both outcomes may preserve the graded answer as accepted-no-SRS. That outcome is terminal: it does not update Objective state and is never applied retroactively.

## Future deterministic grade policy

The pure policy candidate `deterministic-correctness-cap-v1` maps an ungraded result to no grade, maps an incorrect graded response to `again`, and preserves a valid self-evaluation when the server marks the response correct. Missing self-evaluation on a correct response yields no grade. This helper is not wired into current Kuzushiji runtime.

## Receipt compatibility

Receipt v1 remains a strict historical contract with its existing reason set. Receipt v2 is an additive reader contract that accepts the v1 reasons plus `stale-opportunity` and `issuance-context-missing`. A no-SRS receipt carries null effective grade, state revision, and due time; it never invents current Objective state.

The offline receipt descriptor remains version 1 and stores the server receipt verbatim. Its nested Objective receipt reader accepts v1 or v2, so this change requires no IndexedDB/outbox migration or service-worker change.

## Scope of this slice

Phase 5A-1a adds typed contracts, a pure grade helper, receipt v2 restoration, offline reader coverage, and documentation. It makes no database schema, SQL/RPC writer, receipt writer, current Kuzushiji runtime, or Production behavior change. No current instance is assigned these future policies.

The next slice may add the additive opportunity schema and shared issuer/acceptance RPC foundation. Existing v1 issuance remains isolated until an explicitly reviewed cutover.
