-- MotorAtlas vehicle transfer options:
-- seller handoff, verification at any MotorAtlas workshop, or manual support review with purchase-contract evidence.

create table if not exists public.support_admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'support',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint support_admin_role_check check(role in ('support','admin','owner'))
);

-- Bootstrap the current MotorAtlas owner/support account.
insert into public.support_admins(user_id,role,active)
values('c39c08cb-40e3-4506-b500-189c566f1303','owner',true)
on conflict(user_id) do update set role='owner',active=true;

create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.support_admins a
    where a.user_id=auth.uid() and a.active
  );
$$;

revoke all on function public.is_support_admin() from public;
grant execute on function public.is_support_admin() to authenticated;

alter table public.vehicle_claim_tokens
  alter column workshop_id drop not null;

create table if not exists public.vehicle_transfer_verifications(
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  verified_by uuid not null references auth.users(id) on delete restrict,
  verification_method text not null default 'in_person',
  created_at timestamptz not null default now(),
  constraint vehicle_transfer_verification_method_check check(verification_method in ('in_person'))
);

create table if not exists public.vehicle_claim_requests(
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  method text not null default 'support_contract',
  status text not null default 'pending',
  vin_snapshot text not null,
  claimant_note text,
  evidence_path text,
  evidence_uploaded_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_claim_request_method_check check(method in ('support_contract')),
  constraint vehicle_claim_request_status_check check(status in ('pending','approved','rejected','cancelled'))
);

create unique index if not exists vehicle_claim_request_one_pending_idx
  on public.vehicle_claim_requests(vehicle_id,claimant_user_id)
  where status='pending';

alter table public.support_admins enable row level security;
alter table public.vehicle_transfer_verifications enable row level security;
alter table public.vehicle_claim_requests enable row level security;

drop policy if exists support_admin_self_read on public.support_admins;
create policy support_admin_self_read on public.support_admins
for select using(user_id=auth.uid() or public.is_support_admin());

drop policy if exists transfer_verifications_workshop_read on public.vehicle_transfer_verifications;
create policy transfer_verifications_workshop_read on public.vehicle_transfer_verifications
for select using(public.is_workshop_member(workshop_id) or public.is_support_admin());

drop policy if exists claim_requests_claimant_read on public.vehicle_claim_requests;
create policy claim_requests_claimant_read on public.vehicle_claim_requests
for select using(claimant_user_id=auth.uid() or public.is_support_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'vehicle-claim-evidence','vehicle-claim-evidence',false,15728640,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict(id) do update
set public=false,file_size_limit=15728640,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists claim_evidence_owner_insert on storage.objects;
create policy claim_evidence_owner_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='vehicle-claim-evidence'
  and (storage.foldername(name))[1]=(auth.uid())::text
  and exists(
    select 1 from public.vehicle_claim_requests r
    where r.id=((storage.foldername(name))[2])::uuid
      and r.claimant_user_id=auth.uid()
      and r.status='pending'
  )
);

drop policy if exists claim_evidence_owner_or_support_read on storage.objects;
create policy claim_evidence_owner_or_support_read on storage.objects
for select to authenticated
using(
  bucket_id='vehicle-claim-evidence'
  and (
    (storage.foldername(name))[1]=(auth.uid())::text
    or public.is_support_admin()
  )
);

drop policy if exists claim_evidence_owner_delete on storage.objects;
create policy claim_evidence_owner_delete on storage.objects
for delete to authenticated
using(
  bucket_id='vehicle-claim-evidence'
  and (storage.foldername(name))[1]=(auth.uid())::text
  and exists(
    select 1 from public.vehicle_claim_requests r
    where r.id=((storage.foldername(name))[2])::uuid
      and r.claimant_user_id=auth.uid()
      and r.status='pending'
  )
);

create or replace function public.lookup_vehicle_for_claim(p_vin text)
returns table(
  exists_in_motoratlas boolean,
  already_mine boolean,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text,
  previous_owner_released boolean
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.vehicles;
  normalized_vin text:=nullif(upper(trim(p_vin)),'');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if normalized_vin is null or length(normalized_vin)<>17 then raise exception 'invalid_vin'; end if;

  select * into v
  from public.vehicles
  where upper(trim(vin))=normalized_vin
  limit 1;

  if not found then
    return query select false,false,null::uuid,null::text,null::text,null::text,null::text,false;
    return;
  end if;

  return query
  select
    true,
    v.owner_user_id=auth.uid(),
    v.id,
    v.make,
    v.model,
    v.variant,
    v.license_plate,
    (v.owner_user_id is null or v.archived_at is not null);
end;
$$;

revoke all on function public.lookup_vehicle_for_claim(text) from public;
grant execute on function public.lookup_vehicle_for_claim(text) to authenticated;

create or replace function public.create_owner_vehicle_transfer_token(p_vehicle_id uuid)
returns table(token text,expires_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v public.vehicles;
  raw_token text;
  expiry timestamptz:=now()+interval '14 days';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v
  from public.vehicles
  where id=p_vehicle_id and owner_user_id=auth.uid()
  for update;

  if not found then raise exception 'vehicle_not_found'; end if;

  if exists(
    select 1 from public.work_orders w
    where w.vehicle_id=v.id and w.stage not in ('closed','cancelled')
  ) then raise exception 'vehicle_has_active_work_order'; end if;

  if exists(
    select 1 from public.service_requests r
    where r.vehicle_id=v.id and r.status in ('submitted','accepted','appointment_pending')
  ) then raise exception 'vehicle_has_active_request'; end if;

  update public.vehicles
  set archived_at=coalesce(archived_at,now()),updated_at=now()
  where id=v.id;

  update public.vehicle_claim_tokens
  set revoked_at=now()
  where vehicle_id=v.id and used_at is null and revoked_at is null and expires_at>now();

  raw_token:=encode(gen_random_bytes(32),'hex');

  insert into public.vehicle_claim_tokens(
    vehicle_id,workshop_id,customer_id,claim_mode,token_hash,expires_at,created_by
  )
  values(
    v.id,null,null,'transfer',encode(digest(raw_token,'sha256'),'hex'),expiry,auth.uid()
  );

  return query select raw_token,expiry;
end;
$$;

revoke all on function public.create_owner_vehicle_transfer_token(uuid) from public;
grant execute on function public.create_owner_vehicle_transfer_token(uuid) to authenticated;

create or replace function public.create_verified_vehicle_transfer_token(
  p_workshop_id uuid,
  p_vin text
)
returns table(
  token text,
  expires_at timestamptz,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v public.vehicles;
  raw_token text;
  expiry timestamptz:=now()+interval '14 days';
  normalized_vin text:=nullif(upper(trim(p_vin)),'');
begin
  if not public.has_workshop_permission(p_workshop_id,'customers') then
    raise exception 'not_authorized';
  end if;
  if normalized_vin is null or length(normalized_vin)<>17 then raise exception 'invalid_vin'; end if;

  select * into v
  from public.vehicles
  where upper(trim(vin))=normalized_vin
  for update;

  if not found then raise exception 'vehicle_not_found'; end if;

  if v.owner_user_id is not null and v.archived_at is null then
    raise exception 'active_owner_requires_release_or_support';
  end if;

  update public.vehicle_claim_tokens
  set revoked_at=now()
  where vehicle_id=v.id and used_at is null and revoked_at is null and expires_at>now();

  raw_token:=encode(gen_random_bytes(32),'hex');

  insert into public.vehicle_claim_tokens(
    vehicle_id,workshop_id,customer_id,claim_mode,token_hash,expires_at,created_by
  )
  values(
    v.id,p_workshop_id,null,'transfer',encode(digest(raw_token,'sha256'),'hex'),expiry,auth.uid()
  );

  insert into public.vehicle_transfer_verifications(vehicle_id,workshop_id,verified_by,verification_method)
  values(v.id,p_workshop_id,auth.uid(),'in_person');

  return query select raw_token,expiry,v.id,v.make,v.model,v.variant,v.license_plate;
end;
$$;

revoke all on function public.create_verified_vehicle_transfer_token(uuid,text) from public;
grant execute on function public.create_verified_vehicle_transfer_token(uuid,text) to authenticated;

create or replace function public.create_support_vehicle_claim(
  p_vin text,
  p_note text default null
)
returns table(
  claim_id uuid,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.vehicles;
  r public.vehicle_claim_requests;
  normalized_vin text:=nullif(upper(trim(p_vin)),'');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if normalized_vin is null or length(normalized_vin)<>17 then raise exception 'invalid_vin'; end if;

  select * into v
  from public.vehicles
  where upper(trim(vin))=normalized_vin
  limit 1;

  if not found then raise exception 'vehicle_not_found'; end if;
  if v.owner_user_id=auth.uid() then raise exception 'vehicle_already_mine'; end if;

  select * into r
  from public.vehicle_claim_requests
  where vehicle_id=v.id and claimant_user_id=auth.uid() and status='pending'
  order by created_at desc
  limit 1;

  if r.id is null then
    insert into public.vehicle_claim_requests(
      vehicle_id,claimant_user_id,method,status,vin_snapshot,claimant_note
    )
    values(v.id,auth.uid(),'support_contract','pending',normalized_vin,nullif(trim(p_note),''))
    returning * into r;
  else
    update public.vehicle_claim_requests
    set claimant_note=coalesce(nullif(trim(p_note),''),claimant_note),updated_at=now()
    where id=r.id
    returning * into r;
  end if;

  return query select r.id,v.id,v.make,v.model,v.variant,v.license_plate;
end;
$$;

revoke all on function public.create_support_vehicle_claim(text,text) from public;
grant execute on function public.create_support_vehicle_claim(text,text) to authenticated;

create or replace function public.attach_support_vehicle_claim_evidence(
  p_claim_id uuid,
  p_storage_path text
)
returns public.vehicle_claim_requests
language plpgsql
security definer
set search_path=public
as $$
declare r public.vehicle_claim_requests;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into r
  from public.vehicle_claim_requests
  where id=p_claim_id and claimant_user_id=auth.uid()
  for update;

  if not found then raise exception 'claim_not_found'; end if;
  if r.status<>'pending' then raise exception 'claim_not_pending'; end if;

  if split_part(p_storage_path,'/',1)<>(auth.uid())::text
     or split_part(p_storage_path,'/',2)<>r.id::text then
    raise exception 'invalid_evidence_path';
  end if;

  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='vehicle-claim-evidence' and o.name=p_storage_path
  ) then raise exception 'evidence_not_uploaded'; end if;

  update public.vehicle_claim_requests
  set evidence_path=p_storage_path,evidence_uploaded_at=now(),updated_at=now()
  where id=r.id
  returning * into r;

  return r;
end;
$$;

revoke all on function public.attach_support_vehicle_claim_evidence(uuid,text) from public;
grant execute on function public.attach_support_vehicle_claim_evidence(uuid,text) to authenticated;

create or replace function public.list_my_vehicle_claim_requests()
returns table(
  id uuid,
  status text,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text,
  evidence_uploaded boolean,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select
    r.id,r.status,v.id,v.make,v.model,v.variant,v.license_plate,
    (r.evidence_path is not null),r.review_note,r.created_at,r.reviewed_at
  from public.vehicle_claim_requests r
  join public.vehicles v on v.id=r.vehicle_id
  where r.claimant_user_id=auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.list_my_vehicle_claim_requests() from public;
grant execute on function public.list_my_vehicle_claim_requests() to authenticated;

create or replace function public.list_support_vehicle_claim_requests()
returns table(
  id uuid,
  status text,
  claimant_user_id uuid,
  claimant_name text,
  claimant_email text,
  claimant_note text,
  vehicle_id uuid,
  make text,
  model text,
  variant text,
  license_plate text,
  vin text,
  evidence_path text,
  created_at timestamptz,
  reviewed_at timestamptz,
  review_note text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_support_admin() then raise exception 'not_authorized'; end if;

  return query
  select
    r.id,r.status,r.claimant_user_id,p.full_name,p.email,r.claimant_note,
    v.id,v.make,v.model,v.variant,v.license_plate,v.vin,r.evidence_path,
    r.created_at,r.reviewed_at,r.review_note
  from public.vehicle_claim_requests r
  join public.vehicles v on v.id=r.vehicle_id
  left join public.profiles p on p.id=r.claimant_user_id
  order by
    case r.status when 'pending' then 0 else 1 end,
    r.created_at desc;
end;
$$;

revoke all on function public.list_support_vehicle_claim_requests() from public;
grant execute on function public.list_support_vehicle_claim_requests() to authenticated;

create or replace function public.review_support_vehicle_claim(
  p_claim_id uuid,
  p_decision text,
  p_review_note text default null
)
returns public.vehicle_claim_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.vehicle_claim_requests;
  v public.vehicles;
  previous_owner uuid;
begin
  if not public.is_support_admin() then raise exception 'not_authorized'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'invalid_decision'; end if;

  select * into r
  from public.vehicle_claim_requests
  where id=p_claim_id
  for update;

  if not found then raise exception 'claim_not_found'; end if;
  if r.status<>'pending' then raise exception 'claim_not_pending'; end if;
  if p_decision='approved' and r.evidence_path is null then raise exception 'evidence_required'; end if;

  select * into v from public.vehicles where id=r.vehicle_id for update;
  if not found then raise exception 'vehicle_not_found'; end if;
  previous_owner:=v.owner_user_id;

  if p_decision='approved' then
    update public.workshop_customer_vehicles
    set active=false,ended_at=coalesce(ended_at,now())
    where vehicle_id=v.id and active and relationship_type='owner';

    update public.vehicle_claim_tokens
    set revoked_at=now()
    where vehicle_id=v.id and used_at is null and revoked_at is null;

    update public.vehicles
    set
      owner_user_id=r.claimant_user_id,
      archived_at=null,
      claimed_at=now(),
      claimed_from_workshop_id=null,
      updated_at=now()
    where id=v.id;

    update public.vehicle_claim_requests
    set
      status='approved',
      reviewed_by=auth.uid(),
      review_note=nullif(trim(p_review_note),''),
      reviewed_at=now(),
      updated_at=now()
    where id=r.id
    returning * into r;

    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
    values(
      r.claimant_user_id,null,null,'Fahrzeugübernahme bestätigt',
      'MotorAtlas Support hat deine Fahrzeugübernahme nach Prüfung freigegeben.',
      'vehicle','vehicle',v.id
    );

    if previous_owner is not null and previous_owner<>r.claimant_user_id then
      insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
      values(
        previous_owner,null,null,'Fahrzeugzuordnung geändert',
        'Die MotorAtlas-Zuordnung eines Fahrzeugs wurde nach einer Supportprüfung geändert. Bei Rückfragen wende dich bitte an MotorAtlas Support.',
        'vehicle','vehicle',v.id
      );
    end if;
  else
    update public.vehicle_claim_requests
    set
      status='rejected',
      reviewed_by=auth.uid(),
      review_note=nullif(trim(p_review_note),''),
      reviewed_at=now(),
      updated_at=now()
    where id=r.id
    returning * into r;

    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
    values(
      r.claimant_user_id,null,null,'Fahrzeugübernahme nicht freigegeben',
      coalesce(nullif(trim(p_review_note),''),'MotorAtlas Support konnte die Fahrzeugübernahme anhand der eingereichten Unterlagen nicht freigeben.'),
      'vehicle'
    );
  end if;

  return r;
end;
$$;

revoke all on function public.review_support_vehicle_claim(uuid,text,text) from public;
grant execute on function public.review_support_vehicle_claim(uuid,text,text) to authenticated;

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
    v.id,v.make,v.model,v.variant,v.license_plate,
    coalesce(w.name,'Privater Fahrzeugverkauf'),
    t.claim_mode,t.expires_at,
    (t.used_at is null and t.revoked_at is null and t.expires_at>now())
  from public.vehicle_claim_tokens t
  join public.vehicles v on v.id=t.vehicle_id
  left join public.workshops w on w.id=t.workshop_id
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

    update public.work_orders
    set customer_user_id=uid,updated_at=now()
    where local_customer_id=c.id and vehicle_id=v.id and customer_user_id is null;

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
    update public.workshop_customer_vehicles
    set active=false,ended_at=coalesce(ended_at,now())
    where vehicle_id=v.id and active and relationship_type='owner';

    if t.workshop_id is not null then
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
    end if;
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

  update public.vehicle_claim_tokens
  set used_at=now(),used_by=uid
  where id=t.id;

  return v;
end;
$$;

revoke all on function public.claim_vehicle_with_token(text) from public;
grant execute on function public.claim_vehicle_with_token(text) to authenticated;
