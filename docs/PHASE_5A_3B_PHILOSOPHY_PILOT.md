# Phase 5A-3b: Western Philosophy Objective pilot

This slice adds one Git-owned, text-only Objective: `philosophy.anaximander.arche-recall` (Exercise/Objective version 1, SRS epoch 1). Its Scope subject is the Notion term page `3bdd2793-4134-81db-bc14-cbb389912018`; the directly related completed Lecture 1 is the eligibility anchor. The content references the [lecture](https://app.notion.com/p/3bdd279341348105904bd47a4f0f6f52) and [term](https://app.notion.com/p/3bdd2793413481dbbc14cbb389912018) pages, but the immutable answer and deterministic grading contract live in Git.

The server-only `STUDY_GRAPH_PHILOSOPHY_PILOT_ISSUANCE_ENABLED` flag defaults OFF. Only exact `true`, together with the existing global `STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED=true`, allows new Philosophy issuance. While the Philosophy flag is ON, the term is removed from legacy graph-practice scheduling before due/unseen selection. A not-due result or issuance failure leaves the term absent; there is no legacy fallback.

The generic archive RPC registers the immutable revision, Objective definition, and binding. The generic v2 issuer determines due/unseen/reuse under the Objective lock. The Review card always comes from the learner-scoped persisted instance, including when a prior immutable revision is reused. At first acceptance, the server grades the persisted revision, re-reads the live Philosophy Notion graph for fresh Scope, and checks the trusted epoch constant. The database determines the final SRS application and Receipt v2. Accepted retries return the stored Receipt before project resolution or fresh authority reads.

The existing six-field durable outbox and `/api/review/pilot/attempt` endpoint are reused. Project dispatch comes only from the persisted instance. Philosophy does not use Kuzushiji's Objective state mirror or offline prefetch. The generic receipt lookup remains read-only and learner-scoped.

Immutable hashes for this version:

| Record | SHA-256 |
| --- | --- |
| ExerciseRevision contentHash | `e447af0932b075e2b57cc6ce200cfc499ef4f6dd002196ee4ceb9a9bbfc27318` |
| ContentRelease manifestHash | `d16990dd6dc12cbca7187f10e626f520c9bace8572fa94a02c2bad1ce0f1e064` |
| ObjectiveDefinition contentHash | `03b0197db1ca4ce1ef90301035715c412d8cc49f98ef78d438c490276d86652f` |

This PR leaves the Philosophy flag unset in Production. Future activation requires a separate approval and production environment change. Turning the flag OFF stops new Philosophy issuance and restores the legacy term candidate; already-issued v2 instances must continue through context-aware v2 acceptance and Receipt recovery. No schema rollback or pre-Phase-5A deployment is part of operational cutback.
