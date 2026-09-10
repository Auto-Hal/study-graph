# Phase 5A-0-4a-2: Art/Philosophy snapshot publishers

This slice adds server-only publisher/model support for Western Art History
(`western-art-history-v1`) and Western Philosophy (`philosophy-v1`). Strict
Notion readers complete every declared data-source and relation-property page,
reject malformed or partial responses, and emit deterministic typed
projections. The projections are wrapped in the existing
`ScopeKnowledgeSnapshot` envelope and published only through the existing
snapshot RPC lifecycle.

The historical storage name and Phase 4E canonical hash contract remain
unchanged. Detailed completeness evidence lives inside the versioned,
hash-covered projection; `sourceEvidence` keeps its three historical fields.
Both projects use `not-applicable-no-objective-v1` with an empty
`scopeDecisions` array. This marker grants no Scope or SRS authority.

Learner routes still use the existing read-only Graph readers in this PR. No
Production snapshot was published, no Objective/SRS capability or immutable
Review asset was created, and Notion remains read-only. Display/reference media
is distinct from a checksum-verified Review asset. Production bootstrap is a
separate Supervisor-approved operation.
