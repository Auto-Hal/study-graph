# Phase 4E-3: Kuzushiji snapshot distribution

Phase 4E-3 moves the normal Kuzushiji dashboard from a screen-load Notion
read to the current server snapshot. Notion remains the read-only curriculum
authority; the snapshot is a complete server observation used for display,
candidate lists, and historical context. It is never used to authorize a
review or an SRS update. The existing first-acceptance fresh Scope check is
unchanged.

## Boundaries

- Git remains the authority for versioned exercise, Objective, grader, and
  asset definitions.
- Supabase is the server authority for the archived snapshot/current pointer,
  instances, attempts, receipts, and SRS state.
- The authenticated snapshot API reads the Supabase current pointer and never
  falls back to Notion or demo data.
- The manual sync API is an explicit authenticated action. It calls the strict
  4E-2 reader, which requires a Notion token, fetches all three data sources to
  completion, and rejects partial or malformed pagination. It is not called by
  screen rendering and no cron is installed.
- Browser IndexedDB is a local replica only. `snapshots` stores immutable
  snapshot observations by `snapshotId`; `snapshot_meta` stores the project
  current pointer. Candidate hash verification and pointer adoption occur in
  one read-write transaction. Generation is monotonic; `validUntil` is only a
  freshness hint and never an SRS authority.
- Cache Storage, offline attempts, and the outbox are intentionally deferred.

The current snapshot route requires the existing signed Study Graph session.
Manual sync also requires the existing same-origin write check. Supabase
service-role credentials and the Notion token stay server-only. A missing
session receives `401`; the browser cannot choose a project, learner, source,
generation, or snapshot identity.

## Projection and evidence

The Kuzushiji projection is `kuzushiji-v1` and contains `lectures`,
`characters`, `mistakes`, and the deterministic `reviewQueue`. It contains no
`mode` or `sourceState` fallback values. `relationCompleteness=true` is set
because this version of the projection does not consume Notion relation
fields; it does **not** mean that every workspace relation was crawled. If a
future projection consumes relations, the strict reader must establish their
completeness before publishing.

The snapshot content hash reuses the Phase 4E-1 canonical JSON contract. It
includes semantic projection/scope content and structural source evidence,
while excluding `snapshotId`, `generation`, and observation timestamps. The
server row mapper and the browser verify the stored hash before use.
The dashboard adapter accepts only the explicitly supported
`kuzushiji-v1` projection and fails closed for unknown projection versions.

## Failure and rollback

No current snapshot yields an explicit bootstrap message and a manual “今すぐ
同期” action. A network/5xx error may display an already verified local cache;
an authentication failure directs the user to login and never promotes cache
to authority. An invalid candidate is not cached and cannot overwrite a
verified pointer. An expired `validUntil` remains viewable with a freshness
notice. When the server current request succeeds, that response remains the
display source even if IndexedDB returns a structured-clone copy; only a
strictly newer verified local generation is labelled `Snapshot cache`. Manual
sync network rejections are caught, preserve a ready dashboard, and otherwise
produce a controlled unavailable state.

To roll back, stop invoking manual sync and leave existing snapshot rows and
the current pointer intact. The normal Review, Scope recheck, attempt, and
SRS paths are unchanged. Reverting the dashboard/API/cache changes removes
the distribution path without deleting immutable history. 4E-4 will address
offline instance/attempt delivery and does not belong to this change.
