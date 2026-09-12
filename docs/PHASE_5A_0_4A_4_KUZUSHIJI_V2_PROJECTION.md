# Phase 5A-0-4a-4: Kuzushiji v2 hashed knowledge projection

This slice adds the versioned `kuzushiji-v2` knowledge observation needed for
a later learner read-path cutover. The historical `kuzushiji-v1` projection,
generation-1 snapshot, and all existing cache/adoption behavior remain
supported and unchanged.

## Projection and source boundary

The v2 projection contains the five fully paginated source collections
(`lectures`, `characters`, `mistakes`, `sources`, and `expressions`), the
existing review queue, six directional relations, and hash-covered
completeness evidence. Every relation property is read through the strict
Notion property-item endpoint, including all property-level pagination. A
missing or cyclic cursor, malformed property ID, duplicate page/relation, or
unresolved target fails the source read closed. There is no demo or partial
result fallback.

The six relation identities retain the existing direction and labels. Their
identity is `${sourceEntityId}:${targetEntityId}:${relationKind}`. The
projection and completeness arrays are canonically ordered before the existing
`ScopeKnowledgeSnapshot` hash is calculated, so response ordering does not
change the observation or its `contentHash`.

The outer historical `sourceEvidence` remains exactly
`sourceIdentifiers`, `paginationComplete`, and `relationCompleteness`.
Per-source and per-relation-property details live in the versioned,
hash-covered `knowledgeProjection.completeness` object. The v2 projection uses
the existing `phase4b-v1` Character-only Scope policy; its added sources and
relations create no new Scope decisions and no Objective/SRS authority.

## Runtime and publication boundary

`syncKuzushijiScopeKnowledgeSnapshot()` now selects the v2 source and builder
for a future successful publish. This PR does not call the publisher, publish
Production data, rewrite generation 1, or change any learner route. The
existing review queue business rule is reused without changing Review/SRS
semantics.

The strict v2 decoder is an explicit `kuzushiji` + `kuzushiji-v2` dispatch
branch. Unknown fields, malformed scalars, duplicate IDs, mismatched
relations, incomplete evidence, and unresolved targets are rejected before a
snapshot can be trusted. A v2 snapshot can be adapted to the neutral
`ProjectReadSnapshot` contract and round-tripped to the historical model with
the same canonical semantic content and hash.

No learner route/UI cutover is included; that work is reserved for the later
Kuzushiji read-path slice. No Supabase migration, snapshot publication, Notion
write, service-worker change, or Objective/SRS/Scope semantic change is part of
this implementation.
