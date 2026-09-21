begin;

-- Phase 5A fix: qualify the archive entry conflict target without changing
-- the registrar's public contract or archive semantics.
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
  on conflict on constraint content_release_entries_pkey do nothing;

  return query select v_release_id, v_revision_id;
end;
$$;

revoke all on function public.study_graph_register_kuzushiji_pilot_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_kuzushiji_pilot_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) to service_role;

commit;
