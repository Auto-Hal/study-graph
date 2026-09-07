# Phase 4D-2 Objective SRS persistence foundation

Phase 4D-2 adds an additive database boundary for archiving Objective
definitions, resolving Git revision bindings, pinning Objective attribution on
future instances, and recording Objective SRS applications. It does not
connect the runtime or migrate any existing data.

## Content and identity

`private.objective_definitions` stores the Git-owned semantic
`ObjectiveDefinition` payload, its explicit canonical payload, and the
Node-generated content hash. Node canonicalization is the hash authority;
Postgres does not recompute or reinterpret the hash. `objectiveVersion` is part
of semantic identity. `srsEpoch` is compatible SRS generation metadata and is
kept out of Objective content identity and out of the Objective definition
primary key.

`private.exercise_objective_bindings` resolves a Git
`revisionContentHash` to the UUID in `private.exercise_revisions`. A revision
has at most one immutable Objective binding. The Git hash is never used as the
database UUID. `private.instance_objective_bindings` pins the Objective,
version, epoch, and evidence use on an instance; Phase 4D-2 does not backfill
older Phase 4C instances.

## State and application boundaries

`private.objective_review_state` is the only mutable table. Its key is

```text
learner_id + project_id + objective_id + srs_epoch
```

and deliberately excludes `objectiveVersion`. `state_revision` increments
once per applied Objective attempt. A new epoch starts an independent state;
Phase 4D-2 does not migrate or inherit old state.

`private.objective_srs_applications` is an immutable audit record with one row
per accepted attempt. It stores the exact Objective attribution, whether SRS
was applied, the reason, state snapshots, and a versioned receipt. No-SRS
attempts are preserved with null state snapshots and one of the explicit
reasons (`grader-unavailable`, `scope-not-eligible`,
`revision-quarantined`, `revision-retired`, `practice-only`, or
`epoch-inactive`).

Objective persistence uses the existing immutable
`private.exercise_attempts` history table. Its pre-existing `srs_reason` enum
does not contain every Objective-only reason, so the Objective RPC projects
those no-SRS reasons to its neutral `scope-not-eligible` value in that shared
row; `objective_srs_applications.reason` and its receipt remain authoritative.
The Objective RPC never writes `public.review_attempts` or
`public.review_state`. This explicit legacy isolation keeps the legacy RPC
unchanged, so an attempt cannot advance both SRS systems.

## RPC and concurrency contract

The service-role-only RPCs are:

- `study_graph_register_objective_definition`
- `study_graph_register_exercise_objective_binding`
- `study_graph_register_instance_objective_binding`
- `study_graph_record_objective_attempt`

They are `SECURITY DEFINER` functions with `search_path = pg_catalog`, fully
qualified data objects, and no `PUBLIC`, `anon`, or `authenticated` execute
grant. The private tables have RLS enabled and no browser table privileges.

Registration is idempotent for the same immutable identity and content. A
different hash or binding for an existing identity is rejected. Objective
attempt persistence locks the attempt ID, then the instance, and finally a
deterministic advisory key made from learner, project, objective, and epoch
before selecting the current state `FOR UPDATE`. The advisory lock protects
the state-absent first update as well as an existing row. The SQL scheduler
keeps the existing four-grade arithmetic (Again ten minutes; Hard/Good/Easy
initial 1/2/5 days and 1.2/2.2/3.2 repeat multipliers).

Retries with the same attempt ID and request hash return the stored Objective
receipt without re-grading, scope checks, epoch checks, or a second state
update. A hash mismatch is `attempt_conflict`; another attempt for the same
instance is `instance_already_answered`. The receipt is stored in the same
transaction as the immutable attempt, Objective state update, and application
row.

## Migration and rollback

The migration is additive and does not alter, rewrite, or backfill existing
tables, rows, RPCs, review history, SRS state, Notion, or Storage. Production
Supabase has not been applied. The repository has no Supabase CLI or local
Postgres in the standard environment, so SQL parsing and contract tests are
static; integration verification required against a disposable Postgres
remains before production application.

The Objective runtime is not connected in Phase 4D-2; it does not perform
runtime instance issuance, browser/API cutover,
legacy state migration, offline sync, or authentication changes. Rollback is
performed only after stopping any future Objective writer, by removing the
four service-only RPCs, immutable triggers, applications, state, instance
bindings, exercise bindings, and Objective definitions in reverse dependency
order. Existing Phase 4C archive/instance/attempt and legacy paths remain
available.
