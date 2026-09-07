begin;

-- Phase 4C-4 keeps the private archive private. These narrow, pilot-only
-- boundaries are called by a server-side service-role client; no browser role
-- receives table access or function execution rights.
create or replace function public.study_graph_register_kuzushiji_pilot_archive(
  p_release_id text,
  p_manifest_schema_version integer,
  p_manifest_hash text,
  p_manifest jsonb,
  p_source_git_sha text,
  p_project_id text,
  p_exercise_id text,
  p_exercise_version integer,
  p_content_hash text,
  p_canonicalization_version integer,
  p_canonical_payload text,
  p_payload jsonb,
  p_objective_id text
)
returns table(release_id text, revision_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_release_id text;
  v_revision_id uuid;
  v_existing_release private.content_releases%rowtype;
  v_existing_revision private.exercise_revisions%rowtype;
begin
  if p_project_id <> 'kuzushiji'
    or p_exercise_id <> 'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    or p_exercise_version <> 1 then
    raise exception using errcode = 'P0001', message = 'unsupported_pilot_revision';
  end if;
  if p_release_id is null or btrim(p_release_id) = ''
    or p_release_id <> p_manifest_hash
    or p_manifest_hash !~ '^[0-9a-f]{64}$'
    or p_content_hash is null
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_manifest_schema_version is null
    or p_manifest_schema_version <= 0
    or p_canonicalization_version is null
    or p_canonicalization_version <= 0
    or p_canonical_payload is null
    or p_payload is null
    or jsonb_typeof(p_manifest) <> 'object'
    or jsonb_typeof(p_payload) <> 'object'
    or p_source_git_sha is null
    or btrim(p_source_git_sha) = '' then
    raise exception using errcode = '22023', message = 'invalid_pilot_archive';
  end if;
  if p_payload #>> '{projectId}' <> p_project_id
    or p_payload #>> '{exerciseId}' <> p_exercise_id
    or (p_payload #>> '{exerciseVersion}')::integer <> p_exercise_version
    or p_payload #>> '{objectiveId}' <> p_objective_id then
    raise exception using errcode = 'P0001', message = 'revision_payload_identity_mismatch';
  end if;

  select cr.*
    into v_existing_release
  from private.content_releases cr
  where cr.release_id = p_release_id
     or cr.manifest_hash = p_manifest_hash
  for update;
  if found then
    if v_existing_release.release_id <> p_release_id
      or v_existing_release.manifest_schema_version <> p_manifest_schema_version
      or v_existing_release.manifest_hash <> p_manifest_hash
      or v_existing_release.manifest <> p_manifest then
      raise exception using errcode = 'P0001', message = 'archive_conflict';
    end if;
    v_release_id := v_existing_release.release_id;
  else
    insert into private.content_releases (
      release_id,
      manifest_schema_version,
      manifest_hash,
      manifest,
      source_git_sha
    ) values (
      p_release_id,
      p_manifest_schema_version,
      p_manifest_hash,
      p_manifest,
      p_source_git_sha
    ) returning private.content_releases.release_id into v_release_id;
  end if;

  select er.*
    into v_existing_revision
  from private.exercise_revisions er
  where er.project_id = p_project_id
    and er.exercise_id = p_exercise_id
    and er.exercise_version = p_exercise_version
  for update;
  if found then
    if v_existing_revision.content_hash <> p_content_hash
      or v_existing_revision.canonicalization_version <> p_canonicalization_version
      or v_existing_revision.canonical_payload <> p_canonical_payload
      or v_existing_revision.payload <> p_payload
      or v_existing_revision.objective_id is distinct from p_objective_id then
      raise exception using errcode = 'P0001', message = 'archive_conflict';
    end if;
    v_revision_id := v_existing_revision.revision_id;
  else
    insert into private.exercise_revisions (
      project_id,
      exercise_id,
      exercise_version,
      content_hash,
      canonicalization_version,
      canonical_payload,
      payload,
      objective_id
    ) values (
      p_project_id,
      p_exercise_id,
      p_exercise_version,
      p_content_hash,
      p_canonicalization_version,
      p_canonical_payload,
      p_payload,
      p_objective_id
    ) returning private.exercise_revisions.revision_id into v_revision_id;
  end if;

  insert into private.content_release_entries (release_id, revision_id)
  values (v_release_id, v_revision_id)
  on conflict (release_id, revision_id) do nothing;

  return query select v_release_id, v_revision_id;
end;
$$;

create or replace function public.study_graph_issue_kuzushiji_pilot_instance(
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
  p_srs_epoch text default null
)
returns table(instance_id uuid, release_id text, revision_id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instance_id uuid := extensions.gen_random_uuid();
  v_revision private.exercise_revisions%rowtype;
begin
  if p_learner_id is null or p_revision_id is null
    or p_release_id is null or btrim(p_release_id) = ''
    or p_presentation is null or jsonb_typeof(p_presentation) <> 'object'
    or p_presentation_hash is null or p_presentation_hash !~ '^[0-9a-f]{64}$'
    or p_locale is null or btrim(p_locale) = ''
    or p_scope_evidence is null or jsonb_typeof(p_scope_evidence) <> 'object'
    or p_legacy_item_id is null or btrim(p_legacy_item_id) = ''
    or p_legacy_exercise_id is null or btrim(p_legacy_exercise_id) = '' then
    raise exception using errcode = '22023', message = 'invalid_pilot_instance';
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
    'legacy-item',
    p_srs_epoch
  );

  return query select v_instance_id, p_release_id, p_revision_id;
end;
$$;

create or replace function public.study_graph_resolve_kuzushiji_pilot_instance(
  p_instance_id uuid,
  p_learner_id uuid
)
returns table(
  instance_id uuid,
  learner_id uuid,
  release_id text,
  revision_id uuid,
  presentation jsonb,
  presentation_hash text,
  renderer_version text,
  adapter_version text,
  locale text,
  scope_evidence jsonb,
  knowledge_binding jsonb,
  legacy_item_id text,
  legacy_item_kind text,
  legacy_exercise_id text,
  srs_target text,
  srs_epoch text,
  revision_payload jsonb,
  revision_status text,
  project_id text,
  exercise_id text,
  exercise_version integer,
  content_hash text
)
language sql
security definer
set search_path = pg_catalog
as $$
  select
    ei.instance_id,
    ei.learner_id,
    ei.release_id,
    ei.revision_id,
    ei.presentation,
    ei.presentation_hash,
    ei.renderer_version,
    ei.adapter_version,
    ei.locale,
    ei.scope_evidence,
    ei.knowledge_binding,
    ei.legacy_item_id,
    ei.legacy_item_kind,
    ei.legacy_exercise_id,
    ei.srs_target,
    ei.srs_epoch,
    er.payload,
    er.payload #>> '{status}',
    er.project_id,
    er.exercise_id,
    er.exercise_version,
    er.content_hash
  from private.exercise_instances ei
  join private.exercise_revisions er on er.revision_id = ei.revision_id
  where ei.instance_id = p_instance_id
    and ei.learner_id = p_learner_id
    and er.project_id = 'kuzushiji'
    and er.exercise_id = 'kuzushiji.visual-reading.eitaigura-u3042-00032-1';
$$;

create or replace function public.study_graph_get_kuzushiji_pilot_attempt_receipt(
  p_instance_id uuid,
  p_learner_id uuid
)
returns table(attempt_id uuid, request_hash text, receipt jsonb)
language sql
security definer
set search_path = pg_catalog
as $$
  select ea.attempt_id, ea.request_hash, ea.receipt
  from private.exercise_attempts ea
  join private.exercise_instances ei on ei.instance_id = ea.instance_id
  where ea.instance_id = p_instance_id
    and ei.learner_id = p_learner_id;
$$;

revoke all on function public.study_graph_register_kuzushiji_pilot_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_kuzushiji_pilot_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) to service_role;

revoke all on function public.study_graph_issue_kuzushiji_pilot_instance(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_issue_kuzushiji_pilot_instance(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb, text, text, text
) to service_role;

revoke all on function public.study_graph_resolve_kuzushiji_pilot_instance(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_resolve_kuzushiji_pilot_instance(uuid, uuid)
  to service_role;

revoke all on function public.study_graph_get_kuzushiji_pilot_attempt_receipt(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_get_kuzushiji_pilot_attempt_receipt(uuid, uuid)
  to service_role;

commit;
