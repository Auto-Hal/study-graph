begin;

-- Server-only learner-scoped observation. No instances, receipts, or locks.
-- SECURITY DEFINER is required because direct private-table SELECT remains
-- denied to service_role. The credential is kept on the Next server; public,
-- anon and authenticated do not gain an endpoint or table privilege.
create or replace function public.study_graph_objective_review_schedule(p_learner_id uuid)
returns table(project_id text, objective_id text, srs_epoch integer, due_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select ors.project_id, ors.objective_id, ors.srs_epoch, ors.due_at
  from private.objective_review_state ors
  where ors.learner_id = p_learner_id
    and ors.project_id in ('kuzushiji', 'philosophy', 'western-art-history')
  order by ors.project_id, ors.objective_id, ors.srs_epoch;
$$;

revoke all on function public.study_graph_objective_review_schedule(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_objective_review_schedule(uuid) to service_role;

commit;
