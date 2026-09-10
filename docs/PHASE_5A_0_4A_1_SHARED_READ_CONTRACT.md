# Phase 5A-0-4a-1: shared project read contract foundation

This slice adds an application-layer read contract without changing the
Phase 4E storage contract. `ScopeKnowledgeSnapshot` remains the historical
database/type name and its canonical bytes, content hash, generation ordering,
IndexedDB adoption, and offline behavior are unchanged.

The neutral `ProjectReadSnapshot` adapter maps that storage shape to a common
Project Workspace read envelope. The envelope is a display and knowledge
observation model. `validUntil` is display freshness only, `generation` orders
observation adoption, and a browser replica is never Scope or SRS authority.
Fresh Scope acceptance, server grading, Objective state, receipts, and review
persistence remain on their existing server boundaries.

The envelope keeps the historical hash-covered `sourceEvidence` fields exactly
as they are. `relationCompleteness` is preserved evidence, not a claim that a
complete Graph relation crawl exists; richer project-specific completeness must
be added inside a future versioned projection.

Project and projection versions are dispatched explicitly. This slice supports
only `kuzushiji` + `kuzushiji-v1`; unknown projects, unsupported versions, and
malformed projections fail closed. Adding Art History or Philosophy requires a
new typed, versioned decoder and does not coerce an existing projection.

The shared read state distinguishes loading, ready, stale, verified local
replica, missing/not-yet-published, unavailable, invalid candidate, and
conflict. A ready observation may explicitly be authoritative-empty; missing
or unavailable is never converted into a fabricated zero count.

Project capability slots use four independent axes: semantic support, published
content availability, runtime availability, and device readiness. Capability
absence remains neutral and does not invent progress, review, or mastery.

This PR does not cut over learner routes, publish Art/Philosophy snapshots,
change live Notion reads, add migrations, change service-worker behavior, or
add media ingestion. Those decisions belong to later implementation slices.
