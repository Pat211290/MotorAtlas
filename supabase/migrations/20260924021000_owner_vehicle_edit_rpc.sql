-- Vehicle owners may maintain their own vehicle data at any time.
-- Direct table UPDATE remains blocked; the owner uses this narrow RPC so
-- workshop-verification metadata cannot be forged. Any owner change to
-- identification data invalidates the previous workshop verification.

create or replace function public.update_my_vehicle(
  p_vehicle_id uuid,
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
  uid uuid := auth.uid();
  identity_changed boolean := false;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into v
  from public.vehicles
  where id=p_vehicle_id
    and owner_user_id=uid
    and archived_at is null
  for update;

  if not found then raise exception 'vehicle_not_found'; end if;

  if nullif(trim(p_make),'') is null or nullif(trim(p_model),'') is null then
    raise exception 'make_and_model_required';
  end if;
  if nullif(trim(p_license_plate),'') is null then
    raise exception 'license_plate_required';
  end if;
  if p_mileage is not null and p_mileage<0 then raise exception 'invalid_mileage'; end if;
  if p_displacement_ccm is not null and (p_displacement_ccm<1 or p_displacement_ccm>20000) then raise exception 'invalid_displacement'; end if;
  if p_power_kw is not null and (p_power_kw<1 or p_power_kw>2000) then raise exception 'invalid_power'; end if;

  identity_changed := (
    v.make is distinct from trim(p_make)
    or v.model is distinct from trim(p_model)
    or v.variant is distinct from nullif(trim(p_variant),'')
    or v.first_registration is distinct from p_first_registration
    or v.license_plate is distinct from upper(trim(p_license_plate))
    or v.hsn is distinct from nullif(trim(p_hsn),'')
    or v.tsn is distinct from nullif(upper(trim(p_tsn)),'')
    or v.vin is distinct from nullif(upper(trim(p_vin)),'')
    or v.type_variant_version is distinct from nullif(trim(p_type_variant_version),'')
    or v.engine_code is distinct from nullif(upper(trim(p_engine_code)),'')
    or v.displacement_ccm is distinct from p_displacement_ccm
    or v.power_kw is distinct from p_power_kw
    or v.fuel_type is distinct from nullif(trim(p_fuel_type),'')
    or v.transmission_code is distinct from nullif(upper(trim(p_transmission_code)),'')
    or v.drive_type is distinct from nullif(trim(p_drive_type),'')
  );

  update public.vehicles
  set
    make=trim(p_make),
    model=trim(p_model),
    variant=nullif(trim(p_variant),''),
    first_registration=p_first_registration,
    license_plate=upper(trim(p_license_plate)),
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
    identity_verified_at=case when identity_changed then null else identity_verified_at end,
    identity_verified_by=case when identity_changed then null else identity_verified_by end,
    identity_verified_workshop_id=case when identity_changed then null else identity_verified_workshop_id end,
    updated_at=now()
  where id=v.id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.update_my_vehicle(
  uuid,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) from public;
grant execute on function public.update_my_vehicle(
  uuid,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) to authenticated;
