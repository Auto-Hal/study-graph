begin;

-- Phase 4E-5 records only server-issued offline prefetch mappings.  The
-- existing instance, attempt, Objective, and legacy history tables remain
-- untouched; no backfill is performed.
create table private.offline_instance_issuance_requests (
  request_id uuid primary key,
  learner_id uuid not null,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  device_id uuid not null,
  instance_id uuid not null,
  snapshot_id uuid,
  snapshot_generation bigint
    check (snapshot_generation is null or snapshot_generation > 0),
  -- The response payload is part of the immutable request mapping.  Keeping
  -- it here makes a lost-response retry return the same server-issued
  -- descriptor/feedback instead of echoing fresh caller input.
  assets jsonb not null
    check (jsonb_typeof(assets) = 'array'),
  feedback jsonb not null
    check (jsonb_typeof(feedback) = 'object'),
  created_at timestamptz not null default now(),
  constraint offline_instance_issuance_requests_instance_fk
    foreign key (instance_id)
    references private.exercise_instances (instance_id)
    on update restrict
    on delete restrict,
  constraint offline_instance_issuance_requests_snapshot_fk
    foreign key (snapshot_id)
    references private.scope_knowledge_snapshots (snapshot_id)
    on update restrict
    on delete restrict
);

create index offline_instance_issuance_requests_learner_project_device_idx
  on private.offline_instance_issuance_requests (learner_id, project_id, device_id, created_at);
create index offline_instance_issuance_requests_instance_id_idx
  on private.offline_instance_issuance_requests (instance_id);

create trigger offline_instance_issuance_requests_immutable
before update or delete on private.offline_instance_issuance_requests
for each row execute function private.study_graph_archive_row_is_immutable();

alter table private.offline_instance_issuance_requests enable row level security;
revoke all on table private.offline_instance_issuance_requests from public, anon, authenticated, service_role;

-- Register the measured v2 pilot archive.  The Node canonicalization and
-- content hashes are supplied by the server; Postgres stores them verbatim.
create or replace function public.study_graph_register_kuzushiji_pilot_v2_archive(
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
  v_release private.content_releases%rowtype;
  v_revision private.exercise_revisions%rowtype;
begin
  if p_project_id is distinct from 'kuzushiji'
    or p_exercise_id is distinct from 'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    or p_exercise_version is distinct from 2
    or p_objective_id is distinct from 'kuzushiji.a.eitaigura-u3042-00032-1.read' then
    raise exception using errcode = 'P0001', message = 'unsupported_pilot_revision_v2';
  end if;
  if p_release_id is null or btrim(p_release_id) = ''
    or p_release_id <> p_manifest_hash
    or p_manifest_hash !~ '^[0-9a-f]{64}$'
    or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_manifest_schema_version is null or p_manifest_schema_version <= 0
    or p_canonicalization_version is null or p_canonicalization_version <= 0
    or p_canonical_payload is null or length(p_canonical_payload) = 0
    or p_manifest is null or jsonb_typeof(p_manifest) <> 'object'
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_source_git_sha is null or btrim(p_source_git_sha) = '' then
    raise exception using errcode = '22023', message = 'invalid_pilot_archive_v2';
  end if;
  if p_payload #>> '{projectId}' is distinct from p_project_id
    or p_payload #>> '{exerciseId}' is distinct from p_exercise_id
    or p_payload #>> '{exerciseVersion}' is distinct from p_exercise_version::text
    or p_payload #>> '{objectiveId}' is distinct from p_objective_id then
    raise exception using errcode = 'P0001', message = 'revision_payload_identity_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'kuzushiji-pilot-v2-archive|' || p_project_id || '|' || p_exercise_id,
    0
  ));

  select cr.*
    into v_release
  from private.content_releases as cr
  where cr.release_id = p_release_id
     or cr.manifest_hash = p_manifest_hash
  for update;
  if found then
    if v_release.release_id <> p_release_id
      or v_release.manifest_schema_version <> p_manifest_schema_version
      or v_release.manifest_hash <> p_manifest_hash
      or v_release.manifest <> p_manifest then
      raise exception using errcode = 'P0001', message = 'archive_conflict';
    end if;
  else
    insert into private.content_releases (
      release_id, manifest_schema_version, manifest_hash, manifest, source_git_sha
    ) values (
      p_release_id, p_manifest_schema_version, p_manifest_hash, p_manifest, p_source_git_sha
    );
    select cr.* into v_release
    from private.content_releases as cr
    where cr.release_id = p_release_id;
  end if;

  select er.*
    into v_revision
  from private.exercise_revisions as er
  where er.project_id = p_project_id
    and er.exercise_id = p_exercise_id
    and er.exercise_version = p_exercise_version
  for update;
  if found then
    if v_revision.content_hash <> p_content_hash
      or v_revision.canonicalization_version <> p_canonicalization_version
      or v_revision.canonical_payload <> p_canonical_payload
      or v_revision.payload <> p_payload
      or v_revision.objective_id is distinct from p_objective_id then
      raise exception using errcode = 'P0001', message = 'archive_conflict';
    end if;
  else
    insert into private.exercise_revisions (
      project_id, exercise_id, exercise_version, content_hash,
      canonicalization_version, canonical_payload, payload, objective_id
    ) values (
      p_project_id, p_exercise_id, p_exercise_version, p_content_hash,
      p_canonicalization_version, p_canonical_payload, p_payload, p_objective_id
    );
    select er.* into v_revision
    from private.exercise_revisions as er
    where er.project_id = p_project_id
      and er.exercise_id = p_exercise_id
      and er.exercise_version = p_exercise_version;
  end if;

  insert into private.content_release_entries (release_id, revision_id)
  values (v_release.release_id, v_revision.revision_id)
  on conflict on constraint content_release_entries_pkey do nothing;

  return query select v_release.release_id, v_revision.revision_id;
end;
$$;

-- Issue or reuse one server-owned v2 instance per device.  The browser sends
-- only request/device IDs; all content and Objective fields are supplied by a
-- server-only caller and checked against the immutable archive/binding.
create or replace function public.study_graph_prefetch_kuzushiji_objective_instance(
  p_request_id uuid,
  p_learner_id uuid,
  p_project_id text,
  p_device_id uuid,
  p_release_id text,
  p_revision_id uuid,
  p_snapshot_id uuid,
  p_snapshot_generation bigint,
  p_presentation jsonb,
  p_presentation_hash text,
  p_scope_evidence jsonb,
  p_legacy_item_id text,
  p_legacy_exercise_id text,
  p_assets jsonb,
  p_feedback jsonb,
  p_srs_epoch integer,
  p_new_issuance_allowed boolean
)
returns table(
  request_id uuid,
  instance_id uuid,
  learner_id uuid,
  project_id text,
  release_id text,
  revision_id uuid,
  presentation jsonb,
  presentation_hash text,
  issued_at timestamptz,
  scope_evidence jsonb,
  snapshot_id uuid,
  snapshot_generation bigint,
  objective_id text,
  objective_version integer,
  srs_epoch integer,
  evidence_use text,
  legacy_item_id text,
  legacy_exercise_id text,
  assets jsonb,
  feedback jsonb,
  device_id uuid,
  prefetched_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_request private.offline_instance_issuance_requests%rowtype;
  v_instance private.exercise_instances%rowtype;
  v_revision private.exercise_revisions%rowtype;
  v_exercise_binding private.exercise_objective_bindings%rowtype;
  v_instance_binding private.instance_objective_bindings%rowtype;
  v_snapshot private.scope_knowledge_snapshots%rowtype;
  v_now timestamptz := clock_timestamp();
  v_instance_id uuid;
begin
  -- Request identity is the only input needed to recover an already-issued
  -- mapping.  The content/snapshot arguments are deliberately validated only
  -- on the new-instance branch below so a lost-response retry remains
  -- idempotent after the current snapshot has changed or disappeared.
  if p_request_id is null or p_learner_id is null or p_device_id is null
    or p_project_id is distinct from 'kuzushiji'
    or p_legacy_exercise_id is not null
       and p_legacy_exercise_id is distinct from 'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    or p_srs_epoch is distinct from 1 then
    raise exception using errcode = '22023', message = 'invalid_offline_prefetch_request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'offline-prefetch|' || p_project_id || '|' || p_learner_id::text || '|' || p_device_id::text,
    0
  ));

  -- First resolve the request itself. A request ID is an immutable mapping;
  -- ownership mismatches are never silently remapped.  This branch precedes
  -- all current snapshot/archive checks so it is a true stored-response retry.
  select r.*
    into v_request
  from private.offline_instance_issuance_requests as r
  where r.request_id = p_request_id
  for update;
  if found then
    if v_request.learner_id <> p_learner_id
      or v_request.project_id <> p_project_id
      or v_request.device_id <> p_device_id then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    select ei.*
      into v_instance
    from private.exercise_instances as ei
    where ei.instance_id = v_request.instance_id
      for update;
    if not found
      or v_instance.learner_id <> p_learner_id
      or v_instance.legacy_exercise_id is distinct from 'kuzushiji.visual-reading.eitaigura-u3042-00032-1' then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    select iob.*
      into v_instance_binding
    from private.instance_objective_bindings as iob
    where iob.instance_id = v_instance.instance_id
      and iob.project_id = 'kuzushiji'
      and iob.objective_id = 'kuzushiji.a.eitaigura-u3042-00032-1.read'
      and iob.objective_version = 1
      and iob.srs_epoch = 1
      and iob.evidence_use = 'srs'
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    return query select
      p_request_id,
      v_instance.instance_id,
      v_instance.learner_id,
      p_project_id,
      v_instance.release_id,
      v_instance.revision_id,
      v_instance.presentation,
      v_instance.presentation_hash,
      v_instance.issued_at,
      v_instance.scope_evidence,
      v_request.snapshot_id,
      v_request.snapshot_generation,
      v_instance_binding.objective_id,
      v_instance_binding.objective_version,
      v_instance_binding.srs_epoch,
      v_instance_binding.evidence_use,
      v_instance.legacy_item_id,
      v_instance.legacy_exercise_id,
      v_request.assets,
      v_request.feedback,
      p_device_id,
      v_request.created_at;
    return;
  end if;

  -- A genuinely new request must carry the server-resolved v2 archive,
  -- complete current snapshot evidence, and the exact pilot Scope anchor.
  -- This validation is deliberately before same-device reuse: an old
  -- unaccepted instance is not re-delivered after the current curriculum has
  -- explicitly excluded the pilot subject.
  if p_release_id is null or btrim(p_release_id) = ''
    or p_revision_id is null
    or p_snapshot_id is null or p_snapshot_generation is null or p_snapshot_generation <= 0
    or p_presentation is null or jsonb_typeof(p_presentation) <> 'object'
    or p_presentation_hash is null or p_presentation_hash !~ '^[0-9a-f]{64}$'
    or p_scope_evidence is null or jsonb_typeof(p_scope_evidence) <> 'object'
    or p_assets is null or jsonb_typeof(p_assets) <> 'array'
    or p_feedback is null or jsonb_typeof(p_feedback) <> 'object'
    or p_legacy_item_id is distinct from '3ccd2793-4134-815f-95f0-cc64dcdb86c7'
    or p_legacy_exercise_id is null or length(btrim(p_legacy_exercise_id)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_offline_prefetch_request';
  end if;

  select er.*
    into v_revision
  from private.content_release_entries as cre
  join private.exercise_revisions as er
    on er.revision_id = cre.revision_id
  where cre.release_id = p_release_id
    and cre.revision_id = p_revision_id
    and er.project_id = 'kuzushiji'
    and er.exercise_id = 'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    and er.exercise_version = 2
  for update of er;
  if not found then
    raise exception using errcode = 'P0001', message = 'pilot_archive_not_registered';
  end if;
  if v_revision.payload #>> '{status}' is distinct from 'approved' then
    raise exception using errcode = 'P0001', message = 'revision_not_issuable';
  end if;

  select eob.*
    into v_exercise_binding
  from private.exercise_objective_bindings as eob
  where eob.revision_id = p_revision_id
    and eob.project_id = 'kuzushiji'
    and eob.objective_id = 'kuzushiji.a.eitaigura-u3042-00032-1.read'
    and eob.objective_version = 1
    and eob.evidence_use = 'srs'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'pilot_objective_binding_not_registered';
  end if;

  -- A new prefetch uses only the server current snapshot. It is issuance
  -- evidence, never the fresh Scope authority used by first attempt
  -- acceptance. Same-request recovery above deliberately bypasses this gate.
  select s.*
    into v_snapshot
  from private.project_snapshot_sync_state as st
  join private.scope_knowledge_snapshots as s
    on s.snapshot_id = st.current_snapshot_id
  where st.project_id = p_project_id
  for update of st;
  if not found
    or v_snapshot.snapshot_id <> p_snapshot_id
    or v_snapshot.generation <> p_snapshot_generation
    or (v_snapshot.source_evidence ->> 'paginationComplete') is distinct from 'true'
    or (v_snapshot.source_evidence ->> 'relationCompleteness') is distinct from 'true'
    or (p_scope_evidence ->> 'authority') is distinct from 'server-issuance'
    or (p_scope_evidence ->> 'complete') is distinct from 'true'
    or (p_scope_evidence ->> 'status') is distinct from 'eligible'
    or (p_scope_evidence ->> 'snapshotId') is distinct from p_snapshot_id::text
    or not exists (
      select 1
      from jsonb_array_elements(v_snapshot.scope_decisions) as decision
      where decision ->> 'subjectId' = '3ccd2793-4134-815f-95f0-cc64dcdb86c7'
        and decision ->> 'status' = 'eligible'
    ) then
    raise exception using errcode = 'P0001', message = 'pilot_scope_not_eligible';
  end if;

  -- Reuse the oldest still-unaccepted prefetch for this device only after the
  -- current exact-anchor Scope gate above. The accepted attempt table is the
  -- authority; local state and caller-provided flags are ignored. The
  -- instance is locked and rechecked after selection so an attempt committed
  -- concurrently cannot be mapped to by a second issuance request.
  loop
    select r.*
      into v_request
    from private.offline_instance_issuance_requests as r
    where r.learner_id = p_learner_id
      and r.project_id = p_project_id
      and r.device_id = p_device_id
      and not exists (
        select 1
        from private.exercise_attempts as ea
        where ea.instance_id = r.instance_id
      )
    order by r.created_at asc
    limit 1
    for update of r;
    if not found then
      exit;
    end if;

    select ei.*
      into v_instance
    from private.exercise_instances as ei
    where ei.instance_id = v_request.instance_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    if exists (
      select 1
      from private.exercise_attempts as ea
      where ea.instance_id = v_instance.instance_id
    ) then
      continue;
    end if;

    select iob.*
      into v_instance_binding
    from private.instance_objective_bindings as iob
    where iob.instance_id = v_instance.instance_id
      and iob.project_id = 'kuzushiji'
      and iob.objective_id = 'kuzushiji.a.eitaigura-u3042-00032-1.read'
      and iob.objective_version = 1
      and iob.srs_epoch = 1
      and iob.evidence_use = 'srs'
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;

    insert into private.offline_instance_issuance_requests (
      request_id, learner_id, project_id, device_id, instance_id,
      snapshot_id, snapshot_generation, assets, feedback
    ) values (
      p_request_id, p_learner_id, p_project_id, p_device_id, v_instance.instance_id,
      v_request.snapshot_id, v_request.snapshot_generation,
      v_request.assets, v_request.feedback
    );
    return query select
      p_request_id,
      v_instance.instance_id,
      v_instance.learner_id,
      v_request.project_id,
      v_instance.release_id,
      v_instance.revision_id,
      v_instance.presentation,
      v_instance.presentation_hash,
      v_instance.issued_at,
      v_instance.scope_evidence,
      v_request.snapshot_id,
      v_request.snapshot_generation,
      v_instance_binding.objective_id,
      v_instance_binding.objective_version,
      v_instance_binding.srs_epoch,
      v_instance_binding.evidence_use,
      v_instance.legacy_item_id,
      v_instance.legacy_exercise_id,
      v_request.assets,
      v_request.feedback,
      p_device_id,
      v_now;
    return;
  end loop;

  -- A disabled kill switch stops only a genuinely new instance. Historical
  -- request recovery and same-device reuse above remain available.
  if coalesce(p_new_issuance_allowed, false) is not true then
    raise exception using errcode = 'P0001', message = 'pilot_issuance_disabled';
  end if;

  v_instance_id := extensions.gen_random_uuid();
  insert into private.exercise_instances (
    instance_id, learner_id, release_id, revision_id, presentation,
    presentation_hash, renderer_version, adapter_version, locale,
    scope_evidence, knowledge_binding, legacy_item_id, legacy_item_kind,
    legacy_exercise_id, srs_target, srs_epoch
  ) values (
    v_instance_id, p_learner_id, p_release_id, p_revision_id, p_presentation,
    p_presentation_hash, null, null, 'ja-JP', p_scope_evidence, null,
    p_legacy_item_id, 'character', p_legacy_exercise_id, 'objective',
    p_srs_epoch::text
  );

  insert into private.instance_objective_bindings (
    instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use
  ) values (
    v_instance_id, v_exercise_binding.project_id, v_exercise_binding.objective_id,
    v_exercise_binding.objective_version, p_srs_epoch, v_exercise_binding.evidence_use
  );

  insert into private.offline_instance_issuance_requests (
    request_id, learner_id, project_id, device_id, instance_id,
    snapshot_id, snapshot_generation, assets, feedback
  ) values (
    p_request_id, p_learner_id, p_project_id, p_device_id, v_instance_id,
    p_snapshot_id, p_snapshot_generation, p_assets, p_feedback
  );

  select ei.*
    into v_instance
  from private.exercise_instances as ei
  where ei.instance_id = v_instance_id;
  return query select
    p_request_id,
    v_instance.instance_id,
    v_instance.learner_id,
    p_project_id,
    v_instance.release_id,
    v_instance.revision_id,
    v_instance.presentation,
    v_instance.presentation_hash,
    v_instance.issued_at,
    v_instance.scope_evidence,
    p_snapshot_id,
    p_snapshot_generation,
    v_exercise_binding.objective_id,
    v_exercise_binding.objective_version,
    p_srs_epoch,
    v_exercise_binding.evidence_use,
    v_instance.legacy_item_id,
    v_instance.legacy_exercise_id,
    p_assets,
    p_feedback,
    p_device_id,
    v_now;
end;
$$;

revoke all on function public.study_graph_register_kuzushiji_pilot_v2_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_kuzushiji_pilot_v2_archive(
  text, integer, text, jsonb, text, text, text, integer, text, integer, text, jsonb, text
) to service_role;

revoke all on function public.study_graph_prefetch_kuzushiji_objective_instance(
  uuid, uuid, text, uuid, text, uuid, uuid, bigint, jsonb, text, jsonb, text, text, jsonb, jsonb, integer, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_prefetch_kuzushiji_objective_instance(
  uuid, uuid, text, uuid, text, uuid, uuid, bigint, jsonb, text, jsonb, text, text, jsonb, jsonb, integer, boolean
) to service_role;

commit;
