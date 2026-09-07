# Phase 4C-3 instance and attempt boundary

Phase 4C-3 adds the persistence boundary for a fixed Phase 4C-1 Kuzushiji
revision. It does not cut over the Review UI, browser API, current queue, or
existing save path. The new private tables are an additive foundation for the
server route planned in Phase 4C-4.

## Fixed instance and server grading boundary

An `exercise_instances` row pins a learner to a release, revision, rendered
presentation hash, locale, scope evidence, and the existing legacy item and
exercise IDs. The composite release/revision foreign key requires the revision
to be an entry of the selected content release. Instances have no default ID:
only a future server issuance path can create them, so arbitrary client-created
instances are not accepted.

Client correctness is not authority. The future server route resolves
the archived revision and calls the pure `legacy-text-v1` grading boundary. It
uses the existing ReviewSession normalization contract (NFKC, trim, Japanese
lowercase, whitespace and punctuation removal) and the archived accepted
answers. Unsupported strategy/version or answer shape is `ungraded` with a
null correctness value; archive JSON is data and is never executed.

`is_correct` is stored separately from `self_evaluation` and
`effective_srs_grade`. A wrong answer can therefore coexist with a user-selected
`easy` grade, preserving the existing four-grade policy.

## Attempt identity and atomic persistence

`exercise_attempts` has one authoritative row per instance. The request hash
covers only the immutable submission fields (attempt ID, instance ID, raw
answer, self evaluation, response time, and hint flag) using the Phase 4C-1
canonical JSON/SHA-256 helper. Runtime timestamps are excluded.

The service-only `public.study_graph_record_exercise_attempt` function takes a
server grading result and SRS plan. It locks the instance, returns the stored
receipt without re-running grading/SRS for the same attempt ID and request
hash, returns `attempt_conflict` for a hash mismatch, and returns
`instance_already_answered` for a different attempt on an answered instance.

For a new attempt it takes deterministic transaction advisory locks for the
attempt ID and learner/project/legacy-item key, then locks the existing
`review_state` row with `FOR UPDATE`. This also serializes first-time reviews
where no state row exists. The legacy scheduler arithmetic is copied exactly:
Again is ten minutes with repetitions zero; Hard/Good/Easy use the existing
1.2/2.2/3.2 multipliers and initial 1/2/5 day intervals.

The function inserts the legacy `review_attempts` and `review_state` rows only
when the server plan says SRS is applicable. It then inserts the immutable
private attempt and receipt in the same transaction. A grader-unavailable,
scope-not-eligible, or revision-quarantined attempt is still preserved in the
private history as a no-SRS attempt with `srs_applied=false` and does not create legacy state-
advancing history.

## Security and rollback

Both new tables have RLS enabled, no browser table privileges, and the Phase
4C-2 immutable row trigger. The RPC is `SECURITY DEFINER`, fixes
`search_path=pg_catalog`, fully qualifies data objects, revokes execution from
`PUBLIC`, `anon`, `authenticated`, and `service_role` before granting it back
only to `service_role`. No browser can call this persistence path directly;
there is no authentication/session subsystem in this phase.

This migration does not alter existing public table definitions, existing RPCs,
RLS, Notion, Storage, or production data. To roll back 4C-3, stop any future
writer and remove the RPC, its two triggers, then `exercise_attempts` and
`exercise_instances` in dependency order. Leave the Phase 4C-2 immutable guard
and archive tables in place.

```sql
drop function if exists public.study_graph_record_exercise_attempt(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer, text,
  boolean, text, text, integer, boolean, boolean, boolean, text, text
);
drop trigger if exists exercise_attempts_immutable on private.exercise_attempts;
drop trigger if exists exercise_instances_immutable on private.exercise_instances;
drop table if exists private.exercise_attempts;
drop table if exists private.exercise_instances;
```

Phase 4C-4 will add server-side instance issuance, a fresh scope/revision
recheck, and browser API integration. Objective SRS, offline replay, and UI
cutover remain later work.
