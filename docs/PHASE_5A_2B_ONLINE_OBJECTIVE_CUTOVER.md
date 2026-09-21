# Phase 5A-2b: online Objective v2 cutover wiring

Parent #83; implementation #94; tracking #93.

This slice wires the existing Kuzushiji online pilot to the Phase 5A generic
Objective issuer and acceptance boundary. The code is ready for a separate
activation decision; production v2 issuance remains disabled by default and
was not enabled by this change.

## Issuance selection

The existing `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED` switch remains the outer
operational kill switch. When it is disabled, no new pilot instance is issued.
When it is enabled, the server-only
`STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED` selector chooses the issuer for
new **online** Kuzushiji work:

- exact `true` selects `study_graph_issue_objective_instance_v2`;
- unset or any other value keeps the existing v1 issuer.

The v2 issuer receives only server-owned archive, presentation, Scope evidence,
learner, epoch and intent facts. After both a new issue and an active-opportunity
reuse, the returned instance is resolved again through the ownership-filtered
immutable resolver. Its persisted presentation, release and revision are the
response authority; the candidate submitted to the issuer is never used as a
fallback.

## Acceptance routing and recovery

The attempt boundary validates and hashes the unchanged six-field request first,
then looks up the learner-scoped stored receipt. A stored legacy Receipt v1,
Objective Receipt v1, or Objective Receipt v2 is restored immediately by the
strict reader. No current routing, grading, Scope, epoch, opportunity or state
read occurs for an accepted retry.

For a first acceptance, the immutable Kuzushiji instance is resolved and must
belong to the supported project and exercise. `legacy-item` instances stay on
the legacy writer. `objective` instances must pass the instance/learner routing
RPC:

- all-null historical scheduling context selects the existing Objective v1
  writer;
- complete persisted Phase 5A context selects the v2 acceptance adapter;
- missing, partial, malformed, or mismatched context fails closed.

The current issuance flag is never consulted for acceptance. A v2-issued
instance remains v2 if a later operational rollback turns new v2 issuance off.
There is no automatic v2-to-v1 fallback.

For v2 first acceptance, grading uses the exact persisted immutable revision
payload, Scope is freshly read from the existing authoritative Notion path for
the persisted legacy item, and the epoch is compared with the trusted server
constant. The adapter sends no SRS plan; the database remains the SRS authority.

## Offline coexistence

Offline prefetch, IndexedDB, the service worker, the outbox, descriptor version,
and offline acceptance are unchanged. Existing offline Objective instances have
historical all-null scheduling context and therefore continue through the v1
Objective path.

## Operational rollback

Before any v2 instance exists, an older deployment may still be used for new
work. After the first v2 instance is issued, rollback means:

1. set `STUDY_GRAPH_OBJECTIVE_V2_ISSUANCE_ENABLED` off;
2. keep the context-aware acceptance router and Receipt v2 reader deployed;
3. continue accepting and recovering existing v2 instances with v2 authority;
4. never route a v2 instance through the v1 writer.

No schema rollback is part of operational cutback. An older deployment that
predates the routing boundary is not a safe rollback target after v2 issuance.

## Production activation procedure

Code-ready does not mean production v2 enabled. A later Supervisor-approved
activation must separately confirm the hosted 19/19 migration state and Advisor
review, deploy this routing boundary, and only then set the server environment
flag to exact `true`. That activation is outside this PR. No Vercel environment
was changed here, no hosted writer was called, and no production test record was
created.
