-- Make request photos optional and enforce 15-minute appointment slots.

create or replace function public.submit_service_request(p_service_request_id uuid)
returns public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare r public.service_requests; uid uuid:=(select auth.uid());
begin
  select * into r from public.service_requests where id=p_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if r.customer_user_id<>uid then raise exception 'not_authorized'; end if;
  if r.status<>'draft' then raise exception 'request_not_draft'; end if;
  if nullif(trim(r.complaint),'') is null then
    update public.service_requests
       set complaint='Keine Fehlerbeschreibung angegeben.'
     where id=r.id
     returning * into r;
  end if;
  if not exists(
    select 1 from public.customer_workshop_links l
    where l.workshop_id=r.workshop_id
      and l.customer_user_id=uid
      and l.active
  ) then raise exception 'workshop_relationship_not_active'; end if;

  update public.service_requests
     set status='submitted',updated_at=now()
   where id=r.id
   returning * into r;

  return r;
end;
$$;

create or replace function public.propose_appointment(
  p_service_request_id uuid,
  p_starts_at timestamp with time zone,
  p_ends_at timestamp with time zone default null,
  p_note text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public, motoratlas_private
as $$
declare r public.service_requests; a public.appointments; uid uuid:=(select auth.uid());
begin
  select * into r from public.service_requests where id=p_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if not motoratlas_private.has_workshop_permission(r.workshop_id,'appointments',uid) then raise exception 'not_authorized'; end if;
  if r.status not in ('submitted','accepted','appointment_pending') then raise exception 'invalid_request_status:%',r.status; end if;

  if mod(extract(minute from p_starts_at)::int,15)<>0 or extract(second from p_starts_at)<>0 then
    raise exception 'appointment_must_use_15_minute_slots';
  end if;
  if p_ends_at is not null then
    if p_ends_at<=p_starts_at then raise exception 'invalid_appointment_range'; end if;
    if mod(extract(minute from p_ends_at)::int,15)<>0 or extract(second from p_ends_at)<>0 then
      raise exception 'appointment_must_use_15_minute_slots';
    end if;
  end if;

  update public.appointments
     set status='cancelled',updated_at=now()
   where service_request_id=r.id and status='proposed';

  insert into public.appointments(service_request_id,workshop_id,starts_at,ends_at,proposed_by,status,note)
  values(r.id,r.workshop_id,p_starts_at,p_ends_at,uid,'proposed',nullif(trim(p_note),''))
  returning * into a;

  update public.service_requests set status='appointment_pending',updated_at=now() where id=r.id;
  insert into public.notifications(user_id,workshop_id,title,body,kind)
  values(r.customer_user_id,r.workshop_id,'Neuer Terminvorschlag','Deine Werkstatt hat einen Termin vorgeschlagen.','appointment');
  return a;
end;
$$;
