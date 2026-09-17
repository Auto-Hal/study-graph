begin;

-- Phase 5A-1b is an additive, runtime-unused Objective opportunity foundation.
-- Historical v1 rows keep a NULL scheduling context. No current Kuzushiji
-- issuer or acceptance function is replaced by this migration.

alter table private.instance_objective_bindings
  add column scheduling_context_version integer,
  add column opportunity_kind text,
  add column expected_state_revision bigint,
  add column grade_policy_version text,
  add column activation_policy_version text,
  add column issued_at timestamptz,
  add column expires_at timestamptz,
  add column due_at_observed timestamptz;

alter table private.instance_objective_bindings
  add constraint instance_objective_bindings_scheduling_context_check
  check (
    (
      scheduling_context_version is null
      and opportunity_kind is null
      and expected_state_revision is null
      and grade_policy_version is null
      and activation_policy_version is null
      and issued_at is null
      and expires_at is null
      and due_at_observed is null
    )
    or (
      scheduling_context_version = 1
      and grade_policy_version is not null
      and length(btrim(grade_policy_version)) > 0
      and activation_policy_version is not null
      and length(btrim(activation_policy_version)) > 0
      and issued_at is not null
      and (
        (
          opportunity_kind = 'unseen'
          and evidence_use = 'srs'
          and expected_state_revision = 0
          and expires_at is not null
          and expires_at > issued_at
          and due_at_observed is null
        )
        or (
          opportunity_kind = 'due'
          and evidence_use = 'srs'
          and expected_state_revision > 0
          and expires_at is not null
          and expires_at > issued_at
        )
        or (
          opportunity_kind = 'practice'
          and evidence_use = 'practice-only'
          and expected_state_revision is null
          and expires_at is null
          and due_at_observed is null
        )
      )
    )
  );

create table private.objective_srs_opportunities (
  opportunity_id uuid primary key default extensions.gen_random_uuid(),
  instance_id uuid not null unique,
  learner_id uuid not null,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  objective_id text not null
    check (length(btrim(objective_id)) > 0),
  objective_version integer not null
    check (objective_version > 0),
  srs_epoch integer not null
    check (srs_epoch > 0),
  evidence_use text not null default 'srs'
    check (evidence_use = 'srs'),
  status text not null default 'active'
    check (status in ('active', 'terminal')),
  terminal_reason text
    check (terminal_reason is null or terminal_reason in (
      'accepted',
      'accepted-no-srs',
      'expired',
      'stale'
    )),
  created_at timestamptz not null default now(),
  terminalized_at timestamptz,
  constraint objective_srs_opportunities_lifecycle_check
    check (
      (status = 'active' and terminal_reason is null and terminalized_at is null)
      or
      (status = 'terminal' and terminal_reason is not null and terminalized_at is not null)
    ),
  constraint objective_srs_opportunities_instance_fk
    foreign key (instance_id)
    references private.exercise_instances (instance_id)
    on update restrict
    on delete restrict,
  constraint objective_srs_opportunities_attribution_fk
    foreign key (
      instance_id,
      project_id,
      objective_id,
      objective_version,
      srs_epoch,
      evidence_use
    )
    references private.instance_objective_bindings (
      instance_id,
      project_id,
      objective_id,
      objective_version,
      srs_epoch,
      evidence_use
    )
    on update restrict
    on delete restrict
);

create unique index objective_srs_opportunities_one_active_idx
  on private.objective_srs_opportunities (
    learner_id,
    project_id,
    objective_id,
    srs_epoch
  )
  where status = 'active';

create index objective_srs_opportunities_instance_idx
  on private.objective_srs_opportunities (instance_id, status);

alter table private.objective_srs_opportunities enable row level security;
revoke all on table private.objective_srs_opportunities
  from public, anon, authenticated, service_role;

-- Receipt v2 adds two terminal accepted-no-SRS reasons. The v1 RPC still
-- validates its historical reason set and continues to emit Receipt v1.
alter table private.objective_srs_applications
  drop constraint if exists objective_srs_applications_reason_check;
alter table private.objective_srs_applications
  add constraint objective_srs_applications_reason_check
  check (reason in (
    'applied',
    'grader-unavailable',
    'scope-not-eligible',
    'revision-quarantined',
    'revision-retired',
    'practice-only',
    'epoch-inactive',
    'stale-opportunity',
    'issuance-context-missing'
  ));

-- Generic v2 issuer. The trusted server supplies presentation/archive facts and
-- only an issuance intent. Objective identity, evidence use, due/unseen state,
-- expected revision, policies, and expiry are derived in the transaction.
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

  -- Revision and Objective binding are immutable archive facts. Read them
  -- before the Objective lock, but do not take mutable row locks here.
  select er.*
    into v_revision
  from private.content_release_entries cre
  join private.exercise_revisions er on er.revision_id = cre.revision_id
  where cre.release_id = p_release_id
    and cre.revision_id = p_revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'objective_archive_not_registered';
  end if;
  if v_revision.payload #>> '{status}' <> 'approved' then
    raise exception using errcode = 'P0001', message = 'revision_not_issuable';
  end if;

  select eob.*
    into v_binding
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

  -- Binding lock order: Objective authority is acquired before any mutable
  -- instance/opportunity/state row lock for the v2 path.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective|' || p_learner_id::text || '|' || v_binding.project_id
      || '|' || v_binding.objective_id || '|' || p_srs_epoch::text,
    0
  ));

  select ors.*
    into v_state
  from private.objective_review_state ors
  where ors.learner_id = p_learner_id
    and ors.project_id = v_binding.project_id
    and ors.objective_id = v_binding.objective_id
    and ors.srs_epoch = p_srs_epoch
  for update;
  v_state_found := found;

  if p_intent = 'practice' then
    v_opportunity_kind := 'practice';
    v_effective_evidence_use := 'practice-only';
    v_expected_state_revision := null;
    v_expires_at := null;
    v_due_at_observed := null;
  else
    if v_state_found and v_state.due_at > v_now then
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

    select oso.*
      into v_active
    from private.objective_srs_opportunities oso
    where oso.learner_id = p_learner_id
      and oso.project_id = v_binding.project_id
      and oso.objective_id = v_binding.objective_id
      and oso.srs_epoch = p_srs_epoch
      and oso.status = 'active'
    for update;

    if found then
      select iob.*
        into v_active_binding
      from private.instance_objective_bindings iob
      where iob.instance_id = v_active.instance_id;

      if found
        and v_active_binding.scheduling_context_version = 1
        and v_active_binding.evidence_use = 'srs'
        and v_active_binding.expires_at is not null
        and v_active_binding.expires_at > v_now
        and (
          (not v_state_found and v_active_binding.expected_state_revision = 0)
          or
          (v_state_found and v_active_binding.expected_state_revision = v_state.state_revision)
        ) then
        select ei.*
          into v_active_instance
        from private.exercise_instances ei
        where ei.instance_id = v_active.instance_id;
        if not found then
          raise exception using errcode = 'P0001', message = 'active_opportunity_instance_missing';
        end if;

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

      update private.objective_srs_opportunities oso
      set status = 'terminal',
          terminal_reason = case
            when v_active_binding.expires_at is not null and v_active_binding.expires_at <= v_now
              then 'expired'
            else 'stale'
          end,
          terminalized_at = v_now
      where oso.opportunity_id = v_active.opportunity_id
        and oso.instance_id = v_active.instance_id
        and oso.status = 'active';
    end if;
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
    srs_epoch,
    issued_at
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
    p_legacy_item_kind,
    p_legacy_exercise_id,
    'objective',
    p_srs_epoch::text,
    v_now
  );

  insert into private.instance_objective_bindings (
    instance_id,
    project_id,
    objective_id,
    objective_version,
    srs_epoch,
    evidence_use,
    scheduling_context_version,
    opportunity_kind,
    expected_state_revision,
    grade_policy_version,
    activation_policy_version,
    issued_at,
    expires_at,
    due_at_observed
  ) values (
    v_instance_id,
    v_binding.project_id,
    v_binding.objective_id,
    v_binding.objective_version,
    p_srs_epoch,
    v_effective_evidence_use,
    1,
    v_opportunity_kind,
    v_expected_state_revision,
    'deterministic-correctness-cap-v1',
    'on-publication-v1',
    v_now,
    v_expires_at,
    v_due_at_observed
  );

  if v_effective_evidence_use = 'srs' then
    insert into private.objective_srs_opportunities (
      instance_id,
      learner_id,
      project_id,
      objective_id,
      objective_version,
      srs_epoch,
      evidence_use,
      status,
      created_at
    ) values (
      v_instance_id,
      p_learner_id,
      v_binding.project_id,
      v_binding.objective_id,
      v_binding.objective_version,
      p_srs_epoch,
      'srs',
      'active',
      v_now
    );
  end if;

  return query select
    v_instance_id,
    p_release_id,
    p_revision_id,
    v_opportunity_kind,
    v_effective_evidence_use,
    v_expected_state_revision,
    v_now,
    v_expires_at,
    false;
end;
$$;

-- Generic v2 acceptance RPC. It intentionally receives grading/scope facts,
-- not an SRS plan. The database computes the authoritative application reason
-- and deterministic effective grade from immutable issuance context.
create or replace function public.study_graph_record_objective_attempt_v2(
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
  p_response_ms integer,
  p_used_hint boolean,
  p_scope_accepted boolean,
  p_epoch_active boolean
)
returns table(receipt jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instance_binding private.instance_objective_bindings%rowtype;
  v_instance private.exercise_instances%rowtype;
  v_revision private.exercise_revisions%rowtype;
  v_opportunity private.objective_srs_opportunities%rowtype;
  v_state private.objective_review_state%rowtype;
  v_state_found boolean := false;
  v_existing_request_hash text;
  v_existing_attempt_instance_id uuid;
  v_existing_attempt_learner_id uuid;
  v_existing_application private.objective_srs_applications%rowtype;
  v_existing_instance_attempt_id uuid;
  v_revision_status text;
  v_expected_strategy_id text;
  v_expected_strategy_version text;
  v_expected_normalizer_version text;
  v_reason text;
  v_effective_grade text;
  v_srs_applied boolean := false;
  v_context_trustworthy boolean := false;
  v_expected_matches boolean := false;
  v_active_opportunity_matches boolean := false;
  v_previous_interval integer := 0;
  v_previous_repetitions integer := 0;
  v_interval integer := 0;
  v_repetitions integer := 0;
  v_due_at timestamptz;
  v_state_revision bigint;
  v_state_before jsonb;
  v_state_after jsonb;
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
    or p_used_hint is null
    or p_scope_accepted is null
    or p_epoch_active is null then
    raise exception using errcode = '22023', message = 'invalid_objective_v2_submission';
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
  if p_response_ms is not null and (p_response_ms < 0 or p_response_ms > 3600000) then
    raise exception using errcode = '22023', message = 'invalid_response_time';
  end if;

  -- v2 binding lock order begins with request identity.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective-v2-attempt|' || p_attempt_id::text,
    0
  ));

  select ea.request_hash, ea.instance_id, ea.learner_id
    into v_existing_request_hash, v_existing_attempt_instance_id, v_existing_attempt_learner_id
  from private.exercise_attempts ea
  where ea.attempt_id = p_attempt_id;
  if found then
    if v_existing_attempt_instance_id <> p_instance_id
      or v_existing_attempt_learner_id <> p_learner_id
      or v_existing_request_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'attempt_conflict';
    end if;
    select osa.*
      into v_existing_application
    from private.objective_srs_applications osa
    where osa.attempt_id = p_attempt_id;
    if not found or v_existing_application.receipt #>> '{receiptVersion}' <> '2' then
      raise exception using errcode = 'P0001', message = 'attempt_not_objective_v2';
    end if;
    return query select v_existing_application.receipt;
    return;
  end if;

  -- Immutable attribution is read without a mutable row lock only to derive
  -- the Objective key. Historical rows with NULL context remain readable.
  select iob.*
    into v_instance_binding
  from private.instance_objective_bindings iob
  where iob.instance_id = p_instance_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'instance_objective_binding_not_found';
  end if;

  select ei.*
    into v_instance
  from private.exercise_instances ei
  where ei.instance_id = p_instance_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'instance_not_found';
  end if;
  if v_instance.learner_id <> p_learner_id then
    raise exception using errcode = 'P0001', message = 'learner_mismatch';
  end if;

  -- Binding lock order: request identity -> Objective advisory lock -> mutable
  -- instance/opportunity/state rows. Do not move an instance FOR UPDATE above it.
  perform pg_advisory_xact_lock(hashtextextended(
    'objective|' || p_learner_id::text || '|' || v_instance_binding.project_id
      || '|' || v_instance_binding.objective_id || '|' || v_instance_binding.srs_epoch::text,
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

  select oso.*
    into v_opportunity
  from private.objective_srs_opportunities oso
  where oso.instance_id = p_instance_id
  for update;

  select ors.*
    into v_state
  from private.objective_review_state ors
  where ors.learner_id = p_learner_id
    and ors.project_id = v_instance_binding.project_id
    and ors.objective_id = v_instance_binding.objective_id
    and ors.srs_epoch = v_instance_binding.srs_epoch
  for update;
  v_state_found := found;

  select ea.attempt_id
    into v_existing_instance_attempt_id
  from private.exercise_attempts ea
  where ea.instance_id = p_instance_id
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'instance_already_answered';
  end if;

  select er.*
    into v_revision
  from private.exercise_revisions er
  where er.revision_id = v_instance.revision_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'revision_not_found';
  end if;
  if v_instance_binding.project_id <> v_revision.project_id then
    raise exception using errcode = 'P0001', message = 'instance_objective_project_mismatch';
  end if;

  v_revision_status := v_revision.payload #>> '{status}';
  if v_revision_status is null or v_revision_status not in ('approved', 'quarantined', 'retired') then
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

  v_context_trustworthy :=
    v_instance_binding.scheduling_context_version = 1
    and v_instance_binding.opportunity_kind in ('unseen', 'due', 'practice')
    and v_instance_binding.grade_policy_version = 'deterministic-correctness-cap-v1'
    and v_instance_binding.activation_policy_version = 'on-publication-v1'
    and v_instance_binding.issued_at is not null;

  if p_grading_status = 'graded' then
    if p_is_correct = false then
      v_effective_grade := 'again';
    elsif p_is_correct = true and p_self_evaluation is not null then
      v_effective_grade := p_self_evaluation;
    else
      v_effective_grade := null;
    end if;
  else
    v_effective_grade := null;
  end if;

  if v_context_trustworthy and v_instance_binding.evidence_use = 'srs' then
    v_expected_matches :=
      (v_instance_binding.expected_state_revision = 0 and not v_state_found)
      or
      (v_instance_binding.expected_state_revision > 0
        and v_state_found
        and v_state.state_revision = v_instance_binding.expected_state_revision);

    v_active_opportunity_matches :=
      v_opportunity.opportunity_id is not null
      and v_opportunity.status = 'active'
      and v_opportunity.instance_id = p_instance_id
      and v_opportunity.learner_id = p_learner_id
      and v_opportunity.project_id = v_instance_binding.project_id
      and v_opportunity.objective_id = v_instance_binding.objective_id
      and v_opportunity.srs_epoch = v_instance_binding.srs_epoch
      and v_instance_binding.expires_at is not null
      and v_instance_binding.expires_at > v_now;
  end if;

  -- DB chooses one authoritative application reason from server grading/scope
  -- facts plus immutable issuance and current opportunity/state authority.
  if v_revision_status = 'quarantined' then
    v_reason := 'revision-quarantined';
  elsif v_revision_status = 'retired' then
    v_reason := 'revision-retired';
  elsif not v_context_trustworthy then
    v_reason := 'issuance-context-missing';
  elsif v_instance_binding.evidence_use = 'practice-only' then
    v_reason := 'practice-only';
  elsif not p_scope_accepted then
    v_reason := 'scope-not-eligible';
  elsif not p_epoch_active then
    v_reason := 'epoch-inactive';
  elsif p_grading_status <> 'graded' or v_effective_grade is null then
    v_reason := 'grader-unavailable';
  elsif not v_expected_matches or not v_active_opportunity_matches then
    v_reason := 'stale-opportunity';
  else
    v_reason := 'applied';
  end if;

  v_srs_applied := v_reason = 'applied';

  if v_srs_applied then
    v_previous_interval := case when v_state_found then v_state.interval_days else 0 end;
    v_previous_repetitions := case when v_state_found then v_state.repetitions else 0 end;
    if v_state_found then
      v_state_before := to_jsonb(v_state);
    end if;

    case v_effective_grade
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

    v_state_revision := case when v_state_found then v_state.state_revision + 1 else 1 end;

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
      v_effective_grade,
      v_repetitions,
      v_interval,
      v_now,
      v_due_at,
      'objective-four-grade-v1',
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
      and ors.srs_epoch = v_instance_binding.srs_epoch;
    v_state_after := to_jsonb(v_state);
  end if;

  -- The exact instance-owned opportunity is terminalized. A newer opportunity
  -- can never be closed by this update because instance_id is part of it.
  if v_opportunity.opportunity_id is not null and v_opportunity.status = 'active' then
    update private.objective_srs_opportunities oso
    set status = 'terminal',
        terminal_reason = case
          when v_srs_applied then 'accepted'
          when v_reason = 'stale-opportunity' then 'stale'
          else 'accepted-no-srs'
        end,
        terminalized_at = v_now
    where oso.opportunity_id = v_opportunity.opportunity_id
      and oso.instance_id = p_instance_id
      and oso.status = 'active';
  end if;

  v_private_srs_reason := case
    when v_reason in ('applied', 'grader-unavailable', 'scope-not-eligible', 'revision-quarantined')
      then v_reason
    else 'scope-not-eligible'
  end;

  v_receipt := jsonb_build_object(
    'receiptVersion', 2,
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
    'applied', v_srs_applied,
    'reason', v_reason,
    'effectiveGrade', case when v_srs_applied then v_effective_grade else null end,
    'stateRevision', case when v_srs_applied then v_state_revision else null end,
    'dueAt', case when v_srs_applied then v_due_at else null end
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
    case when v_srs_applied then v_effective_grade else null end,
    p_response_ms,
    p_used_hint,
    p_scope_accepted,
    v_srs_applied,
    v_private_srs_reason,
    case when v_srs_applied then 'objective-four-grade-v1' else null end,
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
    v_srs_applied,
    v_reason,
    case when v_srs_applied then v_effective_grade else null end,
    case when v_srs_applied then 'objective-four-grade-v1' else null end,
    v_state_before,
    v_state_after,
    v_receipt,
    v_now
  );

  return query select v_receipt;
end;
$$;

-- SECURITY DEFINER functions are private service-role RPCs. Revoke the
-- Postgres/Supabase default EXECUTE surface before granting the intended role.
revoke execute on function public.study_graph_issue_objective_instance_v2(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb,
  text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_issue_objective_instance_v2(
  uuid, text, uuid, jsonb, text, text, text, text, jsonb, jsonb,
  text, text, text, integer, text
) to service_role;

revoke execute on function public.study_graph_record_objective_attempt_v2(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer,
  text, boolean, text, integer, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_record_objective_attempt_v2(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer,
  text, boolean, text, integer, boolean, boolean, boolean
) to service_role;

commit;
