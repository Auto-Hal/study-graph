begin;

create index exercise_attempts_learner_history_idx
  on private.exercise_attempts (learner_id, submitted_at desc, attempt_id desc);
create index exercise_attempts_legacy_history_idx
  on private.exercise_attempts (legacy_review_attempt_id)
  where legacy_review_attempt_id is not null;

-- Additive read contract. No attempt, archive, schedule, or opportunity writer.
-- Legacy history belongs to the existing single-app token, not to a guessed learner.
create function public.study_graph_learning_history(
  p_learner_id uuid,
  p_legacy_token text default null,
  p_project_id text default null,
  p_unit_id text default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_recheck_only boolean default false,
  p_before_at timestamptz default null,
  p_before_id text default null,
  p_record_id text default null,
  p_limit integer default 31
)
returns table (
  record_id text, project_id text, unit_id text, submitted_at timestamptz,
  front text, prompt text, evaluation_kind text, grading_status text,
  is_correct boolean, self_evaluation text, srs_applied boolean,
  srs_reason text, due_at timestamptz, current_due_at timestamptz,
  source_url text, detail jsonb
)
language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare
  v_legacy boolean := false;
begin
  if p_learner_id is null
    or p_limit is null or p_limit not between 1 and 51
    or (p_project_id is not null and p_project_id not in ('kuzushiji','western-art-history','philosophy','unknown'))
    or (p_before_at is null) <> (p_before_id is null)
    or (p_start_at is not null and p_end_at is not null and p_start_at >= p_end_at)
    or length(p_unit_id) > 200 or length(p_before_id) > 100 or length(p_record_id) > 100 then
    raise exception using errcode = '22023', message = 'invalid_history_query';
  end if;
  if p_legacy_token is not null then
    if not private.study_graph_token_valid(p_legacy_token) then
      raise exception using errcode = '42501', message = 'unauthorized';
    end if;
    v_legacy := true;
  end if;
  return query
  with latest as materialized (
    select s.project_id, s.knowledge_projection
    from private.project_snapshot_sync_state st
    join private.scope_knowledge_snapshots s on s.snapshot_id = st.current_snapshot_id and s.project_id = st.project_id
    where s.project_id in ('kuzushiji','western-art-history','philosophy')
  ), nodes as materialized (
    select l.project_id, n.value ->> 'id' as id,
      coalesce(n.value ->> 'title', n.value ->> 'name', n.value ->> 'glyph', n.value ->> 'term') as label
    from latest l
    cross join lateral jsonb_each(case when jsonb_typeof(l.knowledge_projection) = 'object' then l.knowledge_projection else '{}'::jsonb end) k
    cross join lateral jsonb_array_elements(case when jsonb_typeof(k.value) = 'array' then k.value else '[]'::jsonb end) n
    where k.key not in ('relations','reviewQueue') and n.value ->> 'id' is not null
  ), identities as materialized (
    select n.id, case when count(distinct n.project_id) = 1 then min(n.project_id) end as project_id,
      min(n.label) as label
    from nodes n group by n.id
  ), records as (
    select a.attempt_id::text as record_id, r.project_id,
      i.presentation ->> 'unitId' as unit_id, a.submitted_at,
      r.payload ->> 'front' as front, r.payload ->> 'prompt' as prompt,
      case when r.payload #>> '{gradingSpec,strategyId}' = 'rubric-self-evaluation-v1'
        then 'explanation' else 'short-answer' end as evaluation_kind,
      a.grading_status, a.is_correct, a.self_evaluation, a.srs_applied,
      coalesce(a.receipt ->> 'reason', a.receipt ->> 'srsReason', a.srs_reason) as srs_reason,
      coalesce(a.receipt ->> 'dueAt', a.review_state_after ->> 'due_at')::timestamptz as due_at,
      case when i.srs_target = 'objective' then o.due_at else ls.due_at end as current_due_at,
      coalesce(i.presentation ->> 'sourceUrl', case when i.legacy_item_id ~ '^[0-9a-fA-F-]{36}$'
        then 'https://www.notion.so/' || replace(i.legacy_item_id, '-', '') end) as source_url,
      case when p_record_id is not null then jsonb_build_object('rawAnswer',a.raw_answer,'revision',r.payload) end as detail
    from private.exercise_attempts a
    join private.exercise_instances i on i.instance_id = a.instance_id and i.learner_id = a.learner_id
    join private.exercise_revisions r on r.revision_id = i.revision_id
    left join private.instance_objective_bindings b on b.instance_id = i.instance_id
    left join private.objective_review_state o on o.learner_id = a.learner_id and o.project_id = b.project_id
      and o.objective_id = b.objective_id and o.srs_epoch = b.srs_epoch
    left join public.review_state ls on i.srs_target = 'legacy-item' and ls.item_id = i.legacy_item_id
    where a.learner_id = p_learner_id and r.project_id in ('kuzushiji','western-art-history','philosophy')
    union all
    select 'legacy-' || a.id::text,
      coalesce(ids.project_id, case when a.item_kind in ('character','mistake') then 'kuzushiji' end, 'unknown'),
      null::text, a.reviewed_at, coalesce(ids.label,'以前の学習記録'), null::text,
      'legacy'::text, case when a.is_correct is null then 'ungraded' else 'graded' end,
      a.is_correct, a.grade, true, 'legacy-applied'::text, a.due_at, s.due_at,
      case when a.item_id ~ '^[0-9a-fA-F-]{36}$' then 'https://www.notion.so/' || replace(a.item_id, '-', '') end,
      case when p_record_id is not null then jsonb_build_object('rawAnswer',a.answer_text,'revision',null) end
    from public.review_attempts a
    left join identities ids on ids.id = a.item_id
    left join public.review_state s on s.item_id = a.item_id
    where v_legacy and not exists (
      select 1 from private.exercise_attempts ea where ea.legacy_review_attempt_id = a.id
    )
  )
  select x.record_id, x.project_id, x.unit_id, x.submitted_at, x.front, x.prompt,
    x.evaluation_kind, x.grading_status, x.is_correct, x.self_evaluation, x.srs_applied,
    x.srs_reason, x.due_at, x.current_due_at, x.source_url, x.detail
  from records x
  where (p_project_id is null or x.project_id = p_project_id)
    and (p_unit_id is null or x.unit_id = p_unit_id)
    and (p_start_at is null or x.submitted_at >= p_start_at)
    and (p_end_at is null or x.submitted_at < p_end_at)
    and (not coalesce(p_recheck_only,false) or x.is_correct = false or x.self_evaluation in ('again','hard'))
    and (p_before_at is null or (x.submitted_at,x.record_id) < (p_before_at,p_before_id))
    and (p_record_id is null or x.record_id = p_record_id)
  order by x.submitted_at desc, x.record_id desc
  limit p_limit;
end;
$$;

revoke all on function public.study_graph_learning_history(uuid,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.study_graph_learning_history(uuid,text,text,text,timestamptz,timestamptz,boolean,timestamptz,text,text,integer)
  to service_role;

commit;
