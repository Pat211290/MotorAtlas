-- Privacy tightening:
-- 1) workshops see only history written by workshops they belong to;
--    the registered vehicle owner sees the full technical history.
-- 2) onboarding an existing workshop customer attaches that same customer's
--    already-created orders/documents/approvals to the new MotorAtlas account.
--    A vehicle transfer to a new owner does NOT transfer old customer records.

create or replace function public.get_vehicle_history(p_vehicle_id uuid)
returns table(
  id uuid,
  entry_type text,
  title text,
  summary text,
  mileage integer,
  occurred_at timestamptz,
  workshop_name text,
  work_order_id uuid,
  order_number text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  is_owner boolean := false;
begin
  select exists(
    select 1 from public.vehicles v
    where v.id=p_vehicle_id and v.owner_user_id=auth.uid()
  ) into is_owner;

  if not is_owner and not exists(
    select 1 from public.workshop_customer_vehicles cv
    where cv.vehicle_id=p_vehicle_id and cv.active and public.is_workshop_member(cv.workshop_id)
  ) and not exists(
    select 1 from public.work_orders w
    where w.vehicle_id=p_vehicle_id and public.is_workshop_member(w.workshop_id)
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    e.id,e.entry_type,e.title,e.summary,e.mileage,e.occurred_at,
    ws.name,w.id,w.order_number
  from public.vehicle_history_entries e
  join public.workshops ws on ws.id=e.workshop_id
  left join public.work_orders w on w.id=e.work_order_id
  where e.vehicle_id=p_vehicle_id
    and (is_owner or public.is_workshop_member(e.workshop_id))
  order by e.occurred_at desc,e.created_at desc;
end;
$$;

revoke all on function public.get_vehicle_history(uuid) from public;
grant execute on function public.get_vehicle_history(uuid) to authenticated;

create or replace function public.claim_vehicle_with_token(p_token text)
returns public.vehicles
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  uid uuid:=auth.uid();
  t public.vehicle_claim_tokens;
  v public.vehicles;
  c public.workshop_customers;
  p public.profiles;
  target_customer_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select * into t
  from public.vehicle_claim_tokens
  where token_hash=encode(digest(p_token,'sha256'),'hex')
  for update;

  if not found then raise exception 'claim_not_found'; end if;
  if t.used_at is not null then raise exception 'claim_already_used'; end if;
  if t.revoked_at is not null then raise exception 'claim_revoked'; end if;
  if t.expires_at<=now() then raise exception 'claim_expired'; end if;

  select * into v from public.vehicles where id=t.vehicle_id for update;
  if not found then raise exception 'vehicle_not_found'; end if;

  if v.owner_user_id is not null and v.owner_user_id<>uid and v.archived_at is null then
    raise exception 'vehicle_has_active_owner';
  end if;

  select * into p from public.profiles where id=uid;

  if t.claim_mode='onboarding' and t.customer_id is not null then
    select * into c
    from public.workshop_customers
    where id=t.customer_id and workshop_id=t.workshop_id
    for update;

    if not found then raise exception 'customer_not_found'; end if;
    if c.linked_user_id is not null and c.linked_user_id<>uid then raise exception 'customer_already_linked'; end if;

    update public.workshop_customers
    set linked_user_id=uid,source='claimed',updated_at=now()
    where id=c.id;
    target_customer_id:=c.id;

    update public.profiles
    set
      full_name=case when nullif(trim(full_name),'') is null then c.full_name else full_name end,
      phone=coalesce(phone,c.phone),
      street=coalesce(street,c.street),
      postal_code=coalesce(postal_code,c.postal_code),
      city=coalesce(city,c.city),
      updated_at=now()
    where id=uid;

    -- These records belong to the same person who has just created an account.
    -- Linking them now gives that customer the digital benefits without changing
    -- the underlying workshop history.
    update public.work_orders
    set customer_user_id=uid,updated_at=now()
    where local_customer_id=c.id
      and vehicle_id=v.id
      and customer_user_id is null;

    update public.documents
    set customer_user_id=uid
    where local_customer_id=c.id
      and work_order_id in(
        select w.id from public.work_orders w
        where w.local_customer_id=c.id and w.vehicle_id=v.id
      )
      and customer_user_id is null;

    update public.approvals
    set customer_user_id=uid
    where local_customer_id=c.id
      and work_order_id in(
        select w.id from public.work_orders w
        where w.local_customer_id=c.id and w.vehicle_id=v.id
      )
      and customer_user_id is null;
  else
    -- Transfer: end the prior workshop-side owner relation. Never attach
    -- previous owner's orders, documents or contact data to the buyer.
    update public.workshop_customer_vehicles
    set active=false,ended_at=now()
    where workshop_id=t.workshop_id and vehicle_id=v.id and active;

    insert into public.workshop_customers(
      workshop_id,linked_user_id,full_name,email,phone,street,postal_code,city,source,created_by
    )
    values(
      t.workshop_id,uid,
      coalesce(nullif(trim(p.full_name),''),'MotorAtlas-Kunde'),
      p.email,p.phone,p.street,p.postal_code,p.city,'claimed',t.created_by
    )
    returning id into target_customer_id;

    insert into public.workshop_customer_vehicles(workshop_id,customer_id,vehicle_id,relationship_type)
    values(t.workshop_id,target_customer_id,v.id,'owner');
  end if;

  update public.vehicles
  set
    owner_user_id=uid,
    archived_at=null,
    claimed_at=now(),
    claimed_from_workshop_id=t.workshop_id,
    updated_at=now()
  where id=v.id
  returning * into v;

  insert into public.customer_workshop_links(workshop_id,customer_user_id,is_primary,active)
  values(
    t.workshop_id,uid,
    not exists(
      select 1 from public.customer_workshop_links l
      where l.customer_user_id=uid and l.active and l.is_primary
    ),
    true
  )
  on conflict(workshop_id,customer_user_id)
  do update set active=true,ended_at=null;

  update public.vehicle_claim_tokens
  set used_at=now(),used_by=uid
  where id=t.id;

  return v;
end;
$$;

revoke all on function public.claim_vehicle_with_token(text) from public;
grant execute on function public.claim_vehicle_with_token(text) to authenticated;
