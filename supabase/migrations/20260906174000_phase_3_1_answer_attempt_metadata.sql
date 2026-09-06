begin;

alter table public.review_attempts
  add column if not exists exercise_id text,
  add column if not exists answer_type text,
  add column if not exists answer_text text,
  add column if not exists is_correct boolean,
  add column if not exists response_ms integer,
  add column if not exists used_hint boolean not null default false;

alter table public.review_attempts
  drop constraint if exists review_attempts_answer_type_check;

alter table public.review_attempts
  add constraint review_attempts_answer_type_check
  check (answer_type is null or answer_type in ('text', 'single-choice'));

alter table public.review_attempts
  drop constraint if exists review_attempts_response_ms_check;

alter table public.review_attempts
  add constraint review_attempts_response_ms_check
  check (response_ms is null or response_ms between 0 and 3600000);

create or replace function public.study_graph_record_review(
  p_token text,
  p_item_id text,
  p_item_kind text,
  p_grade text,
  p_exercise_id text,
  p_answer_type text,
  p_answer_text text,
  p_is_correct boolean,
  p_response_ms integer,
  p_used_hint boolean default false
)
returns table(due_at timestamptz, interval_days integer, repetitions integer)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_now timestamptz := now();
  v_previous_interval integer := 0;
  v_previous_repetitions integer := 0;
  v_interval integer := 0;
  v_repetitions integer := 0;
  v_due timestamptz;
begin
  if not private.study_graph_token_valid(p_token) then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;
  if p_item_kind not in ('character', 'mistake', 'knowledge') then
    raise exception using errcode = '22023', message = 'invalid item kind';
  end if;
  if p_grade not in ('again', 'hard', 'good', 'easy') then
    raise exception using errcode = '22023', message = 'invalid grade';
  end if;
  if p_exercise_id is null or length(btrim(p_exercise_id)) = 0 or length(p_exercise_id) > 400 then
    raise exception using errcode = '22023', message = 'invalid exercise id';
  end if;
  if p_answer_type not in ('text', 'single-choice') then
    raise exception using errcode = '22023', message = 'invalid answer type';
  end if;
  if p_response_ms is null or p_response_ms < 0 or p_response_ms > 3600000 then
    raise exception using errcode = '22023', message = 'invalid response time';
  end if;

  select rs.interval_days, rs.repetitions into v_previous_interval, v_previous_repetitions
  from public.review_state rs where rs.item_id = p_item_id for update;
  v_previous_interval := coalesce(v_previous_interval, 0);
  v_previous_repetitions := coalesce(v_previous_repetitions, 0);

  case p_grade
    when 'again' then v_interval := 0; v_repetitions := 0; v_due := v_now + interval '10 minutes';
    when 'hard' then v_interval := case when v_previous_interval = 0 then 1 else greatest(1, ceil(v_previous_interval * 1.2)::integer) end; v_repetitions := v_previous_repetitions + 1; v_due := v_now + make_interval(days => v_interval);
    when 'good' then v_interval := case when v_previous_interval = 0 then 2 else greatest(2, round(v_previous_interval * 2.2)::integer) end; v_repetitions := v_previous_repetitions + 1; v_due := v_now + make_interval(days => v_interval);
    when 'easy' then v_interval := case when v_previous_interval = 0 then 5 else greatest(5, round(v_previous_interval * 3.2)::integer) end; v_repetitions := v_previous_repetitions + 1; v_due := v_now + make_interval(days => v_interval);
  end case;

  insert into public.review_attempts (item_id, item_kind, grade, previous_interval_days, interval_days, reviewed_at, due_at, exercise_id, answer_type, answer_text, is_correct, response_ms, used_hint)
  values (p_item_id, p_item_kind, p_grade, v_previous_interval, v_interval, v_now, v_due, p_exercise_id, p_answer_type, left(coalesce(p_answer_text, ''), 2000), p_is_correct, p_response_ms, coalesce(p_used_hint, false));

  insert into public.review_state (item_id, item_kind, last_grade, repetitions, interval_days, last_reviewed_at, due_at, updated_at)
  values (p_item_id, p_item_kind, p_grade, v_repetitions, v_interval, v_now, v_due, v_now)
  on conflict (item_id) do update set item_kind = excluded.item_kind, last_grade = excluded.last_grade, repetitions = excluded.repetitions, interval_days = excluded.interval_days, last_reviewed_at = excluded.last_reviewed_at, due_at = excluded.due_at, updated_at = excluded.updated_at;

  return query select v_due, v_interval, v_repetitions;
end;
$$;

revoke all on function public.study_graph_record_review(text, text, text, text, text, text, text, boolean, integer, boolean) from public;
revoke all on function public.study_graph_record_review(text, text, text, text, text, text, text, boolean, integer, boolean) from authenticated;
grant execute on function public.study_graph_record_review(text, text, text, text, text, text, text, boolean, integer, boolean) to anon;

commit;
