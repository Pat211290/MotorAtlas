-- Appointment cancellation rules and audit trail.

alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_actor text
    check (cancellation_actor is null or cancellation_actor in ('customer','workshop'));

create or replace function public.cancel_appointment_as_customer(
  p_appointment_id uuid,
  p_reason text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public, motoratlas_private
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

  if a.starts_at - now() < interval '12 hours' then
    raise exception 'customer_cancellation_window_closed';
  end if;

  select * into w from public.work_orders where appointment_id=a.id for update;
  if found and (w.arrived_at is not null or w.stage<>'appointment_confirmed') then
    raise exception 'appointment_already_started';
  end if;

  update public.appointments
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=uid,
         cancellation_reason=reason_text,
         cancellation_actor='customer',
         updated_at=now()
   where id=a.id
   returning * into a;

  update public.service_requests
     set status='cancelled',updated_at=now()
   where id=r.id;

  if found then
    update public.work_orders
       set stage='cancelled',updated_at=now()
     where id=w.id;

    insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
    values(w.id,w.workshop_id,'appointment_cancelled','both',uid,
      jsonb_build_object('actor','customer','reason',reason_text,'appointment_id',a.id));
  end if;

  select concat_ws(' ',v.make,v.model,v.variant)||' · '||v.license_plate
    into v_vehicle
  from public.vehicles v where v.id=r.vehicle_id;

  perform motoratlas_private.notify_workshop_members(
    r.workshop_id,
    'Termin vom Kunden storniert',
    coalesce(v_vehicle,'Fahrzeug')||' – '||reason_text,
    'appointment',
    case when w.id is not null then w.id else null end
  );

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
set search_path = public, motoratlas_private
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

  if not motoratlas_private.has_workshop_permission(a.workshop_id,'appointments',uid) then
    raise exception 'not_authorized';
  end if;
  if a.status not in ('proposed','confirmed') then raise exception 'appointment_not_cancellable'; end if;

  select * into r from public.service_requests where id=a.service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;

  select * into w from public.work_orders where appointment_id=a.id for update;
  if found and (w.arrived_at is not null or w.stage<>'appointment_confirmed') then
    raise exception 'appointment_already_started';
  end if;

  update public.appointments
     set status='cancelled',
         cancelled_at=now(),
         cancelled_by=uid,
         cancellation_reason=reason_text,
         cancellation_actor='workshop',
         updated_at=now()
   where id=a.id
   returning * into a;

  if a.status='cancelled' then
    if w.id is not null then
      update public.work_orders
         set stage='cancelled',updated_at=now()
       where id=w.id;

      update public.service_requests
         set status='cancelled',updated_at=now()
       where id=r.id;

      insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
      values(w.id,w.workshop_id,'appointment_cancelled','both',uid,
        jsonb_build_object('actor','workshop','reason',reason_text,'appointment_id',a.id));
    else
      update public.service_requests
         set status='accepted',updated_at=now()
       where id=r.id and status='appointment_pending';
    end if;
  end if;

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(
    r.customer_user_id,
    r.workshop_id,
    case when w.id is not null then w.id else null end,
    'Termin von der Werkstatt storniert',
    reason_text,
    'appointment'
  );

  return a;
end;
$$;

revoke all on function public.cancel_appointment_as_customer(uuid,text) from public;
revoke all on function public.cancel_appointment_as_workshop(uuid,text) from public;
grant execute on function public.cancel_appointment_as_customer(uuid,text) to authenticated;
grant execute on function public.cancel_appointment_as_workshop(uuid,text) to authenticated;
