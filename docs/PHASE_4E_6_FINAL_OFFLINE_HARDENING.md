# Phase 4E-6 Final Offline Hardening

Phase 4E-6 adds the smallest cold-start path for the Kuzushiji pilot. It
reuses the Phase 4E-3 snapshot cache, Phase 4E-4 durable attempt outbox, and
Phase 4E-5 server-issued instance and verified asset stores. IndexedDB and
Cache Storage remain replicas; they never become Scope, grading, instance, or
SRS authorities.

## Authority boundary

- Notion remains the read-only current curriculum and knowledge authority.
- Git remains the immutable Exercise, Objective, grader, and asset authority.
- Supabase remains authoritative for issued instances, accepted attempts,
  receipts, Objective applications, and Objective SRS state.
- IndexedDB stores local snapshots, server-issued instances, receipts, the
  durable answer outbox, and a server-derived Objective state mirror.
- Cache Storage stores only verified immutable asset bytes and the dedicated
  app shell. The service worker only helps transport/cache these replicas.

The cached Scope snapshot is display and candidate context. It cannot authorize
SRS. First acceptance still performs the existing fresh Notion Scope check.
Offline feedback is provisional; server grading and the stored receipt remain
authoritative.

## Dedicated shell and cold-start flow

`/offline-review` is a dedicated shell. It reconstructs a prepared card from
the server-issued instance cache, verified asset bytes, pinned feedback bundle,
snapshot cache, and durable outbox. It does not read Notion, Supabase, or an
API while offline. A card can be offered only when it is server-issued,
locally ready, has verified bytes, has no existing outbox submission, and has
not been explicitly excluded by a newer local snapshot. Missing bytes or
storage never deletes the instance or outbox.

The service worker in `public/study-graph-sw.js` uses network-first navigation
and falls back to the prepared `/offline-review` shell only after a network
failure. Hashed `/_next/static/` files are cache-first. `/api/*`, `/login`,
all non-GET requests, and attempt transport are network-only and are never
cached. Activation removes only older `study-graph-app-shell-*` caches; it
does not delete the Phase 4E asset cache or any IndexedDB database.

The explicit “オフライン復習を準備” action warms the shell after the instance
and asset are ready. “オフライン起動準備済み” is shown only after the
service worker is active/activated and the shell HTML and all required static
dependencies are in Cache Storage. Activation waiting is bounded; a timeout
leaves readiness false. A shell warm failure leaves existing instance and
asset data intact and reports that preparation can be retried.

The public switch
`NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED=false` disables new worker
registration and best-effort unregisters this worker. It may remove only
app-shell caches. It never removes snapshots, assets, issued instances,
outbox records, or receipts. The switch is independent of
`STUDY_GRAPH_PILOT_ISSUANCE_ENABLED`.

The manifest uses standalone display metadata and the existing icon. No
install prompt, service worker background sync, or cold-start server call is
required.

## Foreground outbox recovery and session results

The page owns recovery of `sending` records and flushes pending pilot
submissions on mount, when the page becomes visible, and on the `online`
event. The same recovery helper is mounted by the dedicated cold-start shell,
including when no card can be rendered. The worker never sends attempts.

Review results keep the attempt ID and the state observed at answer time, but
the current status comes from the durable outbox. After a flush, the stored
authoritative receipt is parsed again; its `isCorrect`, `dueAt`, and
`srsApplied` values replace provisional result fields. A malformed terminal
receipt fails closed. `accepted-applied` and `accepted-no-srs` are server-saved
terminal states, while pending, auth-required, and blocked remain visible as
separate attention states. The Objective state mirror is refreshed only after
the flush settles.

The completed screen does not offer “もう一度取り組む” for the one-card
versioned pilot, because that would re-present an answered server-issued
instance. Regular legacy Review sessions retain their repeat action. A marker
write in the separate issued-instance cache is a secondary hint; if it fails
after outbox commit, transport and session progress continue, and a later
foreground load reconciles the marker from the durable attempt.

## Pilot attempt 400 diagnostics

The pilot attempt endpoint keeps the existing six-field request validator and
logs only its bounded validation error code when that validator rejects a
request. The exact production 400 cannot be proven from source alone without
the iPhone's blocked IndexedDB payload. A blocked versioned-pilot completion
screen therefore exposes a read-only structural diagnostic view: field types,
string lengths, versions, UUID validity, transport status/code metadata, and
retry count are shown without answer text or credentials. The optional
“保存済み入力を検証” action sends the exact immutable six-field tuple to
`/api/review/pilot/attempt/validate`; that authenticated, same-origin route
only calls the shared validator and never submits, grades, reads/writes
Supabase, or changes the blocked record. Validation results are diagnostic
metadata only and never enter the request hash, receipt, or SRS state.

The blocked record remains terminal for automatic retry. Supervisors should
open the existing blocked completion screen on the iPhone, capture the
structural values, and use the explicit validation action if needed. They
should not clear storage or press any action that creates a new attempt.

## Objective state mirror

`GET /api/review/pilot/objective-state` is an authenticated, server-only read
of the existing Objective state RPC. Learner, project, Objective, and epoch
are fixed on the server. The independent
`study-graph-objective-state-mirror` database adopts only a higher
`stateRevision`; an older revision is ignored, an identical revision is
idempotent, and a conflicting equal revision fails closed. A 404 does not
delete a previous mirror. The mirror is never used for queue scheduling,
offline eligibility, Scope checks, attempt payloads, or local SRS calculation.

## Rollback runbook

1. Set `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` to stop new pilot issuance.
2. Set `NEXT_PUBLIC_STUDY_GRAPH_OFFLINE_SHELL_ENABLED=false` and deploy the
   app so new worker registration stops and this worker is safely unregistered.
3. Keep attempt submission and historical receipt lookup available.
4. Do not delete pending outbox records, accepted receipts, issued instances,
   snapshots, or Objective state.
5. Do not rewrite v1/v2 revisions, copy Objective state into legacy state, or
   fall back to a client-created instance.
6. If needed, roll back the application to the Phase 4E-5 main commit. The
   network-first worker behavior prevents a stale shell from taking priority
   over an online rollback.

## Known limitations

- The offline pilot currently covers one Kuzushiji Objective and one prepared
  card per device.
- Browser storage can be evicted; persistence requests are best effort.
- Offline feedback is provisional and is not a mastery proof.
- Server first acceptance rechecks fresh Notion Scope before applying SRS.
- There is no automatic background sync or offline app shell for the full
  legacy Review experience.
- The existing production prepared instance is reserved for a supervisor-led
  iPhone Safari validation after merge; this change does not access it.
