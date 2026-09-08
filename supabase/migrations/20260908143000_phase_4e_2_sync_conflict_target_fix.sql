begin;

-- Phase 4E-2 production integration fix: PL/pgSQL RETURNS TABLE output
-- variables can collide with an unqualified ON CONFLICT column target.
-- Name the primary-key constraint explicitly so begin-sync remains callable.
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
  on conflict on constraint project_snapshot_sync_state_pkey do nothing;

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
    update private.project_snapshot_sync_state as st
    set active_run_id = null,
        active_generation = null,
        active_started_at = null,
        active_lease_until = null,
        last_failed_at = v_now,
        last_error_code = 'snapshot_sync_lease_expired',
        last_error_detail = 'previous sync lease expired before completion',
        updated_at = v_now
    where st.project_id = p_project_id;
  end if;

  v_generation := greatest(v_state.next_generation, v_state.current_generation + 1, 1);
  v_lease_until := v_now + interval '15 minutes';
  update private.project_snapshot_sync_state as st
  set next_generation = v_generation + 1,
      active_run_id = p_run_id,
      active_generation = v_generation,
      active_started_at = v_now,
      active_lease_until = v_lease_until,
      last_attempted_at = v_now,
      last_error_code = null,
      last_error_detail = null,
      updated_at = v_now
  where st.project_id = p_project_id;

  return query select p_project_id, p_run_id, v_generation, v_lease_until;
end;
$$;

revoke all on function public.study_graph_begin_scope_snapshot_sync(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_begin_scope_snapshot_sync(text, uuid)
  to service_role;

commit;