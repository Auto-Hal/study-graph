begin;

-- Cause: Phase 4D-2 Objective RPC incorrectly required jsonb rawAnswer to be
-- an object; the application contract allows a JSON string or a text wrapper.
-- Fix: align DB defense-in-depth validation with the immutable application rawAnswer contract.
-- The original p_raw_answer representation is retained.
--
-- This additive replacement intentionally preserves the existing RPC signature,
-- SECURITY DEFINER/search_path, function ACL, SRS logic, and receipt behavior.
-- CREATE OR REPLACE FUNCTION does not reset the existing grants.

create or replace function public.study_graph_record_objective_attempt(
  p_attempt_id uuid,
  p_instance_id uuid,
  p_learner_id uuid,
  p_request_hash text,
  p_raw_answer jsonb,
  p_normalized_answer jsonb,
  p_grading_status text,
  p_grading_authority text,
  p_grading_strategy_id text,
  p_grading_strategy_version integer,
  p_normalizer_version text,
  p_is_correct boolean,
  p_self_evaluation text,
  p_effective_srs_grade text,
  p_response_ms integer,
  p_used_hint boolean,
  p_scope_accepted boolean,
  p_revision_allowed boolean,
  p_epoch_active boolean,
  p_srs_applied boolean,
  p_srs_reason text,
  p_scheduler_version text default null
)
returns table(receipt jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instance private.exercise_instances%rowtype;
  v_revision private.exercise_revisions%rowtype;
  v_instance_binding private.instance_objective_bindings%rowtype;
  v_revision_status text;
  v_expected_strategy_id text;
  v_expected_strategy_version text;
  v_expected_normalizer_version text;
  v_existing_request_hash text;
  v_existing_receipt jsonb;
  v_existing_attempt_instance_id uuid;
  v_existing_attempt_learner_id uuid;
  v_existing_instance_attempt_id uuid;
  v_existing_application private.objective_srs_applications%rowtype;
  v_state private.objective_review_state%rowtype;
  v_state_before jsonb;
  v_state_after jsonb;
  v_previous_interval integer := 0;
  v_previous_repetitions integer := 0;
  v_interval integer := 0;
  v_repetitions integer := 0;
  v_state_revision bigint;
  v_due_at timestamptz;
  v_now timestamptz := now();
  v_application_id uuid := extensions.gen_random_uuid();
  v_receipt jsonb;
  v_private_srs_reason text;
begin
  if p_attempt_id is null or p_instance_id is null or p_learner_id is null
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_raw_answer is null
    or not coalesce(
      jsonb_typeof(p_raw_answer) = 'string'
      or (
        jsonb_typeof(p_raw_answer) = 'object'
        and p_raw_answer ->> 'type' = 'text'
        and jsonb_typeof(p_raw_answer -> 'value') = 'string'
      ),
      false
    )
    or p_grading_status is null or p_grading_status not in ('graded', 'ungraded')
    or p_grading_authority is null or p_grading_authority <> 'server'
    or p_grading_strategy_id is null or length(btrim(p_grading_strategy_id)) = 0
    or p_grading_strategy_version is null or p_grading_strategy_version <= 0
    or p_normalizer_version is null or length(btrim(p_normalizer_version)) = 0
    or p_scope_accepted is null or p_revision_allowed is null
    or p_epoch_active is null or p_srs_applied is null
    or p_used_hint is null
    or p_srs_reason is null then
    raise exception using errcode = '22023', message = 'invalid_objective_submission';
  end if;
  if p_grading_status = 'graded' and p_is_correct is null then
    raise exception using errcode = '22023', message = 'graded_result_requires_correctness';
  end if;
  if p_grading_status = 'ungraded' and p_is_correct is not null then
    raise exception using errcode = '22023', message = 'ungraded_result_cannot_have_correctness';
  end if;
  if p_self_evaluation is not null
    and p_self_evaluation not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'invalid_self_evaluation';
  end if;
  if p_effective_srs_grade is not null
    and p_effective_srs_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'invalid_effective_srs_grade';
  end if;
  if p_response_ms is not null and (p_response_ms < 0 or p_response_ms > 3600000) then
    raise exception using errcode = '22023', message = 'invalid_response_time';
  end if;
  if p_srs_reason not in (
    'applied',
    'grader-unavailable',
    'scope-not-eligible',
    'revision-quarantined',
    'revision-retired',
    'practice-only',
    'epoch-inactive'
  ) then
    raise exception using errcode = '22023', message = 'invalid_objective_srs_reason';
  end if;

  -- Attempt ID locking makes a retry wait for the original transaction and
  -- then return its stored receipt rather than running the work twice.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective-attempt|' || p_attempt_id::text,
    0
  ));

  select ei.*
    into v_instance
  from private.exercise_instances ei
  where ei.instance_id = p_instance_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'instance_not_found';
  end if;
  if v_instance.learner_id <> p_learner_id then
    raise exception using errcode = 'P0001', message = 'learner_mismatch';
  end if;

  select er.*
    into v_revision
  from private.exercise_revisions er
  where er.revision_id = v_instance.revision_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'revision_not_found';
  end if;

  select iob.*
    into v_instance_binding
  from private.instance_objective_bindings iob
  where iob.instance_id = p_instance_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'instance_objective_binding_not_found';
  end if;

  if v_instance_binding.project_id <> v_revision.project_id then
    raise exception using errcode = 'P0001', message = 'instance_objective_project_mismatch';
  end if;

  select ea.request_hash, ea.receipt, ea.instance_id, ea.learner_id
    into v_existing_request_hash, v_existing_receipt,
      v_existing_attempt_instance_id, v_existing_attempt_learner_id
  from private.exercise_attempts ea
  where ea.attempt_id = p_attempt_id
  for update;
  if found then
    -- The request hash covers both IDs, but keep the row identity check here
    -- so a forged/reused hash can never restore a receipt for another
    -- instance or learner.
    if v_existing_attempt_instance_id <> p_instance_id
      or v_existing_attempt_learner_id <> p_learner_id
      or v_existing_request_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'attempt_conflict';
    end if;
    select osa.*
      into v_existing_application
    from private.objective_srs_applications osa
    where osa.attempt_id = p_attempt_id
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'attempt_not_objective';
    end if;
    return query select v_existing_application.receipt;
    return;
  end if;

  select ea.attempt_id
    into v_existing_instance_attempt_id
  from private.exercise_attempts ea
  where ea.instance_id = p_instance_id
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'instance_already_answered';
  end if;

  v_revision_status := v_revision.payload #>> '{status}';
  if v_revision_status is null
    or v_revision_status not in ('approved', 'quarantined', 'retired') then
    raise exception using errcode = 'P0001', message = 'revision_not_allowed';
  end if;

  v_expected_strategy_id := v_revision.payload #>> '{gradingSpec,strategyId}';
  v_expected_strategy_version := v_revision.payload #>> '{gradingSpec,strategyVersion}';
  v_expected_normalizer_version := v_revision.payload #>> '{gradingSpec,normalization}';
  if p_grading_strategy_id is distinct from v_expected_strategy_id
    or p_grading_strategy_version::text is distinct from v_expected_strategy_version
    or p_normalizer_version is distinct from v_expected_normalizer_version then
    raise exception using errcode = 'P0001', message = 'grading_revision_mismatch';
  end if;

  -- The server-side plan must agree with the archived status, immutable
  -- attribution, current scope evidence, and active epoch.  No client field
  -- can opt into Objective SRS by itself.
  if p_srs_applied then
    if v_revision_status <> 'approved'
      or not p_revision_allowed
      or not p_scope_accepted
      or not p_epoch_active
      or v_instance_binding.evidence_use <> 'srs'
      or p_grading_status <> 'graded'
      or p_is_correct is null
      or p_effective_srs_grade is null
      or p_srs_reason <> 'applied' then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    end if;
  else
    if p_srs_reason = 'applied' or p_effective_srs_grade is not null then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    end if;
    if p_srs_reason = 'grader-unavailable' and p_grading_status <> 'ungraded' then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    elsif p_srs_reason = 'scope-not-eligible' and p_scope_accepted then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    elsif p_srs_reason = 'revision-quarantined' and v_revision_status <> 'quarantined' then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    elsif p_srs_reason = 'revision-retired' and v_revision_status <> 'retired' then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    elsif p_srs_reason = 'practice-only' and v_instance_binding.evidence_use <> 'practice-only' then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    elsif p_srs_reason = 'epoch-inactive' and p_epoch_active then
      raise exception using errcode = '22023', message = 'invalid_objective_srs_plan';
    end if;
  end if;

  -- This lock covers the state-absent case as well as normal row updates.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective|' || p_learner_id::text || '|' || v_instance_binding.project_id
      || '|' || v_instance_binding.objective_id || '|' || v_instance_binding.srs_epoch::text,
    0
  ));

  select ors.*
    into v_state
  from private.objective_review_state ors
  where ors.learner_id = p_learner_id
    and ors.project_id = v_instance_binding.project_id
    and ors.objective_id = v_instance_binding.objective_id
    and ors.srs_epoch = v_instance_binding.srs_epoch
  for update;
  if found then
    v_previous_interval := v_state.interval_days;
    v_previous_repetitions := v_state.repetitions;
    -- State snapshots describe an applied Objective update only.  A no-SRS
    -- application may inspect the current row for locking, but it must not
    -- claim that the row was part of its state transition.
    if p_srs_applied then
      v_state_before := to_jsonb(v_state);
    end if;
  end if;

  if p_srs_applied then
    case p_effective_srs_grade
      when 'again' then
        v_interval := 0;
        v_repetitions := 0;
        v_due_at := v_now + interval '10 minutes';
      when 'hard' then
        v_interval := case
          when v_previous_interval = 0 then 1
          else greatest(1, ceil(v_previous_interval * 1.2)::integer)
        end;
        v_repetitions := v_previous_repetitions + 1;
        v_due_at := v_now + make_interval(days => v_interval);
      when 'good' then
        v_interval := case
          when v_previous_interval = 0 then 2
          else greatest(2, round(v_previous_interval * 2.2)::integer)
        end;
        v_repetitions := v_previous_repetitions + 1;
        v_due_at := v_now + make_interval(days => v_interval);
      when 'easy' then
        v_interval := case
          when v_previous_interval = 0 then 5
          else greatest(5, round(v_previous_interval * 3.2)::integer)
        end;
        v_repetitions := v_previous_repetitions + 1;
        v_due_at := v_now + make_interval(days => v_interval);
    end case;

    v_state_revision := case
      when v_state.state_revision is null then 1
      else v_state.state_revision + 1
    end;
    insert into private.objective_review_state (
      learner_id,
      project_id,
      objective_id,
      srs_epoch,
      last_grade,
      repetitions,
      interval_days,
      last_reviewed_at,
      due_at,
      scheduler_version,
      state_revision,
      last_application_id,
      created_at,
      updated_at
    ) values (
      p_learner_id,
      v_instance_binding.project_id,
      v_instance_binding.objective_id,
      v_instance_binding.srs_epoch,
      p_effective_srs_grade,
      v_repetitions,
      v_interval,
      v_now,
      v_due_at,
      p_scheduler_version,
      v_state_revision,
      v_application_id,
      v_now,
      v_now
    )
    on conflict (learner_id, project_id, objective_id, srs_epoch) do update set
      last_grade = excluded.last_grade,
      repetitions = excluded.repetitions,
      interval_days = excluded.interval_days,
      last_reviewed_at = excluded.last_reviewed_at,
      due_at = excluded.due_at,
      scheduler_version = excluded.scheduler_version,
      state_revision = excluded.state_revision,
      last_application_id = excluded.last_application_id,
      updated_at = excluded.updated_at;

    select ors.*
      into v_state
    from private.objective_review_state ors
    where ors.learner_id = p_learner_id
      and ors.project_id = v_instance_binding.project_id
      and ors.objective_id = v_instance_binding.objective_id
      and ors.srs_epoch = v_instance_binding.srs_epoch
    for update;
    v_state_after := to_jsonb(v_state);
  end if;

  -- exercise_attempts is the shared immutable attempt history.  Its legacy
  -- srs_reason CHECK predates Objective-only reasons, so those reasons are
  -- projected to the neutral no-SRS scope-not-eligible value; the exact
  -- Objective reason remains authoritative in objective_srs_applications and
  -- its receipt.  No public legacy tables are touched here.
  v_private_srs_reason := case
    when p_srs_reason in ('applied', 'grader-unavailable', 'scope-not-eligible', 'revision-quarantined')
      then p_srs_reason
    else 'scope-not-eligible'
  end;

  v_receipt := jsonb_build_object(
    'receiptVersion', 1,
    'attemptId', p_attempt_id,
    'instanceId', p_instance_id,
    'acceptedAt', v_now,
    'projectId', v_instance_binding.project_id,
    'objectiveId', v_instance_binding.objective_id,
    'objectiveVersion', v_instance_binding.objective_version,
    'srsEpoch', v_instance_binding.srs_epoch,
    'evidenceUse', v_instance_binding.evidence_use,
    'gradingStatus', p_grading_status,
    'isCorrect', p_is_correct,
    'applied', p_srs_applied,
    'reason', p_srs_reason,
    'effectiveGrade', case when p_srs_applied then p_effective_srs_grade else null end,
    'stateRevision', case when p_srs_applied then v_state.state_revision else null end,
    'dueAt', case when p_srs_applied then v_state.due_at else null end
  );

  insert into private.exercise_attempts (
    attempt_id,
    instance_id,
    learner_id,
    request_hash,
    raw_answer,
    normalized_answer,
    grading_status,
    grading_authority,
    grading_strategy_id,
    grading_strategy_version,
    normalizer_version,
    is_correct,
    self_evaluation,
    effective_srs_grade,
    response_ms,
    used_hint,
    scope_accepted,
    srs_applied,
    srs_reason,
    scheduler_version,
    review_state_before,
    review_state_after,
    legacy_review_attempt_id,
    receipt,
    submitted_at
  ) values (
    p_attempt_id,
    p_instance_id,
    p_learner_id,
    p_request_hash,
    p_raw_answer,
    p_normalized_answer,
    p_grading_status,
    p_grading_authority,
    p_grading_strategy_id,
    p_grading_strategy_version,
    p_normalizer_version,
    p_is_correct,
    p_self_evaluation,
    case when p_srs_applied then p_effective_srs_grade else null end,
    p_response_ms,
    coalesce(p_used_hint, false),
    p_scope_accepted,
    p_srs_applied,
    v_private_srs_reason,
    case when p_srs_applied then p_scheduler_version else null end,
    null,
    null,
    null,
    v_receipt,
    v_now
  );

  insert into private.objective_srs_applications (
    application_id,
    attempt_id,
    instance_id,
    learner_id,
    project_id,
    objective_id,
    objective_version,
    srs_epoch,
    evidence_use,
    applied,
    reason,
    effective_grade,
    scheduler_version,
    state_before,
    state_after,
    receipt,
    created_at
  ) values (
    v_application_id,
    p_attempt_id,
    p_instance_id,
    p_learner_id,
    v_instance_binding.project_id,
    v_instance_binding.objective_id,
    v_instance_binding.objective_version,
    v_instance_binding.srs_epoch,
    v_instance_binding.evidence_use,
    p_srs_applied,
    p_srs_reason,
    case when p_srs_applied then p_effective_srs_grade else null end,
    case when p_srs_applied then p_scheduler_version else null end,
    v_state_before,
    v_state_after,
    v_receipt,
    v_now
  );

  return query select v_receipt;
end;
$$;

commit;
