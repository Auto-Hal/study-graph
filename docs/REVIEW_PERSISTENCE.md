# Review persistence — Phase 1.2

## Responsibility split

- **Notion** remains the source of truth for learning content and relations.
- **Supabase** stores high-frequency review attempts and scheduling state.
- **Study Graph / Vercel** is the only layer that combines both for the UI.
- Phase 1.2 performs **no Notion writes**.

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

## Security

The tables have RLS enabled and expose no direct `anon` or `authenticated` table permissions.

The app calls two `security definer` RPCs using:

1. the Supabase publishable key, held server-side in Vercel, and
2. a separate random `STUDY_GRAPH_APP_TOKEN`, also held server-side.

Only a SHA-256 hash of the app token is stored in `private.study_graph_config`.

The browser never receives the Supabase key or Study Graph app token. Browser grading requests go only to `/api/review/attempt` on the same Vercel origin.

## Required Vercel environment variables

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `STUDY_GRAPH_APP_TOKEN`

All three are server-only and must not use the `NEXT_PUBLIC_` prefix.

## Failure behavior

If Supabase is not configured or schedule reads fail, Study Graph falls back to the Notion-derived review queue so learning is never blocked. When a grade save fails, the review screen stays on the same question and asks the user to retry.
