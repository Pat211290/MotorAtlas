-- Do not let a workshop attach an already-existing VIN to a newly created local customer.
-- Existing vehicles must be opened from the existing vehicle file or transferred through the claim flow.

create or replace function public.create_workshop_customer_vehicle(
  p_workshop_id uuid,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_street text default null,
  p_postal_code text default null,
  p_city text default null,
  p_make text default null,
  p_model text default null,
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
returns table(customer_id uuid,vehicle_id uuid)
language plpgsql
security definer
set search_path=public
as $$
declare
  c public.workshop_customers;
  v public.vehicles;
  normalized_vin text := nullif(upper(trim(p_vin)),'');
  known_here boolean := false;
begin
  if not public.has_workshop_permission(p_workshop_id,'customers') then
    raise exception 'not_authorized';
  end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'customer_name_required'; end if;
  if nullif(trim(p_make),'') is null or nullif(trim(p_model),'') is null then raise exception 'make_and_model_required'; end if;
  if nullif(trim(p_license_plate),'') is null then raise exception 'license_plate_required'; end if;
  if p_mileage is not null and p_mileage<0 then raise exception 'invalid_mileage'; end if;

  if normalized_vin is not null then
    select * into v
    from public.vehicles
    where upper(trim(vin))=normalized_vin
    limit 1;

    if found then
      select (
        exists(
          select 1 from public.workshop_customer_vehicles cv
          where cv.workshop_id=p_workshop_id and cv.vehicle_id=v.id and cv.active
        )
        or exists(
          select 1 from public.work_orders w
          where w.workshop_id=p_workshop_id and w.vehicle_id=v.id
        )
        or (
          v.owner_user_id is not null
          and exists(
            select 1 from public.customer_workshop_links l
            where l.workshop_id=p_workshop_id
              and l.customer_user_id=v.owner_user_id
              and l.active
          )
        )
      ) into known_here;

      if known_here then
        raise exception 'vehicle_already_known_to_workshop';
      end if;

      -- Intentionally do not reveal who owns it or which workshop knows it.
      raise exception 'vehicle_exists_claim_required';
    end if;
  end if;

  insert into public.workshop_customers(
    workshop_id,full_name,phone,email,street,postal_code,city,created_by
  )
  values(
    p_workshop_id,trim(p_full_name),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),
    nullif(trim(p_street),''),nullif(trim(p_postal_code),''),nullif(trim(p_city),''),auth.uid()
  )
  returning * into c;

  insert into public.vehicles(
    owner_user_id,make,model,variant,first_registration,license_plate,hsn,tsn,vin,mileage,photo_path,
    type_variant_version,engine_code,displacement_ccm,power_kw,fuel_type,transmission_code,drive_type,
    created_by_workshop_id
  )
  values(
    null,trim(p_make),trim(p_model),nullif(trim(p_variant),''),p_first_registration,upper(trim(p_license_plate)),
    nullif(trim(p_hsn),''),nullif(upper(trim(p_tsn)),''),normalized_vin,p_mileage,'',
    nullif(trim(p_type_variant_version),''),nullif(upper(trim(p_engine_code)),''),p_displacement_ccm,p_power_kw,
    nullif(trim(p_fuel_type),''),nullif(upper(trim(p_transmission_code)),''),nullif(trim(p_drive_type),''),
    p_workshop_id
  )
  returning * into v;

  insert into public.workshop_customer_vehicles(workshop_id,customer_id,vehicle_id,relationship_type)
  values(p_workshop_id,c.id,v.id,'owner');

  return query select c.id,v.id;
end;
$$;

revoke all on function public.create_workshop_customer_vehicle(
  uuid,text,text,text,text,text,text,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) from public;
grant execute on function public.create_workshop_customer_vehicle(
  uuid,text,text,text,text,text,text,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) to authenticated;
