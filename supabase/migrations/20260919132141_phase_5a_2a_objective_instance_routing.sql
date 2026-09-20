begin;

-- Read persisted immutable attribution only. Missing/foreign/unbound instances
-- return no row; the runtime must never interpret that as historical v1.
create function public.study_graph_resolve_objective_instance_routing(
  p_instance_id uuid,
  p_learner_id uuid
)
returns table (
  instance_id uuid,
  project_id text,
  objective_id text,
  objective_version integer,
  srs_epoch integer,
  evidence_use text,
  scheduling_context_version integer,
  opportunity_kind text,
  expected_state_revision bigint,
  grade_policy_version text,
  activation_policy_version text,
  issued_at timestamptz,
  expires_at timestamptz,
  due_at_observed timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select iob.instance_id, iob.project_id, iob.objective_id,
    iob.objective_version, iob.srs_epoch, iob.evidence_use,
    iob.scheduling_context_version, iob.opportunity_kind,
    iob.expected_state_revision, iob.grade_policy_version,
    iob.activation_policy_version, iob.issued_at, iob.expires_at,
    iob.due_at_observed
  from private.exercise_instances ei
  join private.instance_objective_bindings iob on iob.instance_id = ei.instance_id
  where ei.instance_id = p_instance_id
    and ei.learner_id = p_learner_id;
$$;

revoke execute on function public.study_graph_resolve_objective_instance_routing(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_resolve_objective_instance_routing(uuid, uuid)
  to service_role;

commit;
