begin;

-- Phase 5A-1b lock-order hardening. All v2 paths sharing an Objective key take
-- the Objective advisory lock first. When an existing active opportunity is
-- involved, mutable rows are then locked instance -> opportunity -> state,
-- matching the v2 acceptance path. The initial 5A-1b migration is otherwise
-- unchanged and current v1 runtime remains isolated.
create or replace function public.study_graph_issue_objective_instance_v2(
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
  p_legacy_item_kind text,
  p_legacy_exercise_id text,
  p_srs_epoch integer,
  p_intent text
)
returns table(
  instance_id uuid,
  release_id text,
  revision_id uuid,
  opportunity_kind text,
  effective_evidence_use text,
  expected_state_revision bigint,
  issued_at timestamptz,
  expires_at timestamptz,
  reused boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision private.exercise_revisions%rowtype;
  v_binding private.exercise_objective_bindings%rowtype;
  v_state private.objective_review_state%rowtype;
  v_state_found boolean := false;
  v_active private.objective_srs_opportunities%rowtype;
  v_active_found boolean := false;
  v_active_binding private.instance_objective_bindings%rowtype;
  v_active_instance private.exercise_instances%rowtype;
  v_now timestamptz := now();
  v_instance_id uuid := extensions.gen_random_uuid();
  v_opportunity_kind text;
  v_effective_evidence_use text;
  v_expected_state_revision bigint;
  v_expires_at timestamptz;
  v_due_at_observed timestamptz;
begin
  if p_learner_id is null
    or p_release_id is null or btrim(p_release_id) = ''
    or p_revision_id is null
    or p_presentation is null or jsonb_typeof(p_presentation) <> 'object'
    or p_presentation_hash is null or p_presentation_hash !~ '^[0-9a-f]{64}$'
    or p_locale is null or btrim(p_locale) = ''
    or p_scope_evidence is null or jsonb_typeof(p_scope_evidence) <> 'object'
    or p_legacy_item_id is null or btrim(p_legacy_item_id) = ''
    or p_legacy_item_kind is null or p_legacy_item_kind not in ('character', 'mistake', 'knowledge')
    or p_legacy_exercise_id is null or btrim(p_legacy_exercise_id) = ''
    or p_srs_epoch is null or p_srs_epoch <= 0
    or p_intent is null or p_intent not in ('scheduled', 'practice') then
    raise exception using errcode = '22023', message = 'invalid_objective_v2_issuance';
  end if;

  -- Archive and Objective binding are immutable facts and may be read before
  -- the Objective authority lock without introducing a mutable lock inversion.
  select er.* into v_revision
  from private.content_release_entries cre
  join private.exercise_revisions er on er.revision_id = cre.revision_id
  where cre.release_id = p_release_id
    and cre.revision_id = p_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'objective_archive_not_registered';
  end if;
  if (v_revision.payload #>> '{status}') is distinct from 'approved' then
    raise exception using errcode = 'P0001', message = 'revision_not_issuable';
  end if;

  select eob.* into v_binding
  from private.exercise_objective_bindings eob
  where eob.revision_id = p_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'objective_binding_not_registered';
  end if;
  if v_binding.project_id <> v_revision.project_id then
    raise exception using errcode = 'P0001', message = 'objective_binding_project_mismatch';
  end if;
  if p_intent = 'scheduled' and v_binding.evidence_use <> 'srs' then
    raise exception using errcode = 'P0001', message = 'objective_binding_not_srs_capable';
  end if;

  -- Shared v2 authority boundary.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective|' || p_learner_id::text || '|' || v_binding.project_id
      || '|' || v_binding.objective_id || '|' || p_srs_epoch::text,
    0
  ));

  if p_intent = 'practice' then
    -- Practice never owns or mutates the active SRS slot and needs no current
    -- state authority. The immutable SRS-capable binding is narrowed here.
    v_opportunity_kind := 'practice';
    v_effective_evidence_use := 'practice-only';
    v_expected_state_revision := null;
    v_expires_at := null;
    v_due_at_observed := null;
  else
    -- Under the Objective advisory lock it is safe to identify the current
    -- active opportunity without a row lock. If one exists, lock its instance
    -- first, then the opportunity row, then Objective state. Acceptance uses
    -- the same mutable ordering.
    select oso.* into v_active
    from private.objective_srs_opportunities oso
    where oso.learner_id = p_learner_id
      and oso.project_id = v_binding.project_id
      and oso.objective_id = v_binding.objective_id
      and oso.srs_epoch = p_srs_epoch
      and oso.status = 'active';
    v_active_found := found;

    if v_active_found then
      select ei.* into v_active_instance
      from private.exercise_instances ei
      where ei.instance_id = v_active.instance_id
      for update;
      if not found then
        raise exception using errcode = 'P0001', message = 'active_opportunity_instance_missing';
      end if;

      select oso.* into v_active
      from private.objective_srs_opportunities oso
      where oso.opportunity_id = v_active.opportunity_id
        and oso.instance_id = v_active.instance_id
      for update;
      if not found or v_active.status <> 'active' then
        raise exception using errcode = 'P0001', message = 'active_opportunity_changed';
      end if;

      select iob.* into v_active_binding
      from private.instance_objective_bindings iob
      where iob.instance_id = v_active.instance_id;
      if not found then
        raise exception using errcode = 'P0001', message = 'active_opportunity_context_missing';
      end if;
    end if;

    select ors.* into v_state
    from private.objective_review_state ors
    where ors.learner_id = p_learner_id
      and ors.project_id = v_binding.project_id
      and ors.objective_id = v_binding.objective_id
      and ors.srs_epoch = p_srs_epoch
    for update;
    v_state_found := found;

    -- A still-valid active opportunity is authoritative even across devices;
    -- return it instead of allocating another SRS-bearing instance.
    if v_active_found
      and v_active_binding.scheduling_context_version = 1
      and v_active_binding.evidence_use = 'srs'
      and v_active_binding.expires_at is not null
      and v_active_binding.expires_at > v_now
      and (
        (not v_state_found and v_active_binding.expected_state_revision = 0)
        or
        (v_state_found and v_active_binding.expected_state_revision = v_state.state_revision)
      ) then
      return query select
        v_active.instance_id,
        v_active_instance.release_id,
        v_active_instance.revision_id,
        v_active_binding.opportunity_kind,
        v_active_binding.evidence_use,
        v_active_binding.expected_state_revision,
        v_active_binding.issued_at,
        v_active_binding.expires_at,
        true;
      return;
    end if;

    -- A replacement can only be allocated after the exact old active row is
    -- terminalized under the Objective lock. No newer opportunity can match
    -- this opportunity_id + instance_id predicate.
    if v_active_found then
      update private.objective_srs_opportunities oso
      set status = 'terminal',
          terminal_reason = case
            when v_active_binding.expires_at is not null
              and v_active_binding.expires_at <= v_now then 'expired'
            else 'stale'
          end,
          terminalized_at = v_now
      where oso.opportunity_id = v_active.opportunity_id
        and oso.instance_id = v_active.instance_id
        and oso.status = 'active';
    end if;

    if v_state_found and v_state.due_at > v_now then
      -- This exception rolls back any tentative lazy terminalization above;
      -- there is no replacement while the Objective is not due. The stale row
      -- will be terminalized by acceptance or a later due issuer transaction.
      raise exception using errcode = 'P0001', message = 'objective_not_due';
    end if;

    if v_state_found then
      v_opportunity_kind := 'due';
      v_expected_state_revision := v_state.state_revision;
      v_due_at_observed := v_state.due_at;
    else
      v_opportunity_kind := 'unseen';
      v_expected_state_revision := 0;
      v_due_at_observed := null;
    end if;
    v_effective_evidence_use := 'srs';
    v_expires_at := v_now + interval '604800 seconds';
  end if;

  insert into private.exercise_instances (
    instance_id, learner_id, release_id, revision_id, presentation,
    presentation_hash, renderer_version, adapter_version, locale, scope_evidence,
    knowledge_binding, legacy_item_id, legacy_item_kind, legacy_exercise_id,
    srs_target, srs_epoch, issued_at
  ) values (
    v_instance_id, p_learner_id, p_release_id, p_revision_id, p_presentation,
    p_presentation_hash, p_renderer_version, p_adapter_version, p_locale,
    p_scope_evidence, p_knowledge_binding, p_legacy_item_id, p_legacy_item_kind,
    p_legacy_exercise_id, 'objective', p_srs_epoch::text, v_now
  );

  insert into private.instance_objective_bindings (
    instance_id, project_id, objective_id, objective_version, srs_epoch,
    evidence_use, scheduling_context_version, opportunity_kind,
    expected_state_revision, grade_policy_version, activation_policy_version,
    issued_at, expires_at, due_at_observed
  ) values (
    v_instance_id, v_binding.project_id, v_binding.objective_id,
    v_binding.objective_version, p_srs_epoch, v_effective_evidence_use,
    1, v_opportunity_kind, v_expected_state_revision,
    'deterministic-correctness-cap-v1', 'on-publication-v1',
    v_now, v_expires_at, v_due_at_observed
  );

  if v_effective_evidence_use = 'srs' then
    insert into private.objective_srs_opportunities (
      instance_id, learner_id, project_id, objective_id, objective_version,
      srs_epoch, evidence_use, status, created_at
    ) values (
      v_instance_id, p_learner_id, v_binding.project_id,
      v_binding.objective_id, v_binding.objective_version, p_srs_epoch,
      'srs', 'active', v_now
    );
  end if;

  return query select
    v_instance_id, p_release_id, p_revision_id, v_opportunity_kind,
    v_effective_evidence_use, v_expected_state_revision, v_now,
    v_expires_at, false;
end;
$$;

revoke execute on function public.study_graph_issue_objective_instance_v2(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb,
  text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_issue_objective_instance_v2(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb,
  text, text, text, integer, text
) to service_role;

commit;
