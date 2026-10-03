begin;

-- Keep the Phase 4E entry point for committed request recovery only. Its
-- historical device-local issuance branch must never mint another all-null
-- Objective binding after the shared opportunity cutover.
create or replace function public.study_graph_prefetch_kuzushiji_objective_instance(
  p_request_id uuid, p_learner_id uuid, p_project_id text, p_device_id uuid,
  p_release_id text, p_revision_id uuid, p_snapshot_id uuid,
  p_snapshot_generation bigint, p_presentation jsonb,
  p_presentation_hash text, p_scope_evidence jsonb, p_legacy_item_id text,
  p_legacy_exercise_id text, p_assets jsonb, p_feedback jsonb,
  p_srs_epoch integer, p_new_issuance_allowed boolean
)
returns table(
  request_id uuid, instance_id uuid, learner_id uuid, project_id text,
  release_id text, revision_id uuid, presentation jsonb,
  presentation_hash text, issued_at timestamptz, scope_evidence jsonb,
  snapshot_id uuid, snapshot_generation bigint, objective_id text,
  objective_version integer, srs_epoch integer, evidence_use text,
  legacy_item_id text, legacy_exercise_id text, assets jsonb,
  feedback jsonb, device_id uuid, prefetched_at timestamptz
)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_request private.offline_instance_issuance_requests%rowtype;
  v_instance private.exercise_instances%rowtype;
  v_binding private.instance_objective_bindings%rowtype;
begin
  if p_request_id is null or p_learner_id is null or p_device_id is null
    or p_project_id is distinct from 'kuzushiji'
    or p_srs_epoch is distinct from 1
    or (p_legacy_exercise_id is not null and p_legacy_exercise_id is distinct from
      'kuzushiji.visual-reading.eitaigura-u3042-00032-1') then
    raise exception using errcode = '22023', message = 'invalid_offline_prefetch_request';
  end if;
  -- Immutable mapping recovery never reads candidate content or current Scope.
  select r.* into v_request
    from private.offline_instance_issuance_requests r
    where r.request_id = p_request_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'offline_prefetch_v1_issuance_closed';
  end if;
  if v_request.learner_id <> p_learner_id
    or v_request.project_id <> p_project_id
    or v_request.device_id <> p_device_id then
    raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
  end if;
  select ei.* into v_instance from private.exercise_instances ei
    where ei.instance_id = v_request.instance_id;
  select iob.* into v_binding from private.instance_objective_bindings iob
    where iob.instance_id = v_request.instance_id;
  if v_instance.instance_id is null
    or v_instance.learner_id <> p_learner_id
    or v_instance.srs_target <> 'objective'
    or v_instance.srs_epoch is distinct from '1'
    or v_instance.legacy_exercise_id is distinct from
      'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    or v_binding.project_id is distinct from 'kuzushiji'
    or v_binding.objective_id is distinct from
      'kuzushiji.a.eitaigura-u3042-00032-1.read'
    or v_binding.objective_version is distinct from 1
    or v_binding.srs_epoch is distinct from 1
    or v_binding.evidence_use is distinct from 'srs' then
    raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
  end if;
  return query select p_request_id, v_instance.instance_id,
    v_instance.learner_id, p_project_id, v_instance.release_id,
    v_instance.revision_id, v_instance.presentation,
    v_instance.presentation_hash, v_instance.issued_at,
    v_instance.scope_evidence, v_request.snapshot_id,
    v_request.snapshot_generation, v_binding.objective_id,
    v_binding.objective_version, v_binding.srs_epoch,
    v_binding.evidence_use, v_instance.legacy_item_id,
    v_instance.legacy_exercise_id, v_request.assets,
    v_request.feedback, v_request.device_id, v_request.created_at;
end;
$$;

-- A committed request is always recovered first. A missing recovery-only
-- lookup returns zero rows; SQL/RPC errors remain distinguishable from absence.
-- All writes in create mode, including the nested generic issuer, commit or
-- roll back as one PostgreSQL transaction.
create function public.study_graph_prefetch_kuzushiji_objective_instance_v2(
  p_request_id uuid, p_learner_id uuid, p_project_id text, p_device_id uuid,
  p_create_if_missing boolean, p_new_issuance_allowed boolean,
  p_release_id text, p_revision_id uuid, p_snapshot_id uuid,
  p_snapshot_generation bigint, p_presentation jsonb,
  p_presentation_hash text, p_scope_evidence jsonb, p_legacy_item_id text,
  p_legacy_exercise_id text, p_srs_epoch integer
)
returns table(
  request_id uuid, instance_id uuid, learner_id uuid, project_id text,
  release_id text, revision_id uuid, presentation jsonb,
  presentation_hash text, issued_at timestamptz, scope_evidence jsonb,
  snapshot_id uuid, snapshot_generation bigint, objective_id text,
  objective_version integer, srs_epoch integer, evidence_use text,
  legacy_item_id text, legacy_exercise_id text, assets jsonb,
  feedback jsonb, device_id uuid, prefetched_at timestamptz,
  revision_payload jsonb, revision_content_hash text
)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_request private.offline_instance_issuance_requests%rowtype;
  v_revision private.exercise_revisions%rowtype;
  v_binding private.exercise_objective_bindings%rowtype;
  v_instance private.exercise_instances%rowtype;
  v_instance_binding private.instance_objective_bindings%rowtype;
  v_snapshot private.scope_knowledge_snapshots%rowtype;
  v_issue record;
  v_asset jsonb;
  v_assets jsonb;
  v_feedback jsonb;
  v_envelope private.offline_instance_issuance_requests%rowtype;
begin
  if p_request_id is null or p_learner_id is null or p_device_id is null
    or p_project_id is distinct from 'kuzushiji'
    or p_srs_epoch is distinct from 1 then
    raise exception using errcode = '22023', message = 'invalid_offline_prefetch_request';
  end if;

  select r.* into v_request from private.offline_instance_issuance_requests r
    where r.request_id = p_request_id;
  if found then
    if v_request.learner_id <> p_learner_id
      or v_request.project_id <> p_project_id
      or v_request.device_id <> p_device_id then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    return query select old.*, er.payload, er.content_hash
      from public.study_graph_prefetch_kuzushiji_objective_instance(
        p_request_id, p_learner_id, p_project_id, p_device_id,
        null, null, null, null, null, null, null, null, null,
        null, null, p_srs_epoch, false
      ) old
      join private.exercise_revisions er on er.revision_id = old.revision_id;
    return;
  end if;
  if coalesce(p_create_if_missing, false) is not true then return; end if;

  -- Immutable candidate facts establish the Objective key before mutable locks.
  select er.* into v_revision from private.content_release_entries cre
    join private.exercise_revisions er on er.revision_id = cre.revision_id
    where cre.release_id = p_release_id and cre.revision_id = p_revision_id;
  select eob.* into v_binding from private.exercise_objective_bindings eob
    where eob.revision_id = p_revision_id;
  if v_revision.revision_id is null
    or v_revision.project_id is distinct from 'kuzushiji'
    or p_release_id is distinct from
      'a6346dcb6b1b7a6df890f032ec3974e0c95ac3e631367ab022707d09c6357446'
    or v_revision.content_hash is distinct from
      'fca3edc54f17aa731c53cedd1130ff83d51a318ee07696c3310129f67a8db86d'
    or v_revision.exercise_id is distinct from
      'kuzushiji.visual-reading.eitaigura-u3042-00032-1'
    or v_revision.exercise_version is distinct from 2
    or v_revision.objective_id is distinct from
      'kuzushiji.a.eitaigura-u3042-00032-1.read'
    or v_revision.payload #>> '{status}' is distinct from 'approved'
    or v_binding.project_id is distinct from 'kuzushiji'
    or v_binding.objective_id is distinct from
      'kuzushiji.a.eitaigura-u3042-00032-1.read'
    or v_binding.objective_version is distinct from 1
    or v_binding.evidence_use is distinct from 'srs' then
    raise exception using errcode = 'P0001', message = 'unsupported_offline_objective_archive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'objective|' || p_learner_id::text || '|kuzushiji|'
      || v_binding.objective_id || '|' || p_srs_epoch::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'offline-prefetch-request|' || p_request_id::text, 0
  ));
  select r.* into v_request from private.offline_instance_issuance_requests r
    where r.request_id = p_request_id;
  if found then
    if v_request.learner_id <> p_learner_id
      or v_request.project_id <> p_project_id
      or v_request.device_id <> p_device_id then
      raise exception using errcode = 'P0001', message = 'offline_prefetch_request_conflict';
    end if;
    return query select old.*, er.payload, er.content_hash
      from public.study_graph_prefetch_kuzushiji_objective_instance(
        p_request_id, p_learner_id, p_project_id, p_device_id,
        null, null, null, null, null, null, null, null, null,
        null, null, p_srs_epoch, false
      ) old
      join private.exercise_revisions er on er.revision_id = old.revision_id;
    return;
  end if;

  if coalesce(p_new_issuance_allowed, false) is not true then
    raise exception using errcode = 'P0001', message = 'pilot_issuance_disabled';
  end if;
  if p_snapshot_id is null or p_snapshot_generation is null
    or p_snapshot_generation <= 0
    or p_presentation is null or jsonb_typeof(p_presentation) <> 'object'
    or p_presentation_hash is null or p_presentation_hash !~ '^[0-9a-f]{64}$'
    or p_scope_evidence is null or jsonb_typeof(p_scope_evidence) <> 'object'
    or p_legacy_item_id is distinct from
      '3ccd2793-4134-815f-95f0-cc64dcdb86c7'
    or p_legacy_exercise_id is distinct from
      'kuzushiji.visual-reading.eitaigura-u3042-00032-1' then
    raise exception using errcode = '22023', message = 'invalid_offline_prefetch_request';
  end if;
  select s.* into v_snapshot
    from private.project_snapshot_sync_state st
    join private.scope_knowledge_snapshots s on s.snapshot_id = st.current_snapshot_id
    where st.project_id = p_project_id for update of st;
  if v_snapshot.snapshot_id is null
    or v_snapshot.snapshot_id <> p_snapshot_id
    or v_snapshot.generation <> p_snapshot_generation
    or v_snapshot.source_evidence ->> 'paginationComplete' is distinct from 'true'
    or v_snapshot.source_evidence ->> 'relationCompleteness' is distinct from 'true'
    or p_scope_evidence ->> 'authority' is distinct from 'server-issuance'
    or p_scope_evidence ->> 'complete' is distinct from 'true'
    or p_scope_evidence ->> 'status' is distinct from 'eligible'
    or p_scope_evidence ->> 'snapshotId' is distinct from p_snapshot_id::text
    or not exists (
      select 1 from jsonb_array_elements(v_snapshot.scope_decisions) decision
      where decision ->> 'subjectId' = p_legacy_item_id
        and decision ->> 'status' = 'eligible'
    ) then
    raise exception using errcode = 'P0001', message = 'pilot_scope_not_eligible';
  end if;

  select * into v_issue from public.study_graph_issue_objective_instance_v2(
    p_learner_id, p_release_id, p_revision_id, p_presentation,
    p_presentation_hash, null, null, 'ja-JP', p_scope_evidence,
    null, p_legacy_item_id, 'character', p_legacy_exercise_id,
    p_srs_epoch, 'scheduled'
  );
  if v_issue.instance_id is null then
    raise exception using errcode = 'P0001', message = 'objective_issuance_missing';
  end if;

  select ei.* into v_instance from private.exercise_instances ei
    where ei.instance_id = v_issue.instance_id;
  select er.* into v_revision from private.content_release_entries cre
    join private.exercise_revisions er on er.revision_id = cre.revision_id
    where cre.release_id = v_issue.release_id
      and cre.revision_id = v_issue.revision_id;
  select iob.* into v_instance_binding from private.instance_objective_bindings iob
    where iob.instance_id = v_issue.instance_id;
  v_asset := v_revision.payload #> '{visualAssets,0}';
  if v_instance.instance_id is null
    or v_instance.learner_id <> p_learner_id
    or v_instance.release_id <> v_issue.release_id
    or v_instance.revision_id <> v_issue.revision_id
    or v_instance.legacy_item_id is distinct from p_legacy_item_id
    or v_instance.legacy_exercise_id is distinct from p_legacy_exercise_id
    or v_instance.srs_target <> 'objective'
    or v_instance.srs_epoch is distinct from '1'
    or v_revision.revision_id is null
    or v_revision.project_id is distinct from 'kuzushiji'
    or v_revision.exercise_id is distinct from p_legacy_exercise_id
    or v_revision.payload #>> '{status}' is distinct from 'approved'
    or v_instance_binding.project_id is distinct from 'kuzushiji'
    or v_instance_binding.objective_id is distinct from v_binding.objective_id
    or v_instance_binding.objective_version is distinct from 1
    or v_instance_binding.srs_epoch is distinct from 1
    or v_instance_binding.evidence_use is distinct from 'srs'
    or v_instance_binding.scheduling_context_version is distinct from 1 then
    raise exception using errcode = 'P0001', message = 'offline_persisted_authority_mismatch';
  end if;
  if v_asset is null or jsonb_typeof(v_asset) <> 'object'
    or jsonb_array_length(v_revision.payload -> 'visualAssets') <> 1
    or v_asset ->> 'checksum' is null
    or v_asset ->> 'checksum' !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'offline_asset_integrity_unavailable';
  end if;
  if v_revision.content_hash is distinct from
       'fca3edc54f17aa731c53cedd1130ff83d51a318ee07696c3310129f67a8db86d'
    or v_asset ->> 'assetId' is distinct from
      'kuzushiji.glyph.eitaigura-u3042-00032-1'
    or v_asset ->> 'assetVersion' is distinct from '2'
    or v_asset ->> 'mediaType' is distinct from 'image/png'
    or v_asset ->> 'src' is distinct from '/assets/kuzushiji/a-eitaigura-hires.png'
    or v_asset ->> 'width' is distinct from '222'
    or v_asset ->> 'height' is distinct from '290'
    or jsonb_typeof(v_asset -> 'source') <> 'object'
    or nullif(v_asset #>> '{source,url}', '') is null
    or nullif(v_asset #>> '{source,attribution}', '') is null
    or nullif(v_asset #>> '{source,license}', '') is null
    or v_instance.presentation -> 'asset' is distinct from
       (v_asset - 'source') || jsonb_build_object(
         'source', (v_asset -> 'source') - 'originalFile'
       )
    or v_revision.payload #>> '{answerSpec,type}' is distinct from 'text'
    or jsonb_typeof(v_revision.payload #> '{answerSpec,acceptedAnswers}') <> 'array'
    or jsonb_array_length(v_revision.payload #> '{answerSpec,acceptedAnswers}') < 1
    or exists (
      select 1 from jsonb_array_elements(v_revision.payload #> '{answerSpec,acceptedAnswers}') answer
      where jsonb_typeof(answer) <> 'string' or length(btrim(answer #>> '{}')) = 0
    )
    or v_revision.payload #>> '{gradingSpec,strategyId}' is distinct from 'legacy-text-v1'
    or v_revision.payload #>> '{gradingSpec,strategyVersion}' is distinct from '1'
    or v_revision.payload #>> '{gradingSpec,normalization}' is distinct from 'review-session-ja-v1'
    or v_revision.payload #>> '{pilotMetadata,motherCharacter,value}' is distinct from '阿'
    or nullif(v_revision.payload #>> '{explanation,summary}', '') is null
    or v_instance.presentation ->> 'prompt' is distinct from v_revision.payload ->> 'prompt'
    or v_instance.presentation ->> 'front' is distinct from v_revision.payload ->> 'front' then
    raise exception using errcode = 'P0001', message = 'offline_persisted_content_mismatch';
  end if;

  -- The first offline mapping fixes delivery metadata for this instance.
  select r.* into v_envelope from private.offline_instance_issuance_requests r
    where r.instance_id = v_instance.instance_id
    order by r.created_at, r.request_id limit 1;
  if found then
    v_assets := v_envelope.assets;
    v_feedback := v_envelope.feedback;
  else
    v_assets := jsonb_build_array(jsonb_build_object(
      'descriptorVersion', 1,
      'assetId', v_asset -> 'assetId',
      'assetVersion', v_asset -> 'assetVersion',
      'src', v_asset -> 'src',
      'checksum', v_asset -> 'checksum',
      'revisionContentHash', v_revision.content_hash,
      'mediaType', v_asset -> 'mediaType',
      'width', v_asset -> 'width',
      'height', v_asset -> 'height',
      'source', v_asset -> 'source',
      'offlineReady', false
    ));
    v_feedback := jsonb_build_object(
      'schemaVersion', 1,
      'revisionContentHash', v_revision.content_hash,
      'gradingStrategyId', 'legacy-text-v1',
      'gradingStrategyVersion', 1,
      'normalizerVersion', 'review-session-ja-v1',
      'acceptedAnswers', v_revision.payload #> '{answerSpec,acceptedAnswers}',
      'answerRows', jsonb_build_array(
        jsonb_build_object('label', '正解',
          'value', v_revision.payload #>> '{answerSpec,acceptedAnswers,0}'),
        jsonb_build_object('label', '字母',
          'value', v_revision.payload #>> '{pilotMetadata,motherCharacter,value}'),
        jsonb_build_object('label', '学習ポイント',
          'value', v_revision.payload #>> '{explanation,summary}')
      )
    );
  end if;

  insert into private.offline_instance_issuance_requests (
    request_id, learner_id, project_id, device_id, instance_id,
    snapshot_id, snapshot_generation, assets, feedback
  ) values (
    p_request_id, p_learner_id, p_project_id, p_device_id,
    v_instance.instance_id,
    coalesce(v_envelope.snapshot_id, p_snapshot_id),
    coalesce(v_envelope.snapshot_generation, p_snapshot_generation),
    v_assets, v_feedback
  );
  return query select old.*, er.payload, er.content_hash
    from public.study_graph_prefetch_kuzushiji_objective_instance(
      p_request_id, p_learner_id, p_project_id, p_device_id,
      null, null, null, null, null, null, null, null, null,
      null, null, p_srs_epoch, false
    ) old
    join private.exercise_revisions er on er.revision_id = old.revision_id;
end;
$$;

revoke execute on function public.study_graph_prefetch_kuzushiji_objective_instance_v2(
  uuid, uuid, text, uuid, boolean, boolean, text, uuid, uuid, bigint,
  jsonb, text, jsonb, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_prefetch_kuzushiji_objective_instance_v2(
  uuid, uuid, text, uuid, boolean, boolean, text, uuid, uuid, bigint,
  jsonb, text, jsonb, text, text, integer
) to service_role;

revoke execute on function public.study_graph_prefetch_kuzushiji_objective_instance(
  uuid, uuid, text, uuid, text, uuid, uuid, bigint, jsonb, text,
  jsonb, text, text, jsonb, jsonb, integer, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_prefetch_kuzushiji_objective_instance(
  uuid, uuid, text, uuid, text, uuid, uuid, bigint, jsonb, text,
  jsonb, text, text, jsonb, jsonb, integer, boolean
) to service_role;

commit;
