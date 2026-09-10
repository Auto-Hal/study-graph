# Phase 4C-5 — Operational hardening and rollback

## Scope

Phase 4C-5 hardens the already-merged Kuzushiji pilot runtime without changing its persistence model, scheduler semantics, archive schema, learner identity, or grading authority.

## Native no-login access

The current Study Graph runtime is a single-learner personal workspace. Native
reads and mutations do not require an interactive password session. Native
mutation routes retain same-origin checking and all existing server-owned
learner, instance, request-hash, grading, receipt, Scope, and SRS invariants.

The signed session cookie and `/login` compatibility routes remain dormant for
future sensitive external-account access or external-system writes. Study
Graph currently performs no Notion writes, so normal learner use does not ask
for a password. `STUDY_GRAPH_ACCESS_PASSWORD` is still server-only and is not
used as a prerequisite for native Review or snapshot access.

## Pilot issuance rollback switch

Environment variable:

`STUDY_GRAPH_PILOT_ISSUANCE_ENABLED`

Behavior:

- unset / empty: issuance enabled
- `false`, `0`, `off`, or `disabled`: issuance disabled

When disabled:

1. the Review registry does not issue new Kuzushiji pilot instances;
2. `POST /api/review/pilot/issue` returns `503 pilot_issuance_disabled`;
3. already-issued instances remain resolvable;
4. `POST /api/review/pilot/attempt` remains available;
5. same-attempt retry/idempotency and stored-receipt restoration remain available;
6. the pilot must not fall back to the legacy writer.

This is the Phase 4C rollback boundary: stop creating new work while preserving immutable history and the ability to finish or retry already-issued work.

## Rollback procedure

If the pilot runtime behaves unexpectedly in production:

1. Set `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` in the Vercel Production environment.
2. Redeploy the current production commit so the environment change is active.
3. Verify `/review` no longer issues a new Kuzushiji pilot card.
4. Do not delete archive, instance, attempt, `review_attempts`, or `review_state` rows.
5. Do not switch already-issued pilot instances to the legacy writer.
6. Existing attempt retries may continue through the 4C runtime.
7. After the cause is fixed and verified, remove the variable or set it to `true`, then redeploy.

## Data safety invariants

- No destructive migration is introduced in 4C-5.
- Existing immutable attempt rows are not updated.
- Existing review SRS rows are not rewritten by the rollback switch.
- Notion remains read-only.
- Browser code never receives the service role key, learner UUID, or access password.
- No Objective SRS, offline sync, or multi-user auth is introduced.

## Verification

Run:

- `pnpm run test:phase4c-5`
- `pnpm run test:phase4c-4`
- `pnpm run test:phase4c-3`
- `pnpm run test:phase4c-2`
- `pnpm run test:phase4c-1`
- `pnpm run test:pilot`
- `pnpm run test:phase4b`
- `npx tsc --noEmit`
- `pnpm run build`
- `git diff --check`

The Next.js middleware deprecation warning is non-blocking for Phase 4C-5 unless it becomes a runtime failure.
