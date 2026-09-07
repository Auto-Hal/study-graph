begin;

-- Phase 4D-2 is an additive Objective SRS foundation.  These tables are
-- intentionally separate from public.review_attempts/review_state: the
-- legacy path remains the only writer for those tables until a later cutover.

create table private.objective_definitions (
  project_id text not null
    check (length(btrim(project_id)) > 0),
  objective_id text not null
    check (length(btrim(objective_id)) > 0),
  objective_version integer not null
    check (objective_version > 0),
  canonicalization_version integer not null
    check (canonicalization_version > 0),
  canonical_payload text not null
    check (length(canonical_payload) > 0),
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (project_id, objective_id, objective_version),
  constraint objective_definitions_content_hash_key unique (content_hash)
);

create table private.exercise_objective_bindings (
  binding_id uuid primary key default extensions.gen_random_uuid(),
  revision_id uuid not null unique,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  objective_id text not null
    check (length(btrim(objective_id)) > 0),
  objective_version integer not null
    check (objective_version > 0),
  evidence_use text not null
    check (evidence_use in ('srs', 'practice-only')),
  created_at timestamptz not null default now(),
  constraint exercise_objective_bindings_revision_fk
    foreign key (revision_id)
    references private.exercise_revisions (revision_id)
    on update restrict
    on delete restrict,
  constraint exercise_objective_bindings_objective_fk
    foreign key (project_id, objective_id, objective_version)
    references private.objective_definitions (project_id, objective_id, objective_version)
    on update restrict
    on delete restrict
);

create index exercise_objective_bindings_objective_idx
  on private.exercise_objective_bindings (project_id, objective_id, objective_version);

create table private.instance_objective_bindings (
  instance_id uuid primary key,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  objective_id text not null
    check (length(btrim(objective_id)) > 0),
  objective_version integer not null
    check (objective_version > 0),
  srs_epoch integer not null
    check (srs_epoch > 0),
  evidence_use text not null
    check (evidence_use in ('srs', 'practice-only')),
  created_at timestamptz not null default now(),
  constraint instance_objective_bindings_instance_fk
    foreign key (instance_id)
    references private.exercise_instances (instance_id)
    on update restrict
    on delete restrict,
  constraint instance_objective_bindings_objective_fk
    foreign key (project_id, objective_id, objective_version)
    references private.objective_definitions (project_id, objective_id, objective_version)
    on update restrict
    on delete restrict,
  constraint instance_objective_bindings_attribution_key
    unique (instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use)
);

create index instance_objective_bindings_objective_idx
  on private.instance_objective_bindings (project_id, objective_id, objective_version, srs_epoch);

-- ObjectiveVersion is semantic attribution, not part of the SRS state key.
create table private.objective_review_state (
  learner_id uuid not null,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  objective_id text not null
    check (length(btrim(objective_id)) > 0),
  srs_epoch integer not null
    check (srs_epoch > 0),
  last_grade text not null
    check (last_grade in ('again', 'hard', 'good', 'easy')),
  repetitions integer not null
    check (repetitions >= 0),
  interval_days integer not null
    check (interval_days >= 0),
  last_reviewed_at timestamptz not null,
  due_at timestamptz not null,
  scheduler_version text not null
    check (length(btrim(scheduler_version)) > 0),
  state_revision bigint not null default 1
    check (state_revision > 0),
  last_application_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner_id, project_id, objective_id, srs_epoch)
);

create index objective_review_state_due_at_idx
  on private.objective_review_state (learner_id, due_at);

create table private.objective_srs_applications (
  application_id uuid primary key default extensions.gen_random_uuid(),
  attempt_id uuid not null unique,
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
  evidence_use text not null
    check (evidence_use in ('srs', 'practice-only')),
  applied boolean not null,
  reason text not null
    check (reason in (
      'applied',
      'grader-unavailable',
      'scope-not-eligible',
      'revision-quarantined',
      'revision-retired',
      'practice-only',
      'epoch-inactive'
    )),
  effective_grade text
    check (effective_grade is null or effective_grade in ('again', 'hard', 'good', 'easy')),
  scheduler_version text,
  state_before jsonb,
  state_after jsonb,
  receipt jsonb not null
    check (jsonb_typeof(receipt) = 'object'),
  created_at timestamptz not null default now(),
  constraint objective_srs_applications_attempt_fk
    foreign key (attempt_id)
    references private.exercise_attempts (attempt_id)
    on update restrict
    on delete restrict,
  constraint objective_srs_applications_instance_fk
    foreign key (instance_id)
    references private.exercise_instances (instance_id)
    on update restrict
    on delete restrict,
  constraint objective_srs_applications_objective_fk
    foreign key (project_id, objective_id, objective_version)
    references private.objective_definitions (project_id, objective_id, objective_version)
    on update restrict
    on delete restrict,
  constraint objective_srs_applications_attribution_fk
    foreign key (instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use)
    references private.instance_objective_bindings (
      instance_id, project_id, objective_id, objective_version, srs_epoch, evidence_use
    )
    on update restrict
    on delete restrict,
  constraint objective_srs_applications_plan_check
    check (
      (
        applied = true
        and reason = 'applied'
        and effective_grade is not null
        and scheduler_version is not null
        and length(btrim(scheduler_version)) > 0
        and state_after is not null
      )
      or (
        applied = false
        and reason <> 'applied'
        and effective_grade is null
        and state_before is null
        and state_after is null
      )
    )
);

create index objective_srs_applications_instance_idx
  on private.objective_srs_applications (instance_id);
create index objective_srs_applications_objective_idx
  on private.objective_srs_applications (learner_id, project_id, objective_id, srs_epoch, created_at desc);

-- Phase 4C-2 owns this trigger function.  Objective definitions, bindings,
-- attributions, and applications reuse it; objective_review_state is the one
-- deliberately mutable table.
create trigger objective_definitions_immutable
before update or delete on private.objective_definitions
for each row execute function private.study_graph_archive_row_is_immutable();

create trigger exercise_objective_bindings_immutable
before update or delete on private.exercise_objective_bindings
for each row execute function private.study_graph_archive_row_is_immutable();

create trigger instance_objective_bindings_immutable
before update or delete on private.instance_objective_bindings
for each row execute function private.study_graph_archive_row_is_immutable();

create trigger objective_srs_applications_immutable
before update or delete on private.objective_srs_applications
for each row execute function private.study_graph_archive_row_is_immutable();

alter table private.objective_definitions enable row level security;
alter table private.exercise_objective_bindings enable row level security;
alter table private.instance_objective_bindings enable row level security;
alter table private.objective_review_state enable row level security;
alter table private.objective_srs_applications enable row level security;

revoke all on table private.objective_definitions from public, anon, authenticated, service_role;
revoke all on table private.exercise_objective_bindings from public, anon, authenticated, service_role;
revoke all on table private.instance_objective_bindings from public, anon, authenticated, service_role;
revoke all on table private.objective_review_state from public, anon, authenticated, service_role;
revoke all on table private.objective_srs_applications from public, anon, authenticated, service_role;

-- Register one immutable Git-owned Objective definition.  The Node
-- canonicalization/hash is authoritative; this function stores, but never
-- recomputes, the explicit canonical payload and content hash.
create or replace function public.study_graph_register_objective_definition(
  p_project_id text,
  p_objective_id text,
  p_objective_version integer,
  p_canonicalization_version integer,
  p_canonical_payload text,
  p_content_hash text,
  p_payload jsonb
)
returns table(
  project_id text,
  objective_id text,
  objective_version integer,
  content_hash text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing private.objective_definitions%rowtype;
begin
  if p_project_id is null or length(btrim(p_project_id)) = 0
    or p_objective_id is null or length(btrim(p_objective_id)) = 0
    or p_objective_version is null or p_objective_version <= 0
    or p_canonicalization_version is null or p_canonicalization_version <= 0
    or p_canonical_payload is null or length(p_canonical_payload) = 0
    or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$'
    or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_objective_definition';
  end if;
  if p_payload #>> '{projectId}' is distinct from p_project_id
    or p_payload #>> '{objectiveId}' is distinct from p_objective_id
    or p_payload #>> '{objectiveVersion}' is distinct from p_objective_version::text then
    raise exception using errcode = 'P0001', message = 'objective_payload_identity_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'objective-definition|' || p_project_id || '|' || p_objective_id || '|' || p_objective_version::text,
    0
  ));

  select od.*
    into v_existing
  from private.objective_definitions od
  where od.project_id = p_project_id
    and od.objective_id = p_objective_id
    and od.objective_version = p_objective_version
  for update;
  if found then
    if v_existing.canonicalization_version <> p_canonicalization_version
      or v_existing.canonical_payload <> p_canonical_payload
      or v_existing.content_hash <> p_content_hash
      or v_existing.payload <> p_payload then
      raise exception using errcode = 'P0001', message = 'objective_archive_conflict';
    end if;
    return query select v_existing.project_id, v_existing.objective_id,
      v_existing.objective_version, v_existing.content_hash;
    return;
  end if;

  if exists (
    select 1
    from private.objective_definitions od
    where od.content_hash = p_content_hash
  ) then
    raise exception using errcode = 'P0001', message = 'objective_content_hash_conflict';
  end if;

  insert into private.objective_definitions (
    project_id,
    objective_id,
    objective_version,
    canonicalization_version,
    canonical_payload,
    content_hash,
    payload
  ) values (
    p_project_id,
    p_objective_id,
    p_objective_version,
    p_canonicalization_version,
    p_canonical_payload,
    p_content_hash,
    p_payload
  );

  return query select p_project_id, p_objective_id, p_objective_version, p_content_hash;
end;
$$;

-- Resolve the Git content hash to the UUID generated by the 4C archive.  The
-- UUID is never supplied by Git and never inferred from the content hash.
create or replace function public.study_graph_register_exercise_objective_binding(
  p_revision_content_hash text,
  p_project_id text,
  p_objective_id text,
  p_objective_version integer,
  p_evidence_use text
)
returns table(
  binding_id uuid,
  revision_id uuid,
  project_id text,
  objective_id text,
  objective_version integer,
  evidence_use text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_revision private.exercise_revisions%rowtype;
  v_revision_count integer;
  v_objective private.objective_definitions%rowtype;
  v_existing private.exercise_objective_bindings%rowtype;
  v_binding_id uuid;
begin
  if p_revision_content_hash is null or p_revision_content_hash !~ '^[0-9a-f]{64}$'
    or p_project_id is null or length(btrim(p_project_id)) = 0
    or p_objective_id is null or length(btrim(p_objective_id)) = 0
    or p_objective_version is null or p_objective_version <= 0
    or p_evidence_use is null
    or p_evidence_use not in ('srs', 'practice-only') then
    raise exception using errcode = '22023', message = 'invalid_exercise_objective_binding';
  end if;

  select count(*)::integer
    into v_revision_count
  from private.exercise_revisions er
  where er.project_id = p_project_id
    and er.content_hash = p_revision_content_hash;
  if v_revision_count = 0 then
    raise exception using errcode = 'P0001', message = 'revision_content_hash_not_found';
  elsif v_revision_count > 1 then
    raise exception using errcode = 'P0001', message = 'revision_content_hash_ambiguous';
  end if;

  select er.*
    into v_revision
  from private.exercise_revisions er
  where er.project_id = p_project_id
    and er.content_hash = p_revision_content_hash
  for update;

  select od.*
    into v_objective
  from private.objective_definitions od
  where od.project_id = p_project_id
    and od.objective_id = p_objective_id
    and od.objective_version = p_objective_version
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'objective_definition_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'exercise-objective-binding|' || v_revision.revision_id::text,
    0
  ));
  select eob.*
    into v_existing
  from private.exercise_objective_bindings eob
  where eob.revision_id = v_revision.revision_id
  for update;
  if found then
    if v_existing.project_id <> p_project_id
      or v_existing.objective_id <> p_objective_id
      or v_existing.objective_version <> p_objective_version
      or v_existing.evidence_use <> p_evidence_use then
      raise exception using errcode = 'P0001', message = 'exercise_objective_binding_conflict';
    end if;
    return query select v_existing.binding_id, v_existing.revision_id,
      v_existing.project_id, v_existing.objective_id,
      v_existing.objective_version, v_existing.evidence_use;
    return;
  end if;

  insert into private.exercise_objective_bindings (
    revision_id,
    project_id,
    objective_id,
    objective_version,
    evidence_use
  ) values (
    v_revision.revision_id,
    p_project_id,
    p_objective_id,
    p_objective_version,
    p_evidence_use
  ) returning binding_id into v_binding_id;

  return query select v_binding_id, v_revision.revision_id,
    p_project_id, p_objective_id, p_objective_version, p_evidence_use;
end;
$$;

-- Pin an Objective attribution on an already-issued immutable instance.  This
-- is a service-only registration boundary for a future issuer; Phase 4D-2
-- does not backfill Phase 4C instances or connect the runtime.
create or replace function public.study_graph_register_instance_objective_binding(
  p_instance_id uuid,
  p_project_id text,
  p_objective_id text,
  p_objective_version integer,
  p_srs_epoch integer,
  p_evidence_use text
)
returns table(
  instance_id uuid,
  project_id text,
  objective_id text,
  objective_version integer,
  srs_epoch integer,
  evidence_use text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_instance private.exercise_instances%rowtype;
  v_revision_binding private.exercise_objective_bindings%rowtype;
  v_existing private.instance_objective_bindings%rowtype;
begin
  if p_instance_id is null
    or p_project_id is null or length(btrim(p_project_id)) = 0
    or p_objective_id is null or length(btrim(p_objective_id)) = 0
    or p_objective_version is null or p_objective_version <= 0
    or p_srs_epoch is null or p_srs_epoch <= 0
    or p_evidence_use is null
    or p_evidence_use not in ('srs', 'practice-only') then
    raise exception using errcode = '22023', message = 'invalid_instance_objective_binding';
  end if;

  select ei.*
    into v_instance
  from private.exercise_instances ei
  where ei.instance_id = p_instance_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'instance_not_found';
  end if;

  if not exists (
    select 1
    from private.objective_definitions od
    where od.project_id = p_project_id
      and od.objective_id = p_objective_id
      and od.objective_version = p_objective_version
  ) then
    raise exception using errcode = 'P0001', message = 'objective_definition_not_found';
  end if;

  select eob.*
    into v_revision_binding
  from private.exercise_objective_bindings eob
  where eob.revision_id = v_instance.revision_id
    and eob.project_id = p_project_id
    and eob.objective_id = p_objective_id
    and eob.objective_version = p_objective_version
    and eob.evidence_use = p_evidence_use
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'revision_objective_binding_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'instance-objective-binding|' || p_instance_id::text,
    0
  ));
  select iob.*
    into v_existing
  from private.instance_objective_bindings iob
  where iob.instance_id = p_instance_id
  for update;
  if found then
    if v_existing.project_id <> p_project_id
      or v_existing.objective_id <> p_objective_id
      or v_existing.objective_version <> p_objective_version
      or v_existing.srs_epoch <> p_srs_epoch
      or v_existing.evidence_use <> p_evidence_use then
      raise exception using errcode = 'P0001', message = 'instance_objective_binding_conflict';
    end if;
    return query select v_existing.instance_id, v_existing.project_id,
      v_existing.objective_id, v_existing.objective_version,
      v_existing.srs_epoch, v_existing.evidence_use;
    return;
  end if;

  insert into private.instance_objective_bindings (
    instance_id,
    project_id,
    objective_id,
    objective_version,
    srs_epoch,
    evidence_use
  ) values (
    p_instance_id,
    p_project_id,
    p_objective_id,
    p_objective_version,
    p_srs_epoch,
    p_evidence_use
  );

  return query select p_instance_id, p_project_id, p_objective_id,
    p_objective_version, p_srs_epoch, p_evidence_use;
end;
$$;

-- Objective-only attempt persistence.  The caller is a trusted server-side
-- grading/planning layer.  Objective identity, version, epoch, and evidence
-- are always read from the immutable instance attribution, never from input.
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
    or p_raw_answer is null or jsonb_typeof(p_raw_answer) <> 'object'
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

  select ea.request_hash, ea.receipt
    into v_existing_request_hash, v_existing_receipt
  from private.exercise_attempts ea
  where ea.attempt_id = p_attempt_id
  for update;
  if found then
    if v_existing_request_hash <> p_request_hash then
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
    v_state_before := to_jsonb(v_state);
    v_previous_interval := v_state.interval_days;
    v_previous_repetitions := v_state.repetitions;
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

revoke all on function public.study_graph_register_objective_definition(
  text, text, integer, integer, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_objective_definition(
  text, text, integer, integer, text, text, jsonb
) to service_role;

revoke all on function public.study_graph_register_exercise_objective_binding(
  text, text, text, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_exercise_objective_binding(
  text, text, text, integer, text
) to service_role;

revoke all on function public.study_graph_register_instance_objective_binding(
  uuid, text, text, integer, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_register_instance_objective_binding(
  uuid, text, text, integer, integer, text
) to service_role;

revoke all on function public.study_graph_record_objective_attempt(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer, text,
  boolean, text, text, integer, boolean, boolean, boolean, boolean, boolean, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_record_objective_attempt(
  uuid, uuid, uuid, text, jsonb, jsonb, text, text, text, integer, text,
  boolean, text, text, integer, boolean, boolean, boolean, boolean, boolean, text, text
) to service_role;

commit;
