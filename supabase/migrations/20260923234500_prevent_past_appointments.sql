-- Prevent creating appointment times or customer desired times in the past.

create or replace function public.validate_service_request_desired_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.desired_start is not null and new.desired_start <= now() then
    raise exception 'desired_appointment_in_past';
  end if;
  if new.desired_end is not null then
    if new.desired_start is null then
      raise exception 'desired_end_requires_start';
    end if;
    if new.desired_end <= new.desired_start then
      raise exception 'invalid_desired_appointment_range';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_service_request_desired_time on public.service_requests;
create trigger validate_service_request_desired_time
before insert or update of desired_start,desired_end on public.service_requests
for each row execute function public.validate_service_request_desired_time();

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

  if p_starts_at <= now() then
    raise exception 'appointment_in_past';
  end if;
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
