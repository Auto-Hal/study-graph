# Phase 4A exercise record boundary

The Kuzushiji PR #27 pilot now has a curated ExerciseDefinition and a separate
versioned VisualAsset. The record is content-only: it does not import the UI,
Notion client, Supabase, or the review scheduler.

src/lib/review/exercises/kuzushiji-adapter.ts is the compatibility boundary.
It maps the stable definition to the existing ReviewCard, preserving the old
character-id-prefixed exercise identifier used by the current review payload.
The stable definition ID and its version are not written to the existing
Supabase tables in this phase.

The pilot mother character is explicitly legacy-approved from PR #27. It is
not marked as independently verified, and the adapter never replaces it with
the generic Notion Character mother value.

ContentRelease, ScopeSnapshot, Objective SRS, Storage migration, and server-side
grading remain future boundaries. They are deliberately not introduced here.
