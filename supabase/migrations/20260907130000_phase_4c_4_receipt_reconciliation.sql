begin;

-- Phase 4C-4 reconciliation: restore the canonical 4C-3 receipt shape.
-- Existing immutable attempt rows are intentionally not rewritten. This function
-- only affects attempts accepted after this migration is applied.
create or replace function public.study_graph_record_exercise_attempt(
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
  v_existing_request_hash text;
  v_existing_receipt jsonb;
  v_existing_attempt_id uuid;
  v_instance_learner_id uuid;
  v_legacy_item_id text;
  v_legacy_item_kind text;
  v_legacy_exercise_id text;
  v_project_id text;
  v_revision_payload jsonb;
  v_expected_strategy_id text;
  v_expected_strategy_version integer;
  v_expected_normalizer_version text;
  v_review_state_before jsonb;
  v_review_state_after jsonb;
  v_previous_interval integer := 0;
  v_previous_repetitions integer := 0;
  v_interval integer := 0;
  v_repetitions integer := 0;
  v_due_at timestamptz;
  v_now timestamptz := now();
  v_legacy_review_attempt_id bigint;
  v_receipt jsonb;
  v_answer_type text;
  v_answer_text text;
begin
  if p_attempt_id is null or p_instance_id is null or p_learner_id is null then
    raise exception using errcode = '22023', message = 'invalid_submission_identity';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  if p_raw_answer is null then
    raise exception using errcode = '22023', message = 'invalid_raw_answer';
  end if;
  -- Serialize retries by attempt ID before reading the immutable attempt row.
  perform pg_advisory_xact_lock(hashtextextended('attempt|' || p_attempt_id::text, 0));

  select
    ei.learner_id,
    ei.legacy_item_id,
    ei.legacy_item_kind,
    ei.legacy_exercise_id,
    er.project_id,
    er.payload
    into
      v_instance_learner_id,
      v_legacy_item_id,
      v_legacy_item_kind,
      v_legacy_exercise_id,
      v_project_id,
      v_revision_payload
  from private.exercise_instances ei
  join private.exercise_revisions er on er.revision_id = ei.revision_id
  where ei.instance_id = p_instance_id
  for update of ei;

  if not found then
    raise exception using errcode = 'P0001', message = 'instance_not_found';
  end if;
  if v_instance_learner_id <> p_learner_id then
    raise exception using errcode = 'P0001', message = 'learner_mismatch';
  end if;
  if v_legacy_item_kind <> 'character' then
    raise exception using errcode = 'P0001', message = 'unsupported_legacy_item_kind';
  end if;

  select ea.request_hash, ea.receipt
    into v_existing_request_hash, v_existing_receipt
  from private.exercise_attempts ea
  where ea.attempt_id = p_attempt_id
  for update;
  if found then
    if v_existing_request_hash = p_request_hash then
      return query select v_existing_receipt;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'attempt_conflict';
  end if;

  v_expected_strategy_id := v_revision_payload #>> '{gradingSpec,strategyId}';
  v_expected_strategy_version := (v_revision_payload #>> '{gradingSpec,strategyVersion}')::integer;
  v_expected_normalizer_version := v_revision_payload #>> '{gradingSpec,normalization}';
  if p_grading_strategy_id <> v_expected_strategy_id
    or p_grading_strategy_version <> v_expected_strategy_version
    or p_normalizer_version <> v_expected_normalizer_version then
    raise exception using errcode = 'P0001', message = 'grading_revision_mismatch';
  end if;

  if p_grading_status is null
    or p_grading_status not in ('graded', 'ungraded')
    or p_grading_authority is null
    or p_grading_authority <> 'server'
    or p_grading_strategy_id is null
    or length(btrim(p_grading_strategy_id)) = 0
    or p_grading_strategy_version is null
    or p_grading_strategy_version <= 0
    or p_normalizer_version is null
    or length(btrim(p_normalizer_version)) = 0
    or p_scope_accepted is null
    or p_srs_applied is null
    or p_srs_reason is null then
    raise exception using errcode = '22023', message = 'invalid_grading_or_srs_result';
  end if;
  if p_grading_status = 'graded' and p_is_correct is null then
    raise exception using errcode = '22023', message = 'graded_result_requires_correctness';
  end if;
  if p_grading_status = 'ungraded' and p_is_correct is not null then
    raise exception using errcode = '22023', message = 'ungraded_result_cannot_have_correctness';
  end if;
  if p_self_evaluation is not null and p_self_evaluation not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'invalid_self_evaluation';
  end if;
  if p_effective_srs_grade is not null and p_effective_srs_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'invalid_effective_srs_grade';
  end if;
  if p_response_ms is not null and (p_response_ms < 0 or p_response_ms > 3600000) then
    raise exception using errcode = '22023', message = 'invalid_response_time';
  end if;
  if p_srs_reason not in ('applied', 'grader-unavailable', 'scope-not-eligible', 'revision-quarantined') then
    raise exception using errcode = '22023', message = 'invalid_srs_reason';
  end if;
  if p_srs_applied
    and (not p_scope_accepted or p_grading_status <> 'graded' or p_effective_srs_grade is null or p_srs_reason <> 'applied') then
    raise exception using errcode = '22023', message = 'invalid_srs_plan';
  end if;
  if not p_srs_applied and p_srs_reason = 'applied' then
    raise exception using errcode = '22023', message = 'invalid_srs_plan';
  end if;

  select ea.attempt_id
    into v_existing_attempt_id
  from private.exercise_attempts ea
  where ea.instance_id = p_instance_id
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'instance_already_answered';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'item|' || v_project_id || '|' || p_learner_id::text || '|' || v_legacy_item_id,
    0
  ));

  select to_jsonb(rs), rs.interval_days, rs.repetitions
    into v_review_state_before, v_previous_interval, v_previous_repetitions
  from public.review_state rs
  where rs.item_id = v_legacy_item_id
  for update;
  v_previous_interval := coalesce(v_previous_interval, 0);
  v_previous_repetitions := coalesce(v_previous_repetitions, 0);

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

    v_answer_type := coalesce(v_revision_payload #>> '{answerSpec,type}', 'text');
    v_answer_text := left(coalesce(p_raw_answer ->> 'value', p_raw_answer ->> 'text', p_raw_answer #>> '{}', ''), 2000);

    insert into public.review_attempts (
      item_id,
      item_kind,
      grade,
      previous_interval_days,
      interval_days,
      reviewed_at,
      due_at,
      exercise_id,
      answer_type,
      answer_text,
      is_correct,
      response_ms,
      used_hint
    ) values (
      v_legacy_item_id,
      v_legacy_item_kind,
      p_effective_srs_grade,
      v_previous_interval,
      v_interval,
      v_now,
      v_due_at,
      v_legacy_exercise_id,
      v_answer_type,
      v_answer_text,
      p_is_correct,
      p_response_ms,
      coalesce(p_used_hint, false)
    ) returning id into v_legacy_review_attempt_id;

    insert into public.review_state (
      item_id,
      item_kind,
      last_grade,
      repetitions,
      interval_days,
      last_reviewed_at,
      due_at,
      updated_at
    ) values (
      v_legacy_item_id,
      v_legacy_item_kind,
      p_effective_srs_grade,
      v_repetitions,
      v_interval,
      v_now,
      v_due_at,
      v_now
    )
    on conflict (item_id) do update set
      item_kind = excluded.item_kind,
      last_grade = excluded.last_grade,
      repetitions = excluded.repetitions,
      interval_days = excluded.interval_days,
      last_reviewed_at = excluded.last_reviewed_at,
      due_at = excluded.due_at,
      updated_at = excluded.updated_at;

    select to_jsonb(rs)
      into v_review_state_after
    from public.review_state rs
    where rs.item_id = v_legacy_item_id;
  else
    v_review_state_after := v_review_state_before;
  end if;

  v_receipt := jsonb_build_object(
    'receiptVersion', 1,
    'attemptId', p_attempt_id,
    'instanceId', p_instance_id,
    'acceptedAt', v_now,
    'gradingStatus', p_grading_status,
    'isCorrect', p_is_correct,
    'effectiveSrsGrade', p_effective_srs_grade,
    'srsApplied', p_srs_applied,
    'srsReason', p_srs_reason,
    'legacyReviewAttemptId', v_legacy_review_attempt_id,
    'reviewStateBefore', v_review_state_before,
    'reviewStateAfter', v_review_state_after
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
    p_effective_srs_grade,
    p_response_ms,
    coalesce(p_used_hint, false),
    p_scope_accepted,
    p_srs_applied,
    p_srs_reason,
    p_scheduler_version,
    v_review_state_before,
    v_review_state_after,
    v_legacy_review_attempt_id,
    v_receipt,
    v_now
  );

  return query select v_receipt;
end;
$$;

revoke all on function public.study_graph_record_exercise_attempt(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer, text,
  boolean, text, text, integer, boolean, boolean, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_record_exercise_attempt(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer, text,
  boolean, text, text, integer, boolean, boolean, boolean, text, text
) to service_role;

commit;
