# Phase 4D-5 — Objective SRS operations and rollback

Phase 4D-5 closes the pilot Objective SRS rollout with operational visibility and a rollback runbook. It does not change Objective semantics, scheduler arithmetic, learner identity, grading, Scope rules, or database schema.

## Production authority

For the curated Kuzushiji Eitaigura 「あ」 pilot, the active schedule authority is now:

`learner_id + kuzushiji + kuzushiji.a.eitaigura-u3042-00032-1.read + srs_epoch 1`

`public.review_state` is legacy history/state and must not be used to decide when this pilot is due. The Progress screen therefore labels legacy history explicitly and reads the active Objective state separately. A missing Objective state is the approved no-seed state: epoch 1 is uninitialized until the first accepted Objective attempt.

Objective SRS is a scheduling record, not proof of mastery. The displayed grade remains the learner's four-level self-evaluation and is separate from correctness.

## Normal operation

New pilot issuance is allowed only when all existing runtime gates pass:

1. same-origin Study Graph request (native learner access is no-login);
2. `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED` is not disabled;
3. Notion Scope source is ready and the character is eligible;
4. the immutable revision is issuable;
5. the Objective definition and revision binding register idempotently;
6. the Objective issuer atomically creates the exercise instance and instance attribution.

Attempts remain server graded. New Objective instances write only Objective SRS. Pre-cutover legacy instances, if any, retain their immutable target and remain retryable through the legacy attempt path. An attempt never advances both state systems.

## Immediate containment

If Objective issuance behaves unexpectedly:

1. Set `STUDY_GRAPH_PILOT_ISSUANCE_ENABLED=false` in Vercel Production.
2. Redeploy so the environment change is active.
3. Confirm new Kuzushiji pilot instances are no longer issued.
4. Leave the attempt endpoint available so already-issued attempts/retries can return their stored receipt.
5. Do not delete, edit, re-key, or backfill Objective definitions, bindings, instances, attempts, applications, or state.
6. Do not copy legacy `review_state` into Objective state during incident response.

This containment step is preferred over any database rollback.

## Application rollback

If containment is insufficient, redeploy the pre-cutover application commit `6f1d30a3c8006bbed440b66d3e79b42350ef69d4` only after issuance has been disabled. The Phase 4D-4 database migration is backward compatible with that runtime: the legacy issuer/RPC remains present and the widened `srs_target` constraint still accepts `legacy-item`.

Treat any legacy attempts accepted during a full application rollback as legacy-only history. They must not later be copied automatically into Objective epoch 1. When the Objective runtime is restored, its existing Objective state resumes unchanged.

Do not shrink the `srs_target` constraint while Objective instances exist, and do not drop the Phase 4D-2/4D-4 tables or RPCs as an operational rollback technique. Accepted immutable history must remain readable.

## Post-deploy checks

After an Objective runtime deployment, verify without creating synthetic learning attempts:

- GitHub CI and production Vercel deployment are successful;
- production runtime has no new fatal/error cluster;
- Supabase migration registry contains `phase_4d_4_objective_cutover`;
- the two 4D-4 RPCs remain service-role-only with fixed `search_path=pg_catalog`;
- legacy `review_state` / `review_attempts` row counts are not changed by deployment itself;
- Progress distinguishes active Objective state from legacy history;
- the next natural user attempt creates at most one Objective application/state transition and no legacy review row.

Do not create a fake production answer solely for smoke testing. Natural Review use is the first end-to-end persistence smoke test.

## Completion boundary

With 4D-5 complete, the pilot has an Objective definition, immutable binding, atomic instance attribution, Objective-keyed SRS persistence, no-seed legacy migration decision, active Objective queue authority, retry-safe receipts, fail-closed issuance, and an operational rollback path. Broader Objective equivalence, offline/stale Scope semantics, and multi-exercise scheduling remain future design work.
