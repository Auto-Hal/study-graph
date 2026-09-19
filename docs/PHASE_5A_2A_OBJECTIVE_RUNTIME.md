# Phase 5A-2a: Objective runtime adapter and cutover gate

Parent #83; implementation #91. This slice prepares a server-only boundary;
current Kuzushiji online/direct/offline routes still use their existing v1 runtime.
No production v2 instance or attempt is issued, no hosted migration is applied,
and no browser/offline persistent schema changes.

## Authority boundary

`review/objective-runtime.ts` is the unused server entry point. The Supabase
transport exposes a fixed RPC allowlist, uses server credentials/learner identity,
and maps failures to bounded codes without retaining SQL messages or headers.
The runtime-neutral core validates exact RPC shapes and semantic consistency.

Issuance accepts trusted archive/presentation facts and a server-selected
scheduled/practice intent. The DB derives opportunity kind, effective evidence,
expected revision and pinned policies. Callers cannot supply those decisions.
Reuse is successful issuance: returned instance/release/revision IDs are the
authority. A future caller must resolve the reused instance's own presentation
and archive instead of displaying the candidate it submitted.

Acceptance receives the unchanged immutable six-field submission. The server
computes its existing canonical hash and checks the stored Receipt first. An
accepted retry returns that exact Receipt before any grading, Scope, epoch or
routing read. Lost-response retries converge on the committed Receipt; no
accepted no-SRS result is retro-applied. Concurrent first calls remain serialized
by the existing DB attempt/opportunity transaction.

For first acceptance only, explicit server callbacks supply grading from the
persisted instance's archive, fresh Scope, and the active epoch decision. No
browser flag, cached Scope, snapshot freshness or issuance-time Scope supplies
these facts. The current Kuzushiji fresh Notion Scope and epoch constant remain
unchanged; actual project wiring is deferred. The adapter sends no SRS plan,
effective grade or result reason. The DB applies deterministic correctness cap:
incorrect -> again; unusable grading -> no-SRS. Receipt v2 is restored by the
existing strict Objective Receipt reader. Historical Receipt v1 stays readable.

## Supervisor-approved read-only migration

`20260919132141_phase_5a_2a_objective_instance_routing.sql` adds only
`study_graph_resolve_objective_instance_routing(instance, learner)` and its ACL.
It joins immutable instance ownership to immutable Objective binding and returns
14 persisted attribution/context fields. It reads neither current Objective
state nor opportunity lifecycle. It has no writes or row/advisory locks.
SECURITY DEFINER uses fixed `pg_catalog`; only service_role may execute. Private
table privileges and RLS remain unchanged. No new columns or historical backfill.

The core passes every explicit context field to `readObjectiveSchedulingContext`:
all-null historical context -> v1; complete valid context -> v2 (including
practice and expired context); missing, partial or malformed -> bounded error.
No row (including wrong learner or absent binding) must never mean historical v1.

## Cutover and rollback

The unused server gate `STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED` defaults OFF;
only exact `true` selects future v2 **new issuance**. Current routes do not import
the gate or adapter, so this PR cannot activate current learner v2 behavior.

Future acceptance must first restore any stored Receipt, otherwise resolve the
instance-pinned context from the read RPC. It must never select its writer using
the current issuance flag. A v2 practice instance is still a v2 instance. Turning
the gate OFF may stop new v2 issuance, but must keep v2 acceptance/recovery for
already-issued v2 instances. An old deployment without this routing boundary is
not a safe rollback target after issuing v2 work: retain the compatible router
or fail closed; do not route those instances through v1. There is **no automatic v1 fallback**
after any v2 error. Missing DB deployment is unavailable, never implicit v1.

## Verification

`npm run test:phase5a-2a` tests real adapter modules with captured fetch (no real
network), including response loss/retry, gate rollback and authority rejection.
`npm run test:phase5a-2a:db` requires `STUDY_GRAPH_ISOLATED_DB=1` and `psql`.
Set `STUDY_GRAPH_TEST_DATABASE_URL` to a dedicated local PostgreSQL administrative
database `/postgres` and optionally `STUDY_GRAPH_TEST_PSQL` to its executable.
Remote hosts are rejected. The harness creates a random disposable database,
applies the entire migration chain, creates minimal fixtures, exercises the real
issuer and routing RPC, checks ACLs under real roles, compares all application
table content before/after reads, and drops only its own database.

CI uses an isolated PostgreSQL 17 service in the existing job; no hosted secrets.
Only Supabase's baseline roles and `extensions` schema are bootstrapped; app tables,
constraints, functions and data semantics come from repository migrations.

## Remaining Phase 5A-2b gates

- Study Graph hosted Supabase migration smoke test (including this resolver).
- Hosted Security Advisor and Hosted Performance Advisor.
- Explicit Supervisor approval for online v2 activation.
- Wire authoritative archive/presentation, fresh Scope and epoch callbacks;
  route historical and v2 instances safely, including any still-active offline v1 path.
- Define an operational rollback retaining context-aware acceptance and Receipt recovery.

Offline issuer/transport cutover, new Philosophy/Art pilots, new grading strategies,
Notion writes, runtime OpenAI and Phase 6 assessment remain outside this slice.
