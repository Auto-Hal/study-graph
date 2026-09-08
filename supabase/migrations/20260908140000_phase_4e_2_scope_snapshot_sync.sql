begin;

-- Phase 4E-2 archives the strict server projection separately from the live
-- Review/SRS tables.  No existing history is altered or backfilled.
create table private.scope_knowledge_snapshots (
  snapshot_id uuid primary key,
  project_id text not null
    check (length(btrim(project_id)) > 0),
  generation bigint not null
    check (generation > 0),
  schema_version integer not null
    check (schema_version > 0),
  source_read_started_at timestamptz not null,
  source_read_completed_at timestamptz not null,
  published_at timestamptz not null,
  valid_until timestamptz not null,
  scope_policy_version text not null
    check (length(btrim(scope_policy_version)) > 0),
  knowledge_projection_version text not null
    check (length(btrim(knowledge_projection_version)) > 0),
  source_evidence jsonb not null
    check (jsonb_typeof(source_evidence) = 'object'),
  scope_decisions jsonb not null
    check (jsonb_typeof(scope_decisions) = 'array'),
  knowledge_projection jsonb not null,
  content_hash text not null
    check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint scope_knowledge_snapshots_project_generation_key
    unique (project_id, generation)
);

create table private.project_snapshot_sync_state (
  project_id text primary key
    check (length(btrim(project_id)) > 0),
  current_snapshot_id uuid null,
  current_generation bigint not null default 0
    check (current_generation >= 0),
  next_generation bigint not null default 1
    check (next_generation > 0),
  active_run_id uuid null,
  active_generation bigint null
    check (active_generation is null or active_generation > 0),
  active_started_at timestamptz null,
  active_lease_until timestamptz null,
  last_attempted_at timestamptz null,
  last_succeeded_at timestamptz null,
  last_failed_at timestamptz null,
  last_error_code text null,
  last_error_detail text null,
  updated_at timestamptz not null default now(),
  constraint project_snapshot_sync_generation_cursor_check
    check (next_generation > current_generation),
  constraint project_snapshot_sync_current_snapshot_fk
    foreign key (current_snapshot_id)
    references private.scope_knowledge_snapshots (snapshot_id)
    on update restrict
    on delete restrict
);

create index project_snapshot_sync_current_snapshot_id_idx
  on private.project_snapshot_sync_state (current_snapshot_id);

-- Snapshot rows are archive records. The existing guard rejects UPDATE and
-- DELETE while allowing the future server-side publish path to INSERT.
create trigger scope_knowledge_snapshots_immutable
before update or delete on private.scope_knowledge_snapshots
for each row execute function private.study_graph_archive_row_is_immutable();

alter table private.scope_knowledge_snapshots enable row level security;
alter table private.project_snapshot_sync_state enable row level security;

-- Keep both schema and tables unavailable to browser roles. SECURITY DEFINER
-- RPCs below are the only intended server coordination boundary.
revoke usage on schema private from public, anon, authenticated;
revoke all on table private.scope_knowledge_snapshots from public, anon, authenticated, service_role;
revoke all on table private.project_snapshot_sync_state from public, anon, authenticated, service_role;

-- Begin a project-serialized sync run and reserve its monotonic generation.
create or replace function public.study_graph_begin_scope_snapshot_sync(
  p_project_id text,
  p_run_id uuid
)
returns table(project_id text, run_id uuid, generation bigint, lease_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state private.project_snapshot_sync_state%rowtype;
  v_now timestamptz := clock_timestamp();
  v_generation bigint;
  v_lease_until timestamptz;
begin
  if p_project_id is null or length(btrim(p_project_id)) = 0 or p_run_id is null then
    raise exception using errcode = '22023', message = 'invalid_snapshot_sync_run';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('scope-sync|' || p_project_id, 0));

  insert into private.project_snapshot_sync_state (project_id)
  values (p_project_id)
  on conflict (project_id) do nothing;

  select s.*
    into v_state
  from private.project_snapshot_sync_state s
  where s.project_id = p_project_id
  for update;

  if v_state.active_run_id is not null
    and v_state.active_lease_until is not null
    and v_state.active_lease_until > v_now then
    if v_state.active_run_id = p_run_id then
      return query select p_project_id, p_run_id,
        v_state.active_generation, v_state.active_lease_until;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'snapshot_sync_in_progress';
  end if;

  if v_state.active_run_id is not null then
    update private.project_snapshot_sync_state
    set active_run_id = null,
        active_generation = null,
        active_started_at = null,
        active_lease_until = null,
        last_failed_at = v_now,
        last_error_code = 'snapshot_sync_lease_expired',
        last_error_detail = 'previous sync lease expired before completion',
        updated_at = v_now
    where project_id = p_project_id;
  end if;

  v_generation := greatest(v_state.next_generation, v_state.current_generation + 1, 1);
  v_lease_until := v_now + interval '15 minutes';
  update private.project_snapshot_sync_state
  set next_generation = v_generation + 1,
      active_run_id = p_run_id,
      active_generation = v_generation,
      active_started_at = v_now,
      active_lease_until = v_lease_until,
      last_attempted_at = v_now,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where project_id = p_project_id;

  return query select p_project_id, p_run_id, v_generation, v_lease_until;
end;
$$;

-- Publish only a complete, hash-shaped snapshot belonging to the active run.
-- The Node canonicalization/hash remains the authority; the database stores
-- the explicit hash and payload but deliberately does not recompute it.
create or replace function public.study_graph_publish_scope_knowledge_snapshot(
  p_snapshot_id uuid,
  p_project_id text,
  p_run_id uuid,
  p_generation bigint,
  p_schema_version integer,
  p_source_read_started_at timestamptz,
  p_source_read_completed_at timestamptz,
  p_published_at timestamptz,
  p_valid_until timestamptz,
  p_scope_policy_version text,
  p_knowledge_projection_version text,
  p_source_evidence jsonb,
  p_scope_decisions jsonb,
  p_knowledge_projection jsonb,
  p_content_hash text
)
returns table(snapshot_id uuid, project_id text, generation bigint, content_hash text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state private.project_snapshot_sync_state%rowtype;
  v_existing private.scope_knowledge_snapshots%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_snapshot_id is null
    or p_project_id is null or length(btrim(p_project_id)) = 0
    or p_run_id is null
    or p_generation is null or p_generation <= 0
    or p_schema_version is null or p_schema_version <> 1
    or p_source_read_started_at is null
    or p_source_read_completed_at is null
    or p_published_at is null
    or p_valid_until is null
    or p_scope_policy_version is null or length(btrim(p_scope_policy_version)) = 0
    or p_knowledge_projection_version is null or length(btrim(p_knowledge_projection_version)) = 0
    or p_source_evidence is null or jsonb_typeof(p_source_evidence) <> 'object'
    or p_scope_decisions is null or jsonb_typeof(p_scope_decisions) <> 'array'
    or p_knowledge_projection is null
    or p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_scope_snapshot';
  end if;
  if (p_source_evidence ->> 'paginationComplete') is distinct from 'true'
    or (p_source_evidence ->> 'relationCompleteness') is distinct from 'true' then
    raise exception using errcode = 'P0001', message = 'snapshot_evidence_incomplete';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('scope-sync|' || p_project_id, 0));

  -- A lost response may retry after commit. Return the exact existing row if
  -- the generation payload is byte-for-byte equivalent at the JSON level.
  select s.*
    into v_existing
  from private.scope_knowledge_snapshots s
  where s.project_id = p_project_id
    and s.generation = p_generation
  for update;
  if found then
    if v_existing.snapshot_id <> p_snapshot_id
      or v_existing.schema_version <> p_schema_version
      or v_existing.source_read_started_at <> p_source_read_started_at
      or v_existing.source_read_completed_at <> p_source_read_completed_at
      or v_existing.published_at <> p_published_at
      or v_existing.valid_until <> p_valid_until
      or v_existing.scope_policy_version <> p_scope_policy_version
      or v_existing.knowledge_projection_version <> p_knowledge_projection_version
      or v_existing.source_evidence <> p_source_evidence
      or v_existing.scope_decisions <> p_scope_decisions
      or v_existing.knowledge_projection <> p_knowledge_projection
      or v_existing.content_hash <> p_content_hash then
      raise exception using errcode = 'P0001', message = 'snapshot_publish_conflict';
    end if;
    return query select v_existing.snapshot_id, v_existing.project_id,
      v_existing.generation, v_existing.content_hash;
    return;
  end if;

  select s.*
    into v_state
  from private.project_snapshot_sync_state s
  where s.project_id = p_project_id
  for update;
  if not found
    or v_state.active_run_id is distinct from p_run_id
    or v_state.active_generation is distinct from p_generation then
    raise exception using errcode = 'P0001', message = 'snapshot_run_mismatch';
  end if;
  if v_state.active_lease_until is null or v_state.active_lease_until <= v_now then
    raise exception using errcode = 'P0001', message = 'snapshot_sync_lease_expired';
  end if;
  if p_generation <= v_state.current_generation then
    raise exception using errcode = 'P0001', message = 'snapshot_publish_stale';
  end if;

  insert into private.scope_knowledge_snapshots (
    snapshot_id,
    project_id,
    generation,
    schema_version,
    source_read_started_at,
    source_read_completed_at,
    published_at,
    valid_until,
    scope_policy_version,
    knowledge_projection_version,
    source_evidence,
    scope_decisions,
    knowledge_projection,
    content_hash
  ) values (
    p_snapshot_id,
    p_project_id,
    p_generation,
    p_schema_version,
    p_source_read_started_at,
    p_source_read_completed_at,
    p_published_at,
    p_valid_until,
    p_scope_policy_version,
    p_knowledge_projection_version,
    p_source_evidence,
    p_scope_decisions,
    p_knowledge_projection,
    p_content_hash
  );

  update private.project_snapshot_sync_state
  set current_snapshot_id = p_snapshot_id,
      current_generation = p_generation,
      active_run_id = null,
      active_generation = null,
      active_started_at = null,
      active_lease_until = null,
      last_succeeded_at = v_now,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where project_id = p_project_id;

  return query select p_snapshot_id, p_project_id, p_generation, p_content_hash;
end;
$$;

-- Record health only while this run still owns the active lease. A late
-- failure from an older run cannot overwrite a newer run's status.
create or replace function public.study_graph_fail_scope_snapshot_sync(
  p_project_id text,
  p_run_id uuid,
  p_error_code text,
  p_error_detail text
)
returns table(project_id text, run_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state private.project_snapshot_sync_state%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_project_id is null or length(btrim(p_project_id)) = 0
    or p_run_id is null
    or p_error_code is null or length(btrim(p_error_code)) = 0
    or length(p_error_code) > 120
    or p_error_detail is null or length(p_error_detail) > 500 then
    raise exception using errcode = '22023', message = 'invalid_snapshot_sync_failure';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scope-sync|' || p_project_id, 0));
  select s.*
    into v_state
  from private.project_snapshot_sync_state s
  where s.project_id = p_project_id
  for update;
  if not found or v_state.active_run_id is distinct from p_run_id then
    return query select p_project_id, p_run_id, false;
    return;
  end if;
  update private.project_snapshot_sync_state
  set active_run_id = null,
      active_generation = null,
      active_started_at = null,
      active_lease_until = null,
      last_failed_at = v_now,
      last_error_code = p_error_code,
      last_error_detail = p_error_detail,
      updated_at = v_now
  where project_id = p_project_id;
  return query select p_project_id, p_run_id, true;
end;
$$;

-- Server-only read boundary for the current pointer. No Notion fallback is
-- performed here; absence of a published snapshot returns no row.
create or replace function public.study_graph_get_current_scope_knowledge_snapshot(
  p_project_id text
)
returns table(
  snapshot_id uuid,
  project_id text,
  generation bigint,
  schema_version integer,
  source_read_started_at timestamptz,
  source_read_completed_at timestamptz,
  published_at timestamptz,
  valid_until timestamptz,
  scope_policy_version text,
  knowledge_projection_version text,
  source_evidence jsonb,
  scope_decisions jsonb,
  knowledge_projection jsonb,
  content_hash text,
  created_at timestamptz
)
language sql
security definer
set search_path = pg_catalog
as $$
  select
    s.snapshot_id,
    s.project_id,
    s.generation,
    s.schema_version,
    s.source_read_started_at,
    s.source_read_completed_at,
    s.published_at,
    s.valid_until,
    s.scope_policy_version,
    s.knowledge_projection_version,
    s.source_evidence,
    s.scope_decisions,
    s.knowledge_projection,
    s.content_hash,
    s.created_at
  from private.project_snapshot_sync_state st
  join private.scope_knowledge_snapshots s
    on s.snapshot_id = st.current_snapshot_id
  where st.project_id = p_project_id;
$$;

revoke all on function public.study_graph_begin_scope_snapshot_sync(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_begin_scope_snapshot_sync(text, uuid)
  to service_role;

revoke all on function public.study_graph_publish_scope_knowledge_snapshot(
  uuid, text, uuid, bigint, integer, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text, jsonb, jsonb, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.study_graph_publish_scope_knowledge_snapshot(
  uuid, text, uuid, bigint, integer, timestamptz, timestamptz, timestamptz,
  timestamptz, text, text, jsonb, jsonb, jsonb, text
) to service_role;

revoke all on function public.study_graph_fail_scope_snapshot_sync(text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_fail_scope_snapshot_sync(text, uuid, text, text)
  to service_role;

revoke all on function public.study_graph_get_current_scope_knowledge_snapshot(text)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_get_current_scope_knowledge_snapshot(text)
  to service_role;

commit;
