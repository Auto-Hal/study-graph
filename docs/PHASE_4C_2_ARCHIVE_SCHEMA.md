# Phase 4C-2 archive schema

Phase 4C-2 adds an additive, private Supabase archive boundary for the
Phase 4C-1 `ExerciseRevision` and `ContentReleaseManifest` models. It does not
change `public.review_attempts`, `public.review_state`, their RPCs, the Review
engine, Notion, Storage, or the current SRS path.

## Hash and identity authority

Node canonicalization v1 remains the authority for revision and
manifest hashes. The database stores the explicit `canonical_payload` string,
`content_hash`, and JSON `payload`; it does not recalculate a hash from JSONB.
This avoids assuming that PostgreSQL JSONB serialization is identical to the
Node canonical string. Operational status such as quarantine or retirement is
outside the revision `contentHash`.

The revision identity is `(project_id, exercise_id, exercise_version)`. The
unique constraint rejects a second row for that identity. A future archive
writer can treat an existing row with the same hash as idempotent and reject
an existing row with a different hash. `manifest_hash` is unique, so the same
manifest hash cannot be registered as a different release row. Release entries
are expected to contain the stable-identity-sorted entries emitted by 4C-1.

## Tables and access boundary

The migration creates only these new tables under `private`:

- `content_releases` stores the deterministic release ID, manifest hash and
  JSON manifest, source Git SHA, and creation time.
- `exercise_revisions` stores the immutable revision identity, Node canonical
  payload/hash, payload JSON, and the optional objective binding.
- `content_release_entries` maps a release to its archived revision rows. Its
  two foreign keys use `ON DELETE RESTRICT`, and `revision_id` is indexed.

Row-level security is enabled on all three tables. `public`, `anon`, and
`authenticated` receive no schema usage or table privileges. No runtime write
RPC is introduced in 4C-2; a future server-side archive path must be granted
only the smallest required insert capability. The immutable trigger rejects
row-level `UPDATE` and `DELETE` even if a controlled owner path is used. A
database owner or migration administrator can still technically change schema
objects; this migration does not claim absolute administrator immutability.

## Scope and rollback

4C-2 only establishes the archive schema. ExerciseInstance, Attempt,
server-authoritative grading, atomic SRS persistence, Objective SRS, and
offline replay are deferred to 4C-3 and later phases.

The migration has not been applied to the production Supabase project. To
roll back an applied migration, remove only the new objects in dependency
order (after stopping any future archive writer):

```sql
drop trigger if exists content_release_entries_immutable on private.content_release_entries;
drop trigger if exists exercise_revisions_immutable on private.exercise_revisions;
drop trigger if exists content_releases_immutable on private.content_releases;
drop function if exists private.study_graph_archive_row_is_immutable();
drop table if exists private.content_release_entries;
drop table if exists private.exercise_revisions;
drop table if exists private.content_releases;
```

The rollback does not drop the pre-existing `private` schema or the existing
`pgcrypto` extension. Static migration checks are available through
`pnpm run test:phase4c-2`; this checkout has no Supabase CLI, PostgreSQL client,
or local Docker database, so no database or production connection is used.
