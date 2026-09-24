-- Controlled vehicle identity maintenance.
-- Customers may create a vehicle and archive it when sold, but vehicle identity data
-- can only be changed by an authorised workshop while the vehicle is physically checked in.

alter table public.vehicles
  add column if not exists type_variant_version text,
  add column if not exists engine_code text,
  add column if not exists displacement_ccm integer,
  add column if not exists power_kw integer,
  add column if not exists fuel_type text,
  add column if not exists transmission_code text,
  add column if not exists drive_type text,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verified_by uuid,
  add column if not exists identity_verified_workshop_id uuid;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='vehicles_displacement_ccm_check'
      and conrelid='public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_displacement_ccm_check
      check(displacement_ccm is null or displacement_ccm between 1 and 20000);
  end if;
  if not exists(
    select 1 from pg_constraint
    where conname='vehicles_power_kw_check'
      and conrelid='public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_power_kw_check
      check(power_kw is null or power_kw between 1 and 2000);
  end if;
end $$;

-- Prevent ordinary customer-side UPDATEs. Specific customer actions such as
-- "sold/archive" go through narrow RPCs instead.
drop policy if exists vehicles_owner_update on public.vehicles;

create or replace function public.archive_my_vehicle(p_vehicle_id uuid)
returns public.vehicles
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.vehicles;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into v
  from public.vehicles
  where id=p_vehicle_id and owner_user_id=uid
  for update;

  if not found then raise exception 'vehicle_not_found'; end if;
  if v.archived_at is not null then return v; end if;

  if exists(
    select 1 from public.work_orders w
    where w.vehicle_id=v.id
      and w.customer_user_id=uid
      and w.stage not in ('closed','cancelled')
  ) then
    raise exception 'vehicle_has_active_work_order';
  end if;

  if exists(
    select 1 from public.service_requests r
    where r.vehicle_id=v.id
      and r.customer_user_id=uid
      and r.status in ('submitted','accepted','appointment_pending')
  ) then
    raise exception 'vehicle_has_active_request';
  end if;

  if exists(
    select 1
    from public.appointments a
    join public.service_requests r on r.id=a.service_request_id
    where r.vehicle_id=v.id
      and r.customer_user_id=uid
      and a.status in ('proposed','confirmed')
  ) then
    raise exception 'vehicle_has_active_appointment';
  end if;

  update public.vehicles
  set archived_at=now(),updated_at=now()
  where id=v.id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.archive_my_vehicle(uuid) from public;
grant execute on function public.archive_my_vehicle(uuid) to authenticated;

create or replace function public.update_vehicle_identity_as_workshop(
  p_vehicle_id uuid,
  p_work_order_id uuid,
  p_make text,
  p_model text,
  p_variant text default null,
  p_first_registration date default null,
  p_license_plate text default null,
  p_hsn text default null,
  p_tsn text default null,
  p_vin text default null,
  p_mileage integer default null,
  p_type_variant_version text default null,
  p_engine_code text default null,
  p_displacement_ccm integer default null,
  p_power_kw integer default null,
  p_fuel_type text default null,
  p_transmission_code text default null,
  p_drive_type text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.vehicles;
  w public.work_orders;
  uid uuid := auth.uid();
  before_data jsonb;
  allowed boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into w
  from public.work_orders
  where id=p_work_order_id and vehicle_id=p_vehicle_id
  for update;

  if not found then raise exception 'work_order_vehicle_mismatch'; end if;
  if w.arrived_at is null then raise exception 'vehicle_not_checked_in'; end if;
  if w.stage in ('closed','cancelled','appointment_confirmed') then raise exception 'vehicle_not_in_workshop'; end if;

  select exists(
    select 1
    from public.workshop_members m
    where m.workshop_id=w.workshop_id
      and m.user_id=uid
      and m.active=true
      and (
        m.role in ('owner','office','mechanic')
        or (m.role='custom' and coalesce((m.permissions->>'vehicle_data')::boolean,false))
      )
  ) into allowed;

  if not allowed then raise exception 'not_authorized'; end if;

  select * into v from public.vehicles where id=p_vehicle_id for update;
  if not found then raise exception 'vehicle_not_found'; end if;
  if v.archived_at is not null then raise exception 'vehicle_archived'; end if;

  if nullif(trim(p_make),'') is null or nullif(trim(p_model),'') is null then
    raise exception 'make_and_model_required';
  end if;
  if p_mileage is not null and p_mileage<0 then raise exception 'invalid_mileage'; end if;
  if p_displacement_ccm is not null and (p_displacement_ccm<1 or p_displacement_ccm>20000) then raise exception 'invalid_displacement'; end if;
  if p_power_kw is not null and (p_power_kw<1 or p_power_kw>2000) then raise exception 'invalid_power'; end if;

  before_data:=jsonb_build_object(
    'make',v.make,'model',v.model,'variant',v.variant,'first_registration',v.first_registration,
    'license_plate',v.license_plate,'hsn',v.hsn,'tsn',v.tsn,'vin',v.vin,'mileage',v.mileage,
    'type_variant_version',v.type_variant_version,'engine_code',v.engine_code,
    'displacement_ccm',v.displacement_ccm,'power_kw',v.power_kw,'fuel_type',v.fuel_type,
    'transmission_code',v.transmission_code,'drive_type',v.drive_type
  );

  update public.vehicles
  set
    make=trim(p_make),
    model=trim(p_model),
    variant=nullif(trim(p_variant),''),
    first_registration=p_first_registration,
    license_plate=coalesce(nullif(upper(trim(p_license_plate)),''),license_plate),
    hsn=nullif(trim(p_hsn),''),
    tsn=nullif(upper(trim(p_tsn)),''),
    vin=nullif(upper(trim(p_vin)),''),
    mileage=p_mileage,
    type_variant_version=nullif(trim(p_type_variant_version),''),
    engine_code=nullif(upper(trim(p_engine_code)),''),
    displacement_ccm=p_displacement_ccm,
    power_kw=p_power_kw,
    fuel_type=nullif(trim(p_fuel_type),''),
    transmission_code=nullif(upper(trim(p_transmission_code)),''),
    drive_type=nullif(trim(p_drive_type),''),
    identity_verified_at=now(),
    identity_verified_by=uid,
    identity_verified_workshop_id=w.workshop_id,
    updated_at=now()
  where id=v.id
  returning * into v;

  insert into public.audit_events(
    workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id,payload
  )
  values(
    w.workshop_id,w.id,uid,'vehicle_identity_updated','vehicle',v.id::text,
    jsonb_build_object(
      'before',before_data,
      'after',jsonb_build_object(
        'make',v.make,'model',v.model,'variant',v.variant,'first_registration',v.first_registration,
        'license_plate',v.license_plate,'hsn',v.hsn,'tsn',v.tsn,'vin',v.vin,'mileage',v.mileage,
        'type_variant_version',v.type_variant_version,'engine_code',v.engine_code,
        'displacement_ccm',v.displacement_ccm,'power_kw',v.power_kw,'fuel_type',v.fuel_type,
        'transmission_code',v.transmission_code,'drive_type',v.drive_type
      )
    )
  );

  return v;
end;
$$;

revoke all on function public.update_vehicle_identity_as_workshop(
  uuid,uuid,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) from public;
grant execute on function public.update_vehicle_identity_as_workshop(
  uuid,uuid,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) to authenticated;
