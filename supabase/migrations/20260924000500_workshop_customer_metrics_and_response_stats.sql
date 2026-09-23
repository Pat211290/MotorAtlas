-- Workshop customer metrics and response-time analytics.

create or replace function public.get_workshop_dashboard_metrics(p_workshop_id uuid)
returns table(
  active_customer_count bigint,
  primary_customer_count bigint
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_workshop_member(p_workshop_id) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    count(*) filter (where l.active)::bigint,
    count(*) filter (where l.active and l.is_primary)::bigint
  from public.customer_workshop_links l
  where l.workshop_id=p_workshop_id;
end;
$$;

create or replace function public.get_workshop_response_stats(p_workshop_id uuid)
returns table(
  median_response_minutes numeric,
  average_response_minutes numeric,
  sample_count bigint
)
language plpgsql
security definer
set search_path=public
as $$
declare
  uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  if not public.is_workshop_member(p_workshop_id)
     and not exists(
       select 1
       from public.customer_workshop_links l
       where l.workshop_id=p_workshop_id
         and l.customer_user_id=uid
         and l.active
     )
  then
    raise exception 'not_authorized';
  end if;

  return query
  with ordered as (
    select
      cm.id,
      cm.thread_id,
      cm.sender_user_id,
      cm.created_at,
      ct.customer_user_id,
      lag(cm.sender_user_id) over(
        partition by cm.thread_id
        order by cm.created_at,cm.id
      ) as previous_sender
    from public.chat_messages cm
    join public.chat_threads ct on ct.id=cm.thread_id
    where ct.workshop_id=p_workshop_id
      and cm.created_at>=now()-interval '180 days'
  ),
  customer_turns as (
    select o.*
    from ordered o
    where o.sender_user_id=o.customer_user_id
      and (o.previous_sender is null or o.previous_sender<>o.customer_user_id)
  ),
  response_times as (
    select extract(epoch from (reply.created_at-c.created_at))/60.0 as response_minutes
    from customer_turns c
    join lateral(
      select m.created_at
      from public.chat_messages m
      where m.thread_id=c.thread_id
        and m.created_at>c.created_at
        and m.sender_user_id<>c.customer_user_id
      order by m.created_at,m.id
      limit 1
    ) reply on true
  )
  select
    round((percentile_cont(0.5) within group(order by response_minutes))::numeric,1),
    round(avg(response_minutes)::numeric,1),
    count(*)::bigint
  from response_times;
end;
$$;

revoke all on function public.get_workshop_dashboard_metrics(uuid) from public;
revoke all on function public.get_workshop_response_stats(uuid) from public;
grant execute on function public.get_workshop_dashboard_metrics(uuid) to authenticated;
grant execute on function public.get_workshop_response_stats(uuid) to authenticated;
grant execute on function public.get_workshop_chat_inbox(uuid) to authenticated;
