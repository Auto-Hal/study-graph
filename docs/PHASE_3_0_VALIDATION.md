# Phase 3.0 Pre-merge Validation

Date: 2026-09-06

## Preview

- Latest code Preview reached READY after cross-project Review type isolation.
- Kuzushiji `/review?project=kuzushiji` returned HTTP 200 with real Notion data.
- Project selector contains Kuzushiji Scheduled / Western Art History Practice / Philosophy Practice.
- Preview has no Study Graph persistence secret, so persistence safely falls back and the client does not call the save API in fallback mode.

## Supabase migration

Applied only to Study Graph project `uhckdhdkywhsqjcquvyj`.

Before migration:

- `review_state`: 4 rows
- `review_attempts`: 4 rows
- kinds: character 3 / mistake 1

After migration:

- `review_state`: 4 rows
- `review_attempts`: 4 rows
- `knowledge` state: 0 rows
- item-kind constraints allow character / mistake / knowledge
- `study_graph_record_review` accepts knowledge
- anon execute remains enabled
- authenticated execute remains revoked

No existing learning row was modified or deleted.

## Remaining production validation

After CI + merge:

- validate Art History Practice against Production Notion data
- validate Philosophy Practice against Production Notion data
- validate Production persistence mode
- rollback smoke-test or first genuine user Practice for `knowledge`
- validate Graph learning overlay after a genuine knowledge grade
- confirm error/fatal runtime logs are empty
