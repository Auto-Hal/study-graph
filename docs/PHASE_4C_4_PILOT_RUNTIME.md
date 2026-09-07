# Phase 4C-4 Kuzushiji pilot runtime

Phase 4C-4 connects only the curated exercise
`kuzushiji.visual-reading.eitaigura-u3042-00032-1` to the versioned runtime.
Western Art, Philosophy, generic graph exercises, mistake cards, demo/fallback
cards, and other Kuzushiji cards keep their existing ReviewSession path.

## Boundaries

The server resolves the Git-backed `kuzushijiPilotRevision` and
`kuzushijiPilotContentReleaseManifest`; the browser never supplies an exercise
definition, accepted answer, learner ID, grading result, scope result, or SRS
state. A fixed UUID from `STUDY_GRAPH_LEARNER_ID` is used server-side. The
service-role key is read only by `src/lib/supabase/pilot.ts` and is never
prefixed with `NEXT_PUBLIC_` or imported by a client component.

Before an eligible pilot card is shown, the server idempotently registers the
pilot archive through the service-only registration boundary and issues one
immutable `exercise_instances` row. The stored presentation contains the
prompt, front, and answer-free visual asset descriptor. The instance pins the
archive release, revision, legacy item ID, scope evidence, and legacy exercise
ID.

On submit, the server reloads the instance and archived revision, grades with
the allowlisted `legacy-text-v1` strategy, and obtains a fresh Notion scope
snapshot. An unavailable, unknown, or ineligible current scope records the
attempt without advancing legacy SRS. Quarantined revisions are also saved
without SRS; draft and retired revisions cannot issue new instances.

## Retry and authority contract

The client creates one UUID immediately before the first grade submission and
reuses that UUID and the same immutable request body for network retries. The
server computes the request hash. The 4C-3 atomic RPC returns the stored receipt
for the same attempt ID and request hash, rejects a changed body as
`attempt_conflict`, and rejects a second attempt for an instance as
`instance_already_answered` (the route restores the stored receipt when it is
available). Client `isCorrect`, normalized answers, scope flags, SRS fields,
and learner identity are never trusted.

`public.review_attempts` and `public.review_state` are written only by the
existing 4C-3 atomic RPC when the server plan says SRS is applicable. A saved
no-SRS attempt remains in `private.exercise_attempts` with an immutable receipt
and does not create legacy state-advancing history. The old
`/api/review/attempt` writer is used only by nonpilot cards; the pilot path does
not dual-write.

## Operational controls and rollback

Archive registration and instance issuance are server-only service-role RPCs;
private tables remain unavailable to browser roles. The pilot runtime fails
closed when service credentials, the fixed learner UUID, archive registration,
current scope, or instance issuance is unavailable. It never silently falls
back to the old writer.

To roll back, stop pilot instance issuance and disable the pilot route at the
server boundary before changing any UI selection. Preserve all archive,
instance, and attempt rows; immutable history is never deleted. The existing
nonpilot legacy writer remains available. A later phase may re-enable the
pilot only after the new writer is disabled and the issue/attempt boundary has
been reviewed.

This phase does not implement authentication, offline replay, cache/IndexedDB,
Objective SRS, server route cutover for other domains, or production archive
registration. Production Supabase application and deployment remain separate
supervisor actions.
