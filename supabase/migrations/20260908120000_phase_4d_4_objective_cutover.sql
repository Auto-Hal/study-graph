begin;

-- Phase 4D-4 cuts only the curated Kuzushiji pilot over to Objective SRS.
-- Legacy instances remain valid and the legacy writer remains available for
-- already-issued pre-cutover instances; no legacy state is copied or reset.
alter table private.exercise_instances
  drop constraint exercise_instances_srs_target_check;
alter table private.exercise_instances
  add constraint exercise_instances_srs_target_check
  check (srs_target in ('legacy-item', 'objective'));

-- Issue the pilot instance and pin Objective attribution in one transaction.
-- Objective identity/evidence are resolved from the immutable revision binding,
-- never accepted from the browser or caller.
create or replace function public.study_graph_issue_kuzushiji_objective_pilot_instance(
  p_learner_id uuid,
  p_release_id text,
  p_revision_id uuid,
  p_presentation jsonb,
  p_presentation_hash text,
  p_renderer_version text,
  p_adapter_version text,
  p_locale text,
  p_scope_evidence jsonb,
  p_knowledge_binding jsonb,
  p_legacy_item_id text,
  p_legacy_exercise_id text,
  p_srs_epoch integer
)
returns table(instance_id uuid, release_id text, revision_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instance_id uuid := extensions.gen_random_uuid();
  v_revision private.exercise_revisions%rowtype;
  v_binding private.exercise_objective_bindings%rowtype;
begin
  if p_learner_id is null or p_revision_id is null
    or p_release_id is null or btrim(p_release_id) = ''
    or p_presentation is null or jsonb_typeof(p_presentation) <> 'object'
    or p_presentation_hash is null or p_presentation_hash !~ '^[0-9a-f]{64}$'
    or p_locale is null or btrim(p_locale) = ''
    or p_scope_evidence is null or jsonb_typeof(p_scope_evidence) <> 'object'
    or p_legacy_item_id is null or btrim(p_legacy_item_id) = ''
    or p_legacy_exercise_id is null or btrim(p_legacy_exercise_id) = ''
    or p_srs_epoch is null or p_srs_epoch <> 1 then
    raise exception using errcode = '22023', message = 'invalid_objective_pilot_instance';
  end if;

  select er.*
    into v_revision
  from private.content_release_entries cre
  join private.exercise_revisions er on er.revision_id = cre.revision_id
  where cre.release_id = p_release_id
    and cre.revision_id = p_revision_id
    and er.project_id = 'kuzushiji'
    and er.exercise_id = 'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    and er.exercise_version = 1
  for update of er;
  if not found then
    raise exception using errcode = 'P0001', message = 'pilot_archive_not_registered';
  end if;
  if v_revision.payload #>> '{status}' in ('draft', 'retired') then
    raise exception using errcode = 'P0001', message = 'revision_not_issuable';
  end if;

  select eob.*
    into v_binding
  from private.exercise_objective_bindings eob
  where eob.revision_id = p_revision_id
    and eob.project_id = 'kuzushiji'
    and eob.objective_id = 'kuzushiji.a.eitaigura-u3042-00032-1.read'
    and eob.objective_version = 1
    and eob.evidence_use = 'srs'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'pilot_objective_binding_not_registered';
  end if;

  insert into private.exercise_instances (
    instance_id,
    learner_id,
    release_id,
    revision_id,
    presentation,
    presentation_hash,
    renderer_version,
    adapter_version,
    locale,
    scope_evidence,
    knowledge_binding,
    legacy_item_id,
    legacy_item_kind,
    legacy_exercise_id,
    srs_target,
    srs_epoch
  ) values (
    v_instance_id,
    p_learner_id,
    p_release_id,
    p_revision_id,
    p_presentation,
    p_presentation_hash,
    p_renderer_version,
    p_adapter_version,
    p_locale,
    p_scope_evidence,
    p_knowledge_binding,
    p_legacy_item_id,
    'character',
    p_legacy_exercise_id,
    'objective',
    p_srs_epoch::text
  );

  insert into private.instance_objective_bindings (
    instance_id,
    project_id,
    objective_id,
    objective_version,
    srs_epoch,
    evidence_use
  ) values (
    v_instance_id,
    v_binding.project_id,
    v_binding.objective_id,
    v_binding.objective_version,
    p_srs_epoch,
    v_binding.evidence_use
  );

  return query select v_instance_id, p_release_id, p_revision_id;
end;
$$;

-- Pilot queue scheduling reads only the active Objective epoch. Absence means
-- the user-approved no-seed cutover starts this Objective uninitialized.
create or replace function public.study_graph_get_kuzushiji_pilot_objective_state(
  p_learner_id uuid
)
returns table(
  learner_id uuid,
  project_id text,
  objective_id text,
  srs_epoch integer,
  last_grade text,
  repetitions integer,
  interval_days integer,
  last_reviewed_at timestamptz,
  due_at timestamptz,
  scheduler_version text,
  state_revision bigint
)
language sql
security definer
set search_path = pg_catalog
as $$
  select
    ors.learner_id,
    ors.project_id,
    ors.objective_id,
    ors.srs_epoch,
    ors.last_grade,
    ors.repetitions,
    ors.interval_days,
    ors.last_reviewed_at,
    ors.due_at,
    ors.scheduler_version,
    ors.state_revision
  from private.objective_review_state ors
  where ors.learner_id = p_learner_id
    and ors.project_id = 'kuzushiji'
    and ors.objective_id = 'kuzushiji.a.eitaigura-u3042-00032-1.read'
    and ors.srs_epoch = 1;
$$;

revoke all on function public.study_graph_issue_kuzushiji_objective_pilot_instance(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_issue_kuzushiji_objective_pilot_instance(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb, text, text, integer
) to service_role;

revoke all on function public.study_graph_get_kuzushiji_pilot_objective_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_get_kuzushiji_pilot_objective_state(uuid)
  to service_role;

commit;
