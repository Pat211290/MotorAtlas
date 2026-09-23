-- Deep-link metadata for bell notifications.
alter table public.notifications
  add column if not exists target_type text,
  add column if not exists target_id uuid;

create index if not exists notifications_target_idx
  on public.notifications(target_type,target_id)
  where target_id is not null;

create or replace function public.fill_notification_target()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.target_type is not null or new.target_id is not null then
    return new;
  end if;

  if new.kind='order' and new.work_order_id is not null then
    new.target_type:='work_order';
    new.target_id:=new.work_order_id;
  elsif new.kind='chat' and new.work_order_id is not null then
    new.target_type:='chat_thread';
    select t.id into new.target_id
    from public.chat_threads t
    where t.work_order_id=new.work_order_id
    order by coalesce(t.last_message_at,t.created_at) desc
    limit 1;
  elsif new.kind='appointment' and new.work_order_id is not null then
    new.target_type:='appointment';
    select w.appointment_id into new.target_id
    from public.work_orders w
    where w.id=new.work_order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists fill_notification_target on public.notifications;
create trigger fill_notification_target
before insert on public.notifications
for each row execute function public.fill_notification_target();

update public.notifications
set target_type='work_order',target_id=work_order_id
where target_id is null and kind='order' and work_order_id is not null;

update public.notifications n
set target_type='chat_thread',
    target_id=(
      select t.id
      from public.chat_threads t
      where t.work_order_id=n.work_order_id
      order by coalesce(t.last_message_at,t.created_at) desc
      limit 1
    )
where n.target_id is null and n.kind='chat' and n.work_order_id is not null;

update public.notifications n
set target_type='appointment',
    target_id=(select w.appointment_id from public.work_orders w where w.id=n.work_order_id)
where n.target_id is null and n.kind='appointment' and n.work_order_id is not null;

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
    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
    select
      wm.user_id,t.workshop_id,t.work_order_id,'Neue Chatnachricht',
      coalesce(v_vehicle,'Fahrzeug')||' – '||preview,'chat','chat_thread',t.id
    from public.workshop_members wm
    where wm.workshop_id=t.workshop_id and wm.active=true;
  else
    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
    values(
      t.customer_user_id,t.workshop_id,t.work_order_id,
      'Neue Chatnachricht von der Werkstatt',
      coalesce(v_vehicle,'Fahrzeug')||' – '||preview,
      'chat','chat_thread',t.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_workshop_on_service_request()
returns trigger
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  v_vehicle text;
begin
  if new.status='submitted'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select concat_ws(' ',v.make,v.model,v.variant)||' · '||v.license_plate
      into v_vehicle
    from public.vehicles v where v.id=new.vehicle_id;

    insert into public.notifications(user_id,workshop_id,title,body,kind,target_type,target_id)
    select
      wm.user_id,new.workshop_id,'Neue Werkstattanfrage',
      coalesce(v_vehicle,'Fahrzeug')||' – neue Anfrage eingegangen.',
      'request','service_request',new.id
    from public.workshop_members wm
    where wm.workshop_id=new.workshop_id and wm.active=true;
  end if;
  return new;
end;
$$;

create or replace function public.notify_workshop_on_customer_request()
returns trigger
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  v_name text;
begin
  if new.status='pending'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select full_name into v_name from public.profiles where id=new.customer_user_id;

    insert into public.notifications(user_id,workshop_id,title,body,kind,target_type,target_id)
    select
      wm.user_id,new.workshop_id,'Neue Kundenanfrage',
      coalesce(v_name,'Ein Kunde')||' möchte von deiner Werkstatt aufgenommen werden.',
      'customer_request','customer_request',new.id
    from public.workshop_members wm
    where wm.workshop_id=new.workshop_id and wm.active=true;
  end if;
  return new;
end;
$$;

create or replace function public.notify_workshop_on_appointment_response()
returns trigger
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  r public.service_requests;
  v_vehicle text;
  v_title text;
  v_body text;
  v_order_id uuid;
begin
  if new.status in ('confirmed','declined')
     and old.status is distinct from new.status then
    select * into r from public.service_requests where id=new.service_request_id;
    select concat_ws(' ',v.make,v.model,v.variant)||' · '||v.license_plate
      into v_vehicle
    from public.vehicles v where v.id=r.vehicle_id;
    select id into v_order_id from public.work_orders where appointment_id=new.id limit 1;

    if new.status='confirmed' then
      v_title:='Termin bestätigt';
      v_body:=coalesce(v_vehicle,'Fahrzeug')||' – der Kunde hat den Termin bestätigt.';
    else
      v_title:='Terminvorschlag abgelehnt';
      v_body:=coalesce(v_vehicle,'Fahrzeug')||' – der Kunde hat den Terminvorschlag abgelehnt.';
    end if;

    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
    select
      wm.user_id,new.workshop_id,v_order_id,v_title,v_body,
      'appointment','appointment',new.id
    from public.workshop_members wm
    where wm.workshop_id=new.workshop_id and wm.active=true;
  end if;
  return new;
end;
$$;

create or replace function public.propose_appointment(
  p_service_request_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_note text default null
)
returns public.appointments
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare r public.service_requests; a public.appointments; uid uuid:=(select auth.uid());
begin
  select * into r from public.service_requests where id=p_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if not motoratlas_private.has_workshop_permission(r.workshop_id,'appointments',uid) then raise exception 'not_authorized'; end if;
  if r.status not in ('submitted','accepted','appointment_pending') then raise exception 'invalid_request_status:%',r.status; end if;

  if p_starts_at <= now() then raise exception 'appointment_in_past'; end if;
  if mod(extract(minute from p_starts_at)::int,15)<>0 or extract(second from p_starts_at)<>0 then
    raise exception 'appointment_must_use_15_minute_slots';
  end if;
  if p_ends_at is not null then
    if p_ends_at<=p_starts_at then raise exception 'invalid_appointment_range'; end if;
    if mod(extract(minute from p_ends_at)::int,15)<>0 or extract(second from p_ends_at)<>0 then
      raise exception 'appointment_must_use_15_minute_slots';
    end if;
  end if;

  update public.appointments set status='cancelled',updated_at=now()
  where service_request_id=r.id and status='proposed';

  insert into public.appointments(service_request_id,workshop_id,starts_at,ends_at,proposed_by,status,note)
  values(r.id,r.workshop_id,p_starts_at,p_ends_at,uid,'proposed',nullif(trim(p_note),''))
  returning * into a;

  update public.service_requests set status='appointment_pending',updated_at=now() where id=r.id;

  insert into public.notifications(user_id,workshop_id,title,body,kind,target_type,target_id)
  values(
    r.customer_user_id,r.workshop_id,'Neuer Terminvorschlag',
    'Deine Werkstatt hat einen Termin vorgeschlagen.',
    'appointment','appointment',a.id
  );
  return a;
end;
$$;

create or replace function public.decline_service_request(
  p_service_request_id uuid,
  p_reason text default null
)
returns public.service_requests
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  r public.service_requests;
  uid uuid := (select auth.uid());
  reason_text text := coalesce(nullif(trim(p_reason),''),'Die Werkstatt kann diese Anfrage derzeit nicht annehmen.');
begin
  select * into r from public.service_requests where id=p_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if not motoratlas_private.has_workshop_permission(r.workshop_id,'requests',uid) then raise exception 'not_authorized'; end if;
  if r.status not in ('submitted','accepted','appointment_pending') then raise exception 'invalid_request_status:%',r.status; end if;

  update public.service_requests
     set status='declined',decline_reason=reason_text,declined_at=now(),updated_at=now()
   where id=r.id
   returning * into r;

  insert into public.notifications(user_id,workshop_id,title,body,kind,target_type,target_id)
  values(r.customer_user_id,r.workshop_id,'Anfrage abgelehnt',reason_text,'request','service_request',r.id);

  return r;
end;
$$;

create or replace function public.cancel_appointment_as_customer(
  p_appointment_id uuid,
  p_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  a public.appointments;
  r public.service_requests;
  w public.work_orders;
  uid uuid := (select auth.uid());
  v_vehicle text;
  reason_text text := coalesce(nullif(trim(p_reason),''),'Vom Kunden storniert.');
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into a from public.appointments where id=p_appointment_id for update;
  if not found then raise exception 'appointment_not_found'; end if;

  select * into r from public.service_requests where id=a.service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if r.customer_user_id<>uid then raise exception 'not_authorized'; end if;
  if a.status<>'confirmed' then raise exception 'appointment_not_confirmed'; end if;

  if a.starts_at - now() < interval '12 hours' then raise exception 'customer_cancellation_window_closed'; end if;

  select * into w from public.work_orders where appointment_id=a.id for update;
  if found and (w.arrived_at is not null or w.stage<>'appointment_confirmed') then
    raise exception 'appointment_already_started';
  end if;

  update public.appointments
     set status='cancelled',cancelled_at=now(),cancelled_by=uid,
         cancellation_reason=reason_text,cancellation_actor='customer',updated_at=now()
   where id=a.id
   returning * into a;

  update public.service_requests set status='cancelled',updated_at=now() where id=r.id;

  if w.id is not null then
    update public.work_orders set stage='cancelled',updated_at=now() where id=w.id;
    insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
    values(w.id,w.workshop_id,'appointment_cancelled','both',uid,
      jsonb_build_object('actor','customer','reason',reason_text,'appointment_id',a.id));
  end if;

  select concat_ws(' ',v.make,v.model,v.variant)||' · '||v.license_plate
    into v_vehicle
  from public.vehicles v where v.id=r.vehicle_id;

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
  select
    wm.user_id,r.workshop_id,case when w.id is not null then w.id else null end,
    'Termin vom Kunden storniert',
    coalesce(v_vehicle,'Fahrzeug')||' – '||reason_text,
    'appointment','appointment',a.id
  from public.workshop_members wm
  where wm.workshop_id=r.workshop_id and wm.active=true;

  return a;
end;
$$;

create or replace function public.cancel_appointment_as_workshop(
  p_appointment_id uuid,
  p_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  a public.appointments;
  r public.service_requests;
  w public.work_orders;
  uid uuid := (select auth.uid());
  reason_text text := coalesce(nullif(trim(p_reason),''),'Von der Werkstatt storniert.');
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into a from public.appointments where id=p_appointment_id for update;
  if not found then raise exception 'appointment_not_found'; end if;

  if not motoratlas_private.has_workshop_permission(a.workshop_id,'appointments',uid) then raise exception 'not_authorized'; end if;
  if a.status not in ('proposed','confirmed') then raise exception 'appointment_not_cancellable'; end if;

  select * into r from public.service_requests where id=a.service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;

  select * into w from public.work_orders where appointment_id=a.id for update;
  if found and (w.arrived_at is not null or w.stage<>'appointment_confirmed') then
    raise exception 'appointment_already_started';
  end if;

  update public.appointments
     set status='cancelled',cancelled_at=now(),cancelled_by=uid,
         cancellation_reason=reason_text,cancellation_actor='workshop',updated_at=now()
   where id=a.id
   returning * into a;

  if a.status='cancelled' then
    if w.id is not null then
      update public.work_orders set stage='cancelled',updated_at=now() where id=w.id;
      update public.service_requests set status='cancelled',updated_at=now() where id=r.id;
      insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
      values(w.id,w.workshop_id,'appointment_cancelled','both',uid,
        jsonb_build_object('actor','workshop','reason',reason_text,'appointment_id',a.id));
    else
      update public.service_requests set status='accepted',updated_at=now()
      where id=r.id and status='appointment_pending';
    end if;
  end if;

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
  values(
    r.customer_user_id,r.workshop_id,case when w.id is not null then w.id else null end,
    'Termin von der Werkstatt storniert',reason_text,'appointment','appointment',a.id
  );

  return a;
end;
$$;
