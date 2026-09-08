# Phase 4E-2: strict Scope / Knowledge snapshot sync

Phase 4E-2 adds a strict server reader and server-only sync primitive for the
Kuzushiji project. It reads the three Notion data sources strictly, builds the Phase 4E-1
`ScopeKnowledgeSnapshot`, and publishes an immutable archive row with a
project current pointer. It is not called by screen rendering or Review
selection yet.

Notion remains the read-only current curriculum and human knowledge authority.
The screen reader may use demo data for a resilient page; the snapshot reader
never does. A missing token, HTTP error, malformed response, incomplete page,
or `has_more=true` without a cursor fails the complete sync. No partial or
demo result can be published; there is no demo publish path.

The reader fetches every page from Lectures, Characters, and Mistakes; full
pagination is required before success. The
projection stores deterministic `lectures`, `characters`, `mistakes`, and
`reviewQueue` arrays. It keeps the existing queue business rule while adding
stable snapshot-only tie-breaks. `relationCompleteness=true` is valid for this
pilot because the current projection does not consume relation fields. It
does **not** mean that every relation in the Notion workspace was retrieved;
if a future projection needs relations, that evidence must be complete before
publishing.

Snapshot content hashes reuse the Phase 4E-1 canonicalization contract. The
semantic fields are hashed; snapshot ID, generation, observation timestamps,
and `validUntil` are excluded. `validUntil` is a freshness indicator (the
initial value is source-read completion plus two hours), not an SRS authority.

## Archive and coordination

`private.scope_knowledge_snapshots` is an immutable history table keyed by
`(project_id, generation)` and protected by the existing archive immutability
trigger. `private.project_snapshot_sync_state` is the separate mutable
coordination/health row. Its current pointer advances only with a successful
publish, while `next_generation` is monotonic.

The service-role-only RPCs are:

- `study_graph_begin_scope_snapshot_sync`: takes a project advisory lock,
  reserves a generation, and starts a 15-minute lease. A live run blocks a
  second run; an expired run can be replaced.
- `study_graph_publish_scope_knowledge_snapshot`: validates the active run,
  generation, hash shape, schema, and complete evidence before inserting the
  immutable row and moving the pointer. A committed identical generation is
  idempotent; mismatched content is rejected.
- `study_graph_fail_scope_snapshot_sync`: records failure only when the run
  still owns the active lease, so an old job cannot overwrite a newer run's
  health.
- `study_graph_get_current_scope_knowledge_snapshot`: reads the current
  pointer only and never falls back to Notion.

All functions use `SECURITY DEFINER` with `search_path = pg_catalog`. Public,
anon, and authenticated roles have no table access or function execution
privilege. The browser cannot invoke sync or see the private archive.

## Server sync flow

`syncKuzushijiScopeKnowledgeSnapshot()` creates a server run UUID, begins the
lease, records the source-read interval, invokes the strict reader, reuses
the Phase 4B scope evaluator, builds and self-validates the snapshot, and
publishes it. On failure it attempts the health failure RPC while preserving
the original error. Runtime is not cutover: no API route, cron, or screen-load
hook is installed.

## Rollback and later phases

Rollback is operational: stop invoking the sync primitive. Existing snapshot
rows and the current pointer are retained; they are never deleted, rewritten,
or backfilled, and the existing Review runtime is unaffected. Phase 4E-3 may
add a server read/distribution boundary, followed later by browser storage,
offline outbox, and scheduling decisions. Those are intentionally outside
this migration.
