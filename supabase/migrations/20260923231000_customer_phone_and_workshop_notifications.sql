-- Customer contact details and workshop notification events.

alter table public.profiles
  add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,full_name,phone,street,postal_code,city,country_code)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    nullif(trim(new.raw_user_meta_data->>'phone'),''),
    nullif(trim(new.raw_user_meta_data->>'street'),''),
    nullif(trim(new.raw_user_meta_data->>'postal_code'),''),
    nullif(trim(new.raw_user_meta_data->>'city'),''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'country_code'),''),'DE')
  )
  on conflict(id) do update set
    full_name=excluded.full_name,
    phone=coalesce(public.profiles.phone,excluded.phone),
    street=coalesce(public.profiles.street,excluded.street),
    postal_code=coalesce(public.profiles.postal_code,excluded.postal_code),
    city=coalesce(public.profiles.city,excluded.city),
    updated_at=now();
  return new;
end;
$$;

create or replace function motoratlas_private.notify_workshop_members(
  p_workshop_id uuid,
  p_title text,
  p_body text,
  p_kind text default 'info',
  p_work_order_id uuid default null
)
returns void
language sql
security definer
set search_path = public, motoratlas_private
as $$
  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  select wm.user_id,p_workshop_id,p_work_order_id,p_title,p_body,p_kind
  from public.workshop_members wm
  where wm.workshop_id=p_workshop_id and wm.active=true;
$$;

create or replace function public.notify_workshop_on_service_request()
returns trigger
language plpgsql
security definer
set search_path = public, motoratlas_private
as $$
declare
  v_vehicle text;
begin
  if new.status='submitted'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select concat_ws(' ',v.make,v.model,v.variant)||' · '||v.license_plate
      into v_vehicle
    from public.vehicles v where v.id=new.vehicle_id;

    perform motoratlas_private.notify_workshop_members(
      new.workshop_id,
      'Neue Werkstattanfrage',
      coalesce(v_vehicle,'Fahrzeug')||' – neue Anfrage eingegangen.',
      'request',
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_workshop_on_service_request on public.service_requests;
create trigger notify_workshop_on_service_request
after insert or update of status on public.service_requests
for each row execute function public.notify_workshop_on_service_request();

create or replace function public.notify_workshop_on_customer_request()
returns trigger
language plpgsql
security definer
set search_path = public, motoratlas_private
as $$
declare
  v_name text;
begin
  if new.status='pending'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select full_name into v_name from public.profiles where id=new.customer_user_id;
    perform motoratlas_private.notify_workshop_members(
      new.workshop_id,
      'Neue Kundenanfrage',
      coalesce(v_name,'Ein Kunde')||' möchte von deiner Werkstatt aufgenommen werden.',
      'customer_request',
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_workshop_on_customer_request on public.workshop_customer_requests;
create trigger notify_workshop_on_customer_request
after insert or update of status on public.workshop_customer_requests
for each row execute function public.notify_workshop_on_customer_request();

create or replace function public.notify_workshop_on_appointment_response()
returns trigger
language plpgsql
security definer
set search_path = public, motoratlas_private
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

    perform motoratlas_private.notify_workshop_members(
      new.workshop_id,v_title,v_body,'appointment',v_order_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_workshop_on_appointment_response on public.appointments;
create trigger notify_workshop_on_appointment_response
after update of status on public.appointments
for each row execute function public.notify_workshop_on_appointment_response();

revoke all on function motoratlas_private.notify_workshop_members(uuid,text,text,text,uuid) from public;
