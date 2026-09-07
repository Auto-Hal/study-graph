# Phase 4D-4 — Kuzushiji Objective pilot cutover

Phase 4D-4 cuts only the curated `日本永代蔵「あ」字形の単字読解` pilot from legacy item SRS to Objective SRS. It does not broaden Objective equivalence, add multi-user identity, change Notion, or migrate unrelated review items.

## Human migration decision

The read-only 4D-3 audit showed that the existing legacy character state combines an old unversioned review, a generic visual-reading attempt, and the current fixed Eitaigura visual-reading revision. That history does not prove one-to-one semantic equivalence with the narrow Objective.

The approved decision is therefore: **legacy state is not seeded into Objective SRS**. Existing legacy state and attempts remain untouched and readable. Objective epoch 1 starts uninitialized and is created only by the first accepted post-cutover Objective attempt.

## Runtime boundary

Before issuance, the server idempotently registers the Git-owned Objective definition and the immutable revision-to-Objective binding. The new service-role issuer creates the `exercise_instances` row with `srs_target = objective` and the matching `instance_objective_bindings` row in one database transaction. Objective ID/version/evidence are resolved from the archived revision binding; they are not request parameters.

The pilot scheduler reads `private.objective_review_state` only through a service-role RPC for the fixed Objective and active epoch. A missing row is treated as unseen. An existing row is queued only when its own `due_at` has arrived. The legacy `public.review_state` no longer determines this pilot's queue.

Submission branches on the immutable instance target. New Objective instances call `study_graph_record_objective_attempt`; already-issued legacy instances continue through the legacy attempt RPC so accepted historical instances remain retryable. No attempt writes both Objective and legacy SRS state.

## Retry and failure behavior

A retry with the same attempt ID and request hash restores the stored receipt before re-checking current Scope or epoch. A different attempt ID for an already answered instance returns `instance_already_answered`; the same attempt ID with a different request hash returns `attempt_conflict`.

Scope ineligibility, quarantine/retirement, inactive epoch, practice-only evidence, or unavailable grading preserve the immutable attempt/application without changing Objective state. Correctness and self-evaluation remain separate; the existing four-grade self-evaluation is the SRS grade when application is allowed.

## Rollback

Operational rollback is fail-closed: disable new pilot issuance first, then revert the application cutover if necessary. Do not delete accepted Objective attempts, applications, bindings, or state. The old legacy issuer/writer remains present for pre-cutover instances. The widened `exercise_instances.srs_target` constraint can remain in place during rollback; shrinking it while Objective instances exist would be unsafe and is not required to stop the writer.
