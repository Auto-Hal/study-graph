# Review persistence — Phase 1.2–1.4

## Responsibility split

- **Notion** remains the source of truth for learning content and relations.
- **Supabase** stores high-frequency review attempts and scheduling state.
- **Study Graph / Vercel** is the only layer that combines both for the UI.
- Phase 1 performs **no Notion writes** from the review system.

## Tables

### `public.review_attempts`
Append-only history of each self-assessment.

- `item_id`: Notion page ID
- `item_kind`: `character` or `mistake`
- `grade`: `again`, `hard`, `good`, `easy`
- `previous_interval_days`
- `interval_days`
- `reviewed_at`
- `due_at`

### `public.review_state`
Current scheduling state per Notion item.

- `item_id` primary key
- `last_grade`
- `repetitions`
- `interval_days`
- `last_reviewed_at`
- `due_at`

## Scheduling policy

Phase 1.2 intentionally uses a small replaceable policy instead of coupling the app to a large scheduling library.

- `again`: 10 minutes
- `hard`: 1 day initially, then previous interval × 1.2
- `good`: 2 days initially, then previous interval × 2.2
- `easy`: 5 days initially, then previous interval × 3.2

This can later be replaced by FSRS without changing the Notion data model or the review UI contract.

## Server RPCs

All review-table access stays behind server-side RPCs. The browser never reads Supabase review tables directly.

- `study_graph_review_states`: current scheduling state
- `study_graph_record_review`: append one attempt and advance its schedule
- `study_graph_review_history`: recent append-only attempt history, limited to at most 100 rows per call

Each RPC validates the separate Study Graph app token before touching review data.

## Security

The public review tables have RLS enabled and expose no direct `anon` or `authenticated` table permissions. The private token-hash table also has RLS enabled with no public policies.

The app calls `security definer` RPCs using the Supabase publishable key plus a separate random `STUDY_GRAPH_APP_TOKEN`. RPC execution is limited to `anon`; `authenticated` execution is revoked because Study Graph does not use Supabase user authentication in Phase 1.

Only a SHA-256 hash of the app token is stored in `private.study_graph_config`.

The browser never receives the Study Graph app token. Browser grading requests go only to `/api/review/attempt` on the same Vercel origin. Progress/history pages are rendered server-side.

## Required Vercel environment variable

- `STUDY_GRAPH_APP_TOKEN`

This value is server-only and must not use the `NEXT_PUBLIC_` prefix.

The dedicated Study Graph Supabase project URL and publishable key are non-secret values and are built in as safe defaults. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` remain optional overrides for local or future migrations.

## Failure behavior

If Supabase is not configured or schedule reads fail, Study Graph falls back to the Notion-derived review queue so learning is never blocked. When a grade save fails, the review screen stays on the same question and asks the user to retry. Progress/history screens degrade to an empty, disconnected state instead of exposing or bypassing table security.
