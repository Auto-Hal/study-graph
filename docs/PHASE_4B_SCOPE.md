# Phase 4B scope and eligibility

Phase 4B separates Notion records from the range that may be reviewed. Scope
is evaluated as a pure in-memory ScopeSnapshot with three states:
eligible, ineligible, and unknown. Only eligible nodes can reach the
generator; unknown always fails closed.

Kuzushiji maps 未学習 to ineligible, 学習中 / 読める / 即読 to
eligible, and blank or unsupported mastery values to unknown. This means
学習中 is reviewable practice scope, not mastery. Existing queue filtering,
including its 即読 behavior, remains unchanged. The Phase 4A あ visual
pilot keeps its curated 阿 metadata.

Philosophy uses 受講済 and 復習済 lecture records as completion anchors.
Only knowledge nodes directly related from such an anchor are eligible.
未受講 does not unlock its relations, and unsupported lecture states are
unknown.

Western Art treats the regular lecture database as the completed-record
authority. A valid lecture date on or before the evaluated Asia/Tokyo calendar
date is an eligible anchor; a future date is ineligible, while missing or
invalid dates are unknown. Only direct lecture relations to artwork, artist,
movement, term, period, culture, or museum nodes can unlock scope.

Demo data, fetch failures, incomplete pagination, and absent scope evidence do
not unlock review. The graph display may still use its existing demo fallback,
but the Review registry bypasses the graph cache and requires ready scope
evidence.

The generic relation builder and the unconditional recall fallback are not
used for normal Review. A candidate must pass the pure quality checks for
scope, visible answer leakage, unique four-choice options, eligible choices,
and required visual assets. If no candidate passes, the session returns fewer
cards rather than inventing a fallback. Existing ReviewCard identifiers,
grading, attempt payloads, SRS state, and persistence are unchanged.

Scope snapshots and quality reports are not persisted in this phase. Notion
remains read-only; no Supabase, Storage, image asset, runtime AI, or Objective
SRS changes are introduced.
