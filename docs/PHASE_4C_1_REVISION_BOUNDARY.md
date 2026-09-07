# Phase 4C-1 revision boundary

Phase 4C-1 fixes the Phase 4A Kuzushiji pilot as a content revision without
changing the ReviewCard, queue, attempt API, SRS, Notion, or Supabase paths.

`ExerciseRevisionPayload` is the hashable content boundary. It copies the
ExerciseDefinition, resolves every referenced VisualAsset descriptor, and
keeps the pilot-specific mother-character annotation as structured metadata:
`阿`, `legacy-approved`, `PR #27`. It does not read or overwrite that value
from Notion Character metadata.

`canonicalizationVersion: 1` sorts object keys, preserves array order, keeps
strings unchanged, rejects undefined/non-finite/unsupported JSON values, and
hashes the explicit canonical UTF-8 string with SHA-256. The revision's
definition `status` is retained for display/validation but is operational
state and is excluded from `contentHash`; archive timestamps, Git SHA, release
ID, quarantine/retirement state, runtime scope, ExerciseInstance data, and
answer data are also outside the hash.

The stable revision identity is `projectId + exerciseId + exerciseVersion`.
The pure identity validator rejects a different hash for the same identity;
the pilot remains at `exerciseVersion: 1`.

`ContentReleaseManifest` records the available revision entries, pinned asset
references/checksums, grader strategy/version, and normalizer version. Entries
are sorted by `projectId + exerciseId + exerciseVersion` before canonicalizing,
so input enumeration order does not change the manifest. A manifest receives a
deterministic `manifestHash`; optional `sourceGitSha` is kept only as outer
provenance and is not a release ID. No database release ID is introduced in
4C-1.

The next phase may persist these records in Supabase. It must preserve the
explicit canonical strings and hashes rather than relying on implicit JSONB
serialization.
