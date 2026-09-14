# Phase 5A-0 Product UX

Phase 5A-0 introduces the learner-facing visual and navigation foundation. It
does not change the Phase 4 authority model or any review persistence
semantics.

## Information architecture

The primary navigation has exactly three learner-facing destinations:

- `今日` (`/`) answers “次に何をする？”
- `学ぶ` (`/projects`) answers “何を学んでいる？”
- `復習` (`/review`) answers “何を復習する？”

Graph remains available at `/graph` and through project context as
「知識のつながり」. Progress remains available from Today and Project Detail.
Settings is reached from the shared header. Operational diagnostics are under
`/settings/advanced/diagnostics` and remain read-only until an existing
explicit recovery control is used.

`/review` is a landing page. The focused session is `/review/session`, which
reuses the existing `loadReviewProject` and `ReviewSession` behavior. Offline
preparation is presented at `/review/offline`; the existing `/offline-review`
and compatibility routes remain available.

## Visual principles

The new surfaces use a quiet neutral base, ink-like text, a restrained blue
accent, compact headers, editorial list rows, and one clear action surface.
Whitespace and dividers separate ordinary sections. Cards are reserved for a
primary action or an independently selectable object. Technical identifiers,
phase labels, adapter details, and persistence internals are not normal
learner content.

The shell is mobile-first, respects the iOS safe area, provides visible focus,
44px-class targets where practical, and honors reduced motion. Navigation
feedback is immediate; data refresh remains server-authoritative.

## Deep learner route cutover (5A-0-3b)

The iPhone review after PR #49 found that the deeper learner routes still
looked like an earlier Study Graph product. Graph, Kuzushiji lists and entity
details, and the learning record now use the shared Phase 5 shell, compact
headers, Japanese learner language, and editorial rows/sections. Graph's
learner-facing shell and presentation are complete for this slice; its graph
data model and advanced interaction behavior remain unchanged.

The cutover keeps the existing Graph query state, node/relation navigation,
Kuzushiji data readers, review history, and project deep links. It is a
presentation change only and does not introduce a new read path. Synthetic
adapter fallback data remains an internal availability fallback and is never
rendered as real learner data on these routes.

## Project workspace parity (5A-0-3c)

All active projects now open a Project Workspace from the 学ぶ tab. The shell
and mental model are shared, while each domain keeps its own sections: Art
History offers lectures, artists, artworks, movements, terms, periods,
culture, and museums; Philosophy offers lectures, philosophers, works, terms,
problems, periods, culture, and thought notes.

Kuzushiji remains the snapshot-backed special implementation, including its
Phase 4 cache, Objective mirror, review, and offline behavior. Art History and
Philosophy use the existing trusted Graph readers as read-only navigators.
Untrusted or demo Graph data fails closed, and neither workspace invents
progress or review state. Graph remains contextual at 「知識のつながり」.

The workspace routes do not change the Graph data model or introduce a new
read path; the remaining main-tab navigation/performance work is tracked in
Phase 5A-0-4 and its 5A-0-4b snapshot cutover slice.

## Preserved authority boundaries

This slice keeps Notion read-only, Git/archive content immutable, Supabase as
the authority for attempts, receipts, issued instances, and Objective state,
and IndexedDB/Cache Storage as replicas and outbox storage. It does not change
server grading, fresh Scope acceptance, request hashes, receipts, Objective
identity or epoch semantics, blocked automatic retry behavior, or offline
instance issuance.

## Current access policy (effective 2026-09-10)

Study Graph-native learning data and native reads/writes use no interactive
login. This includes Objective/SRS/review, snapshot distribution and sync,
receipts, and offline prefetch/replay. Native mutations still enforce
same-origin protection and all existing server-owned domain invariants.

Explicit authentication is reserved for future sensitive external-account or
private-data access and external-system writes, including a future Notion
write boundary. Notion remains read-only from the current Study Graph
runtime.

## Deferred work

The following are deliberately outside Phase 5A-0:

- GPT Content Gateway and its authentication/publication workflow
- LectureCompletionBundle integration
- Auto Publish policy implementation
- Consolidation Set persistence or new SRS semantics
- structural read-path/performance redesign beyond low-risk presentation work
- deeper Graph interaction and data-model redesign

## Shared project snapshot publishers (5A-0-4a-2)

Western Art History and Western Philosophy now have server-only publisher and
typed projection support behind the existing `ScopeKnowledgeSnapshot` storage
and publication RPCs. Their learner routes still use the current read-only
Graph readers; this slice does not cut over any route or UI.

Each publisher uses a strict, no-demo Notion source reader with complete data
source and relation-property pagination, deterministic projection ordering,
and a versioned projection decoder. Detailed relation completeness is stored
inside the hash-covered `knowledgeProjection`; the historical envelope's
`sourceEvidence` fields remain unchanged. Both projections explicitly use
`not-applicable-no-objective-v1` with an empty `scopeDecisions` array. That
marker grants no Scope or SRS authority.

No Production snapshot was published in this PR. No Objective/SRS capability,
immutable Review asset ingestion, or Notion write was added. Display/reference
media remains distinct from immutable Review assets. Initial Production
bootstrap is a separate Supervisor-approved operational step.

## Art/Philosophy snapshot read cutover (5A-0-4a-3)

Western Art History and Western Philosophy learner workspaces, lists, details,
and contextual Graph views now read the verified current `ProjectReadSnapshot`
through the server snapshot boundary. The flow validates the historical
`ScopeKnowledgeSnapshot` hash, adapts it to the neutral contract, strictly
decodes the project/version pair, and converts that same immutable observation
to learner Graph data. The old live Notion Graph readers remain only for
compatibility and are not a learner display fallback for these projects.

Ready and stale snapshots render real content; missing, unavailable, and
invalid candidates show a local unavailable region without inventing a zero
count or synthetic data. Art's neutral blank-title placeholders remain in the
immutable projection and are hidden only when they have no meaningful learner
metadata, preserving the previous learner behavior. Graph learning metrics are
shown only when the authoritative overlay is available; unavailable state is
shown as unknown.

Kuzushiji continues to use its existing snapshot, Objective mirror, review,
offline, and cache semantics. This cutover changes no Scope/SRS authority,
grading, receipts, attempts, request hashes, service-worker behavior, or
Notion write policy. Broader read-path performance work remains deferred to
Phase 5A-0-4.

## Kuzushiji learner snapshot read cutover (5A-0-4a-5)

Kuzushiji normal learner display now uses the verified `kuzushiji-v2`
ProjectReadSnapshot for its workspace, lists, details, contextual Graph, and
knowledge labels in Progress. Historical `kuzushiji-v1` observations remain
readable by the global decoder and existing browser cache so older devices can
continue to display their last verified copy; the normal shared learner runtime
requires v2 and never repairs an invalid observation from live Notion.

Review keeps its separate live Notion path and fresh Character-based Scope
calculation. Snapshot scope decisions remain observational and do not authorize
Objective/SRS work. This cutover adds no migration, snapshot publication,
IndexedDB or service-worker change, or learner-facing authority change.

## Shared foreground snapshot refresh (5A-0-4a-6)

Normal learner surfaces now share a bounded foreground refresh coordinator.
Each page renders its existing verified observation first; after hydration and
when the tab is visible, the client may send a POST foreground intent. Only a
stale current snapshot may invoke an existing project publisher. Manual refresh
can recover a missing snapshot and is protected by a short server cooldown;
the existing Supabase lease remains the global concurrency boundary.

Refresh failures, busy leases, missing observations, and validation blocks are
safe local statuses. They never replace the last-good content or expose
infrastructure details. A successful generic refresh revalidates the route;
Kuzushiji adopts through its existing hash-verified IndexedDB cache path.
The historical Kuzushiji sync endpoint remains a POST-only compatibility alias
to the same policy. Review/fresh Scope, Objective/SRS, offline authority,
Notion read-only behavior, and service-worker contracts are unchanged.

## Main-tab snapshot cutover and navigation baseline (5A-0-4b)

Before this slice, Home (`/`) and the Review landing page (`/review`) waited
for a live Notion dashboard before they could start their Supabase schedule
read. That serialized the first render behind the external curriculum read.
Now both pages start their verified Kuzushiji v2 display read and the
Supabase review-schedule read in parallel, then filter candidates only after
both observations are available.

Home (`/`) and the Review landing page (`/review`) now start their verified
Kuzushiji v2 display read and the Supabase review-schedule read in parallel.
The snapshot's `reviewQueue` remains a candidate/display set; due status and
the displayed due count come only from the authoritative schedule. If either
observation is unavailable, the learner sees an unknown or local unavailable
state rather than an authoritative zero. Stale snapshot content remains
visible while the existing foreground coordinator refreshes after hydration.

The focused Review session still uses its live Notion read and fresh Scope
calculation; this landing cutover does not change issuance, SRS, grading,
receipts, or acceptance authority. `/projects` remains registry-only. Core
main-tab/header links use read-only Next prefetch, localized loading boundaries
provide destination context, and CSS pressed states provide immediate tap
feedback. No persistent App Router shell or Graph bundle redesign was added;
those remain candidates for a later performance slice after iPhone measurement.
