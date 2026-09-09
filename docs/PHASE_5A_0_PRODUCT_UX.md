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

## Preserved authority boundaries

This slice keeps Notion read-only, Git/archive content immutable, Supabase as
the authority for attempts, receipts, issued instances, and Objective state,
and IndexedDB/Cache Storage as replicas and outbox storage. It does not change
server grading, fresh Scope acceptance, request hashes, receipts, Objective
identity or epoch semantics, blocked automatic retry behavior, or offline
instance issuance.

## Deferred work

The following are deliberately outside Phase 5A-0:

- GPT Content Gateway and its authentication/publication workflow
- LectureCompletionBundle integration
- Auto Publish policy implementation
- Consolidation Set persistence or new SRS semantics
- structural read-path/performance redesign beyond low-risk presentation work
- Graph visual redesign
