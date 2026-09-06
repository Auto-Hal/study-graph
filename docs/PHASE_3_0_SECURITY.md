# Phase 3.0 Review Persistence Safety

- Browser receives no Study Graph app token.
- Writes continue through the existing server API and token-gated Supabase SECURITY DEFINER RPC.
- Direct review-table access remains protected by RLS / revoked grants.
- `authenticated` cannot execute the write RPC; `anon` can enter it only with the separate server-side app token.
- Phase 3.0 widens only the allowed review item kind to include `knowledge`; scheduler behavior is unchanged.
- Preview/fallback sessions do not call the write API.
