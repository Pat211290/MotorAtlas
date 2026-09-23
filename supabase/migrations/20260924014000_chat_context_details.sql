create or replace function public.get_chat_context(p_thread_id uuid)
returns table(
  thread_id uuid,
  work_order_id uuid,
  order_number text,
  customer_user_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_street text,
  customer_postal_code text,
  customer_city text,
  vehicle_id uuid,
  vehicle_make text,
  vehicle_model text,
  vehicle_variant text,
  license_plate text,
  first_registration date,
  hsn text,
  tsn text,
  vin text,
  mileage integer,
  photo_path text
)
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  t public.chat_threads;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into t
  from public.chat_threads
  where id=p_thread_id;

  if not found then
    raise exception 'chat_thread_not_found';
  end if;

  if uid<>t.customer_user_id
     and not exists(
       select 1
       from public.workshop_members wm
       where wm.workshop_id=t.workshop_id
         and wm.user_id=uid
         and wm.active=true
     ) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    t.id,
    t.work_order_id,
    w.order_number,
    t.customer_user_id,
    coalesce(nullif(p.full_name,''),'Kunde'),
    p.email,
    p.phone,
    p.street,
    p.postal_code,
    p.city,
    v.id,
    v.make,
    v.model,
    v.variant,
    v.license_plate,
    v.first_registration,
    v.hsn,
    v.tsn,
    v.vin,
    v.mileage,
    v.photo_path
  from public.vehicles v
  left join public.profiles p on p.id=t.customer_user_id
  left join public.work_orders w on w.id=t.work_order_id
  where v.id=t.vehicle_id;
end;
$$;

revoke all on function public.get_chat_context(uuid) from public;
grant execute on function public.get_chat_context(uuid) to authenticated;
