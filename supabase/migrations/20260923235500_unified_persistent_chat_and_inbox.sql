-- Unified persistent vehicle chats, workshop chat toggle and chat inbox.

alter table public.workshops
  add column if not exists chat_enabled boolean not null default true;

drop index if exists public.one_chat_per_service_request;
drop index if exists public.one_chat_per_work_order;
drop index if exists public.one_general_vehicle_chat;

-- Merge any existing duplicate open chats for the same workshop/customer/vehicle.
do $$
declare
  g record;
  keep_id uuid;
begin
  for g in
    select workshop_id,customer_user_id,vehicle_id,array_agg(id order by created_at asc) ids
    from public.chat_threads
    where status='open'
    group by workshop_id,customer_user_id,vehicle_id
    having count(*)>1
  loop
    keep_id:=g.ids[1];

    insert into public.chat_read_state(thread_id,user_id,last_read_at)
    select keep_id,user_id,max(last_read_at)
    from public.chat_read_state
    where thread_id=any(g.ids)
    group by user_id
    on conflict(thread_id,user_id) do update
      set last_read_at=greatest(public.chat_read_state.last_read_at,excluded.last_read_at);

    update public.chat_messages
       set thread_id=keep_id
     where thread_id=any(g.ids)
       and thread_id<>keep_id;

    update public.chat_threads keep
       set work_order_id=coalesce(
             keep.work_order_id,
             (select work_order_id from public.chat_threads where id=any(g.ids) and work_order_id is not null order by created_at desc limit 1)
           ),
           service_request_id=coalesce(
             keep.service_request_id,
             (select service_request_id from public.chat_threads where id=any(g.ids) and service_request_id is not null order by created_at desc limit 1)
           ),
           subject='Fahrzeugchat',
           last_message_at=(select max(created_at) from public.chat_messages where thread_id=keep_id),
           updated_at=now()
     where keep.id=keep_id;

    delete from public.chat_threads where id=any(g.ids) and id<>keep_id;
  end loop;
end $$;

create unique index if not exists one_open_vehicle_workshop_chat
  on public.chat_threads(workshop_id,customer_user_id,vehicle_id)
  where status='open';

create or replace function public.ensure_vehicle_chat(p_workshop_id uuid,p_vehicle_id uuid)
returns public.chat_threads
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  t public.chat_threads;
  enabled boolean;
begin
  select owner_user_id into v_owner
  from public.vehicles
  where id=p_vehicle_id and archived_at is null;
  if v_owner is null then raise exception 'vehicle_not_found'; end if;

  if auth.uid()<>v_owner and not public.has_workshop_permission(p_workshop_id,'chat') then
    raise exception 'not_authorized';
  end if;

  if not exists(
    select 1 from public.customer_workshop_links l
    where l.workshop_id=p_workshop_id and l.customer_user_id=v_owner and l.active
  ) then raise exception 'no_active_workshop_relationship'; end if;

  select * into t
  from public.chat_threads
  where workshop_id=p_workshop_id
    and customer_user_id=v_owner
    and vehicle_id=p_vehicle_id
    and status='open'
  order by created_at asc
  limit 1;
  if found then return t; end if;

  select chat_enabled into enabled from public.workshops where id=p_workshop_id;
  if coalesce(enabled,false)=false then raise exception 'chat_disabled'; end if;

  insert into public.chat_threads(workshop_id,customer_user_id,vehicle_id,subject)
  values(p_workshop_id,v_owner,p_vehicle_id,'Fahrzeugchat')
  returning * into t;
  return t;
end;
$$;

create or replace function public.ensure_work_order_chat(p_work_order_id uuid)
returns public.chat_threads
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
  t public.chat_threads;
  enabled boolean;
begin
  select * into w from public.work_orders where id=p_work_order_id;
  if not found then raise exception 'work_order_not_found'; end if;

  if auth.uid()<>w.customer_user_id
     and not public.has_workshop_permission(w.workshop_id,'chat')
     and not exists(
       select 1 from public.work_order_assignments a
       where a.work_order_id=w.id and a.member_user_id=auth.uid() and a.status='claimed'
     )
  then raise exception 'not_authorized'; end if;

  select * into t
  from public.chat_threads
  where workshop_id=w.workshop_id
    and customer_user_id=w.customer_user_id
    and vehicle_id=w.vehicle_id
    and status='open'
  order by created_at asc
  limit 1;

  if found then
    update public.chat_threads
       set work_order_id=coalesce(work_order_id,w.id),
           service_request_id=coalesce(service_request_id,w.service_request_id),
           updated_at=now()
     where id=t.id
     returning * into t;
    return t;
  end if;

  select chat_enabled into enabled from public.workshops where id=w.workshop_id;
  if coalesce(enabled,false)=false then raise exception 'chat_disabled'; end if;

  insert into public.chat_threads(workshop_id,customer_user_id,vehicle_id,work_order_id,service_request_id,subject)
  values(w.workshop_id,w.customer_user_id,w.vehicle_id,w.id,w.service_request_id,'Fahrzeugchat')
  returning * into t;
  return t;
end;
$$;

create or replace function public.chat_sending_enabled(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(w.chat_enabled,false)
  from public.chat_threads t
  join public.workshops w on w.id=t.workshop_id
  where t.id=p_thread_id;
$$;

drop policy if exists chat_messages_parties_insert on public.chat_messages;
create policy chat_messages_parties_insert
on public.chat_messages for insert to authenticated
with check(
  sender_user_id=(select auth.uid())
  and public.can_access_chat_thread(thread_id)
  and public.chat_sending_enabled(thread_id)
);

create or replace function public.get_workshop_chat_inbox(p_workshop_id uuid)
returns table(
  thread_id uuid,
  customer_user_id uuid,
  customer_name text,
  vehicle_id uuid,
  vehicle_name text,
  plate text,
  photo_path text,
  last_message text,
  last_message_kind text,
  last_message_at timestamptz,
  unread_count bigint
)
language plpgsql
security definer
set search_path=public
as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null or not public.has_workshop_permission(p_workshop_id,'chat') then
    raise exception 'not_authorized';
  end if;

  return query
  select
    t.id,
    t.customer_user_id,
    coalesce(p.full_name,'Kunde'),
    t.vehicle_id,
    trim(concat_ws(' ',v.make,v.model,v.variant)),
    v.license_plate,
    v.photo_path,
    coalesce(nullif(lm.body,''),case when lm.kind='image' then 'Bild gesendet' when lm.kind='file' then 'Datei gesendet' else 'Neue Nachricht' end),
    lm.kind,
    lm.created_at,
    (
      select count(*)
      from public.chat_messages cm
      where cm.thread_id=t.id
        and cm.sender_user_id<>uid
        and cm.created_at>coalesce(
          (select rs.last_read_at from public.chat_read_state rs where rs.thread_id=t.id and rs.user_id=uid),
          '-infinity'::timestamptz
        )
    )::bigint
  from public.chat_threads t
  join public.vehicles v on v.id=t.vehicle_id
  left join public.profiles p on p.id=t.customer_user_id
  join lateral(
    select cm.body,cm.kind,cm.created_at
    from public.chat_messages cm
    where cm.thread_id=t.id
    order by cm.created_at desc
    limit 1
  ) lm on true
  where t.workshop_id=p_workshop_id
    and t.status='open'
  order by
    (
      select count(*)
      from public.chat_messages cm
      where cm.thread_id=t.id
        and cm.sender_user_id<>uid
        and cm.created_at>coalesce(
          (select rs.last_read_at from public.chat_read_state rs where rs.thread_id=t.id and rs.user_id=uid),
          '-infinity'::timestamptz
        )
    ) desc,
    lm.created_at desc;
end;
$$;

create or replace function public.notify_on_chat_message()
returns trigger
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  t public.chat_threads;
  v_vehicle text;
  preview text;
begin
  select * into t from public.chat_threads where id=new.thread_id;
  if not found then return new; end if;

  select trim(concat_ws(' ',v.make,v.model,v.variant))||' · '||v.license_plate
    into v_vehicle
  from public.vehicles v where v.id=t.vehicle_id;

  preview:=coalesce(nullif(left(new.body,120),''),case when new.kind='image' then 'Bild gesendet' when new.kind='file' then 'Datei gesendet' else 'Neue Nachricht' end);

  if new.sender_user_id=t.customer_user_id then
    perform motoratlas_private.notify_workshop_members(
      t.workshop_id,
      'Neue Chatnachricht',
      coalesce(v_vehicle,'Fahrzeug')||' – '||preview,
      'chat',
      t.work_order_id
    );
  else
    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
    values(
      t.customer_user_id,
      t.workshop_id,
      t.work_order_id,
      'Neue Chatnachricht von der Werkstatt',
      coalesce(v_vehicle,'Fahrzeug')||' – '||preview,
      'chat'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_on_chat_message on public.chat_messages;
create trigger notify_on_chat_message
after insert on public.chat_messages
for each row execute function public.notify_on_chat_message();
