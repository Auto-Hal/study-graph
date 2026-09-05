create or replace function public.study_graph_review_history(
  p_token text,
  p_limit integer default 50
)
returns table (
  id bigint,
  item_id text,
  item_kind text,
  grade text,
  previous_interval_days integer,
  interval_days integer,
  reviewed_at timestamptz,
  due_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, extensions
as $$
begin
  if not private.study_graph_token_valid(p_token) then
    raise exception using errcode = '42501', message = 'unauthorized';
  end if;

  return query
  select
    ra.id,
    ra.item_id,
    ra.item_kind,
    ra.grade,
    ra.previous_interval_days,
    ra.interval_days,
    ra.reviewed_at,
    ra.due_at
  from public.review_attempts ra
  order by ra.reviewed_at desc, ra.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

revoke all on function public.study_graph_review_history(text, integer) from public;
revoke execute on function public.study_graph_review_history(text, integer) from authenticated;
grant execute on function public.study_graph_review_history(text, integer) to anon;

comment on function public.study_graph_review_history(text, integer) is
  'Returns recent Study Graph review attempts after validating the server-only app token.';
