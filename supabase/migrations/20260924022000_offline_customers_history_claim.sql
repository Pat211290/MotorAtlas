-- Offline workshop customers, vehicle service history and secure QR vehicle claiming.
-- Personal customer records stay workshop-scoped. Vehicle history is technical/service data only.

alter table public.vehicles
  alter column owner_user_id drop not null;

alter table public.vehicles
  add column if not exists created_by_workshop_id uuid references public.workshops(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists claimed_from_workshop_id uuid references public.workshops(id) on delete set null;

create unique index if not exists vehicles_vin_unique_idx
  on public.vehicles((upper(trim(vin))))
  where nullif(trim(vin),'') is not null;

create table if not exists public.workshop_customers(
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  linked_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  street text,
  postal_code text,
  city text,
  country_code text not null default 'DE',
  source text not null default 'workshop',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_customers_source_check check(source in ('workshop','claimed','imported'))
);

create index if not exists workshop_customers_workshop_name_idx
  on public.workshop_customers(workshop_id,lower(full_name));
create index if not exists workshop_customers_linked_user_idx
  on public.workshop_customers(linked_user_id)
  where linked_user_id is not null;

create table if not exists public.workshop_customer_vehicles(
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid not null references public.workshop_customers(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  relationship_type text not null default 'owner',
  active boolean not null default true,
  linked_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint workshop_customer_vehicle_relationship_check check(relationship_type in ('owner','keeper','contact')),
  unique(workshop_id,customer_id,vehicle_id)
);

create index if not exists workshop_customer_vehicles_vehicle_idx
  on public.workshop_customer_vehicles(vehicle_id,workshop_id)
  where active=true;

create table if not exists public.vehicle_history_entries(
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  source_event_id bigint unique,
  entry_type text not null,
  title text not null,
  summary text,
  mileage integer,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicle_history_entry_type_check check(entry_type in ('diagnosis','repair','maintenance','inspection','service','note'))
);

create index if not exists vehicle_history_vehicle_date_idx
  on public.vehicle_history_entries(vehicle_id,occurred_at desc);

create table if not exists public.vehicle_claim_tokens(
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid references public.workshop_customers(id) on delete set null,
  claim_mode text not null default 'onboarding',
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint vehicle_claim_mode_check check(claim_mode in ('onboarding','transfer'))
);

create index if not exists vehicle_claim_tokens_vehicle_idx
  on public.vehicle_claim_tokens(vehicle_id,created_at desc);

alter table public.workshop_customers enable row level security;
alter table public.workshop_customer_vehicles enable row level security;
alter table public.vehicle_history_entries enable row level security;
alter table public.vehicle_claim_tokens enable row level security;

drop policy if exists workshop_customers_member_select on public.workshop_customers;
create policy workshop_customers_member_select
on public.workshop_customers for select
using(public.is_workshop_member(workshop_id));

drop policy if exists workshop_customers_manage on public.workshop_customers;
create policy workshop_customers_manage
on public.workshop_customers for all
using(public.has_workshop_permission(workshop_id,'customers'))
with check(public.has_workshop_permission(workshop_id,'customers'));

drop policy if exists workshop_customer_vehicles_member_select on public.workshop_customer_vehicles;
create policy workshop_customer_vehicles_member_select
on public.workshop_customer_vehicles for select
using(public.is_workshop_member(workshop_id));

drop policy if exists workshop_customer_vehicles_manage on public.workshop_customer_vehicles;
create policy workshop_customer_vehicles_manage
on public.workshop_customer_vehicles for all
using(public.has_workshop_permission(workshop_id,'customers'))
with check(public.has_workshop_permission(workshop_id,'customers'));

drop policy if exists vehicle_history_owner_select on public.vehicle_history_entries;
create policy vehicle_history_owner_select
on public.vehicle_history_entries for select
using(
  exists(
    select 1 from public.vehicles v
    where v.id=vehicle_history_entries.vehicle_id
      and v.owner_user_id=auth.uid()
  )
);

drop policy if exists vehicle_history_workshop_select on public.vehicle_history_entries;
create policy vehicle_history_workshop_select
on public.vehicle_history_entries for select
using(public.is_workshop_member(workshop_id));

drop policy if exists vehicle_history_workshop_manage on public.vehicle_history_entries;
create policy vehicle_history_workshop_manage
on public.vehicle_history_entries for insert
with check(public.has_workshop_permission(workshop_id,'customers'));

drop policy if exists vehicle_claim_tokens_workshop_select on public.vehicle_claim_tokens;
create policy vehicle_claim_tokens_workshop_select
on public.vehicle_claim_tokens for select
using(public.has_workshop_permission(workshop_id,'customers'));

drop policy if exists vehicles_owner_all_select on public.vehicles;
create policy vehicles_owner_all_select
on public.vehicles for select
using(
  owner_user_id=auth.uid()
  or exists(
    select 1 from public.customer_workshop_links l
    where l.customer_user_id=vehicles.owner_user_id
      and l.active
      and public.is_workshop_member(l.workshop_id)
  )
  or exists(
    select 1 from public.workshop_customer_vehicles wcv
    where wcv.vehicle_id=vehicles.id
      and wcv.active
      and public.is_workshop_member(wcv.workshop_id)
  )
);

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
begin
  if not public.has_workshop_permission(p_workshop_id,'customers') then
    raise exception 'not_authorized';
  end if;
  if nullif(trim(p_full_name),'') is null then raise exception 'customer_name_required'; end if;
  if nullif(trim(p_make),'') is null or nullif(trim(p_model),'') is null then raise exception 'make_and_model_required'; end if;
  if nullif(trim(p_license_plate),'') is null then raise exception 'license_plate_required'; end if;
  if p_mileage is not null and p_mileage<0 then raise exception 'invalid_mileage'; end if;

  if normalized_vin is not null then
    select * into v from public.vehicles where upper(trim(vin))=normalized_vin limit 1;
  end if;

  insert into public.workshop_customers(
    workshop_id,full_name,phone,email,street,postal_code,city,created_by
  )
  values(
    p_workshop_id,trim(p_full_name),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),
    nullif(trim(p_street),''),nullif(trim(p_postal_code),''),nullif(trim(p_city),''),auth.uid()
  )
  returning * into c;

  if v.id is null then
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
  end if;

  insert into public.workshop_customer_vehicles(workshop_id,customer_id,vehicle_id,relationship_type)
  values(p_workshop_id,c.id,v.id,'owner')
  on conflict(workshop_id,customer_id,vehicle_id)
  do update set active=true,ended_at=null,relationship_type='owner';

  return query select c.id,v.id;
end;
$$;

revoke all on function public.create_workshop_customer_vehicle(
  uuid,text,text,text,text,text,text,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) from public;
grant execute on function public.create_workshop_customer_vehicle(
  uuid,text,text,text,text,text,text,text,text,text,date,text,text,text,text,integer,text,text,integer,integer,text,text,text
) to authenticated;

create or replace function public.list_workshop_customer_directory(
  p_workshop_id uuid,
  p_search text default null
)
returns table(
  customer_id uuid,
  linked_user_id uuid,
  customer_name text,
  phone text,
  email text,
  street text,
  postal_code text,
  city text,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text,
  vin text,
  mileage integer,
  owner_user_id uuid,
  identity_verified_at timestamptz,
  last_history_at timestamptz,
  history_count bigint
)
language plpgsql
security definer
set search_path=public
as $$
declare
  q text := '%'||lower(coalesce(trim(p_search),''))||'%';
begin
  if not public.is_workshop_member(p_workshop_id) then raise exception 'not_authorized'; end if;

  return query
  with local_rows as(
    select
      c.id customer_id,c.linked_user_id,c.full_name customer_name,c.phone,c.email,c.street,c.postal_code,c.city,
      v.id vehicle_id,v.make,v.model,v.variant,v.license_plate,v.vin,v.mileage,v.owner_user_id,v.identity_verified_at
    from public.workshop_customers c
    join public.workshop_customer_vehicles cv
      on cv.customer_id=c.id and cv.workshop_id=c.workshop_id and cv.active
    join public.vehicles v on v.id=cv.vehicle_id
    where c.workshop_id=p_workshop_id and c.active
  ),
  registered_rows as(
    select
      null::uuid customer_id,p.id linked_user_id,p.full_name customer_name,p.phone,p.email,p.street,p.postal_code,p.city,
      v.id vehicle_id,v.make,v.model,v.variant,v.license_plate,v.vin,v.mileage,v.owner_user_id,v.identity_verified_at
    from public.customer_workshop_links l
    join public.profiles p on p.id=l.customer_user_id
    join public.vehicles v on v.owner_user_id=l.customer_user_id and v.archived_at is null
    where l.workshop_id=p_workshop_id and l.active
      and not exists(
        select 1 from local_rows lr where lr.vehicle_id=v.id
      )
  ),
  all_rows as(
    select * from local_rows
    union all
    select * from registered_rows
  )
  select
    a.customer_id,a.linked_user_id,a.customer_name,a.phone,a.email,a.street,a.postal_code,a.city,
    a.vehicle_id,a.make,a.model,a.variant,a.license_plate,a.vin,a.mileage,a.owner_user_id,a.identity_verified_at,
    h.last_history_at,coalesce(h.history_count,0)
  from all_rows a
  left join lateral(
    select max(e.occurred_at) last_history_at,count(*) history_count
    from public.vehicle_history_entries e
    where e.vehicle_id=a.vehicle_id
  ) h on true
  where coalesce(trim(p_search),'')=''
     or lower(coalesce(a.customer_name,'')) like q
     or lower(coalesce(a.make,'')) like q
     or lower(coalesce(a.model,'')) like q
     or lower(coalesce(a.variant,'')) like q
     or lower(coalesce(a.license_plate,'')) like q
     or lower(coalesce(a.vin,'')) like q
  order by lower(a.customer_name),lower(a.make),lower(a.model),lower(a.license_plate);
end;
$$;

revoke all on function public.list_workshop_customer_directory(uuid,text) from public;
grant execute on function public.list_workshop_customer_directory(uuid,text) to authenticated;

create or replace function public.add_vehicle_history_entry(
  p_vehicle_id uuid,
  p_workshop_id uuid,
  p_entry_type text,
  p_title text,
  p_summary text default null,
  p_mileage integer default null,
  p_occurred_at timestamptz default now()
)
returns public.vehicle_history_entries
language plpgsql
security definer
set search_path=public
as $$
declare e public.vehicle_history_entries;
begin
  if not public.has_workshop_permission(p_workshop_id,'customers') then raise exception 'not_authorized'; end if;
  if p_entry_type not in ('diagnosis','repair','maintenance','inspection','service','note') then raise exception 'invalid_entry_type'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'title_required'; end if;
  if not exists(
    select 1 from public.workshop_customer_vehicles cv
    where cv.workshop_id=p_workshop_id and cv.vehicle_id=p_vehicle_id and cv.active
  ) and not exists(
    select 1 from public.work_orders w
    where w.workshop_id=p_workshop_id and w.vehicle_id=p_vehicle_id
  ) then raise exception 'vehicle_not_known_to_workshop'; end if;

  insert into public.vehicle_history_entries(
    vehicle_id,workshop_id,entry_type,title,summary,mileage,occurred_at,created_by
  )
  values(
    p_vehicle_id,p_workshop_id,p_entry_type,trim(p_title),nullif(trim(p_summary),''),p_mileage,p_occurred_at,auth.uid()
  )
  returning * into e;
  return e;
end;
$$;

revoke all on function public.add_vehicle_history_entry(uuid,uuid,text,text,text,integer,timestamptz) from public;
grant execute on function public.add_vehicle_history_entry(uuid,uuid,text,text,text,integer,timestamptz) to authenticated;

create or replace function public.vehicle_history_from_event()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
  v public.vehicles;
  title_text text;
  summary_text text;
  entry_kind text;
begin
  if new.event_type not in ('diagnosis_completed','repair_completed') then return new; end if;
  select * into w from public.work_orders where id=new.work_order_id;
  if not found then return new; end if;
  select * into v from public.vehicles where id=w.vehicle_id;

  if new.event_type='diagnosis_completed' then
    entry_kind:='diagnosis';
    title_text:='Diagnose abgeschlossen';
    summary_text:=nullif(new.payload->>'summary','');
  else
    entry_kind:='repair';
    title_text:='Arbeiten abgeschlossen';
    summary_text:=coalesce(nullif(new.payload->>'note',''),'Arbeiten am Fahrzeug abgeschlossen.');
  end if;

  insert into public.vehicle_history_entries(
    vehicle_id,workshop_id,work_order_id,source_event_id,entry_type,title,summary,mileage,occurred_at,created_by
  )
  values(
    w.vehicle_id,w.workshop_id,w.id,new.id,entry_kind,title_text,summary_text,v.mileage,new.created_at,new.actor_user_id
  )
  on conflict(source_event_id) do nothing;

  return new;
end;
$$;

drop trigger if exists vehicle_history_from_work_order_event on public.work_order_events;
create trigger vehicle_history_from_work_order_event
after insert on public.work_order_events
for each row execute function public.vehicle_history_from_event();

insert into public.vehicle_history_entries(
  vehicle_id,workshop_id,work_order_id,source_event_id,entry_type,title,summary,mileage,occurred_at,created_by
)
select
  w.vehicle_id,e.workshop_id,w.id,e.id,
  case when e.event_type='diagnosis_completed' then 'diagnosis' else 'repair' end,
  case when e.event_type='diagnosis_completed' then 'Diagnose abgeschlossen' else 'Arbeiten abgeschlossen' end,
  case when e.event_type='diagnosis_completed'
       then nullif(e.payload->>'summary','')
       else coalesce(nullif(e.payload->>'note',''),'Arbeiten am Fahrzeug abgeschlossen.')
  end,
  v.mileage,e.created_at,e.actor_user_id
from public.work_order_events e
join public.work_orders w on w.id=e.work_order_id
join public.vehicles v on v.id=w.vehicle_id
where e.event_type in ('diagnosis_completed','repair_completed')
on conflict(source_event_id) do nothing;

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
begin
  if not exists(
    select 1 from public.vehicles v
    where v.id=p_vehicle_id and v.owner_user_id=auth.uid()
  ) and not exists(
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
  order by e.occurred_at desc,e.created_at desc;
end;
$$;

revoke all on function public.get_vehicle_history(uuid) from public;
grant execute on function public.get_vehicle_history(uuid) to authenticated;

create or replace function public.create_vehicle_claim_token(
  p_vehicle_id uuid,
  p_workshop_id uuid,
  p_customer_id uuid default null,
  p_claim_mode text default 'onboarding'
)
returns table(token text,expires_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v public.vehicles;
  raw_token text;
  expiry timestamptz := now()+interval '14 days';
begin
  if not public.has_workshop_permission(p_workshop_id,'customers') then raise exception 'not_authorized'; end if;
  if p_claim_mode not in ('onboarding','transfer') then raise exception 'invalid_claim_mode'; end if;

  select * into v from public.vehicles where id=p_vehicle_id for update;
  if not found then raise exception 'vehicle_not_found'; end if;

  if not exists(
    select 1 from public.workshop_customer_vehicles cv
    where cv.workshop_id=p_workshop_id and cv.vehicle_id=v.id and cv.active
  ) and not exists(
    select 1 from public.work_orders w
    where w.workshop_id=p_workshop_id and w.vehicle_id=v.id
  ) then raise exception 'vehicle_not_known_to_workshop'; end if;

  if p_customer_id is not null and not exists(
    select 1 from public.workshop_customers c
    where c.id=p_customer_id and c.workshop_id=p_workshop_id and c.active
  ) then raise exception 'customer_not_found'; end if;

  if p_claim_mode='onboarding' and v.owner_user_id is not null then
    raise exception 'vehicle_already_claimed';
  end if;

  if p_claim_mode='transfer' and v.owner_user_id is not null and v.archived_at is null then
    raise exception 'active_owner_must_release_vehicle';
  end if;

  update public.vehicle_claim_tokens
  set revoked_at=now()
  where vehicle_id=v.id and workshop_id=p_workshop_id
    and used_at is null and revoked_at is null and expires_at>now();

  raw_token:=encode(gen_random_bytes(32),'hex');

  insert into public.vehicle_claim_tokens(
    vehicle_id,workshop_id,customer_id,claim_mode,token_hash,expires_at,created_by
  )
  values(
    v.id,p_workshop_id,p_customer_id,p_claim_mode,
    encode(digest(raw_token,'sha256'),'hex'),expiry,auth.uid()
  );

  return query select raw_token,expiry;
end;
$$;

revoke all on function public.create_vehicle_claim_token(uuid,uuid,uuid,text) from public;
grant execute on function public.create_vehicle_claim_token(uuid,uuid,uuid,text) to authenticated;

create or replace function public.get_vehicle_claim_preview(p_token text)
returns table(
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text,
  workshop_name text,
  claim_mode text,
  expires_at timestamptz,
  valid boolean
)
language plpgsql
security definer
set search_path=public,extensions
as $$
begin
  return query
  select
    v.id,v.make,v.model,v.variant,v.license_plate,w.name,t.claim_mode,t.expires_at,
    (t.used_at is null and t.revoked_at is null and t.expires_at>now())
  from public.vehicle_claim_tokens t
  join public.vehicles v on v.id=t.vehicle_id
  join public.workshops w on w.id=t.workshop_id
  where t.token_hash=encode(digest(p_token,'sha256'),'hex')
  limit 1;
end;
$$;

revoke all on function public.get_vehicle_claim_preview(text) from public;
grant execute on function public.get_vehicle_claim_preview(text) to anon,authenticated;

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
    select * into c from public.workshop_customers where id=t.customer_id and workshop_id=t.workshop_id for update;
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
  else
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
    not exists(select 1 from public.customer_workshop_links l where l.customer_user_id=uid and l.active and l.is_primary),
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
