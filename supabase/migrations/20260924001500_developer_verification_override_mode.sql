-- Support a tightly controlled developer verification override while keeping the normal
-- evidence workflow as the default for every workshop.

alter table public.workshops
  add column if not exists verification_mode text not null default 'standard'
  check (verification_mode in ('standard','developer_override'));

create or replace function public.protect_workshop_verification_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    if new.verification_mode is distinct from old.verification_mode then
      raise exception 'workshop verification mode is managed by MotorAtlas';
    end if;

    if new.verified_at is distinct from old.verified_at
       or new.verification_status is distinct from old.verification_status
       or new.verification_requested_at is distinct from old.verification_requested_at
       or new.verification_review_note is distinct from old.verification_review_note
       or new.master_workshop_verified_at is distinct from old.master_workshop_verified_at
       or new.master_workshop_title is distinct from old.master_workshop_title then
      raise exception 'workshop verification state is managed by MotorAtlas';
    end if;

    if old.verification_mode = 'developer_override' then
      new.verification_status := 'verified';
      new.verified_at := coalesce(old.verified_at,now());
      new.verification_review_note := null;
      new.master_workshop_verified_at := coalesce(old.master_workshop_verified_at,now());
      new.master_workshop_title := coalesce(nullif(old.master_workshop_title,''),'Meisterwerkstatt');
    elsif (
      new.name is distinct from old.name
      or new.legal_name is distinct from old.legal_name
      or new.street is distinct from old.street
      or new.postal_code is distinct from old.postal_code
      or new.city is distinct from old.city
      or new.services is distinct from old.services
    ) and old.verification_status in ('pending','verified') then
      new.verified_at := null;
      new.verification_status := 'needs_info';
      new.verification_review_note := 'Stammdaten oder Leistungsumfang wurden geändert. Die Verifizierung muss erneut geprüft werden.';
      new.master_workshop_verified_at := null;
      new.master_workshop_title := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_workshop_master_badge(p_workshop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  master_title text;
  workshop_verified boolean := false;
  mode text := 'standard';
begin
  select
    (verification_status = 'verified' and verified_at is not null),
    verification_mode
  into workshop_verified,mode
  from public.workshops
  where id = p_workshop_id;

  if not coalesce(workshop_verified,false) then
    update public.workshops
       set master_workshop_verified_at = null,
           master_workshop_title = null
     where id = p_workshop_id;
    return;
  end if;

  if mode = 'developer_override' then
    update public.workshops
       set master_workshop_verified_at = coalesce(master_workshop_verified_at,now()),
           master_workshop_title = coalesce(nullif(master_workshop_title,''),'Meisterwerkstatt')
     where id = p_workshop_id;
    return;
  end if;

  select coalesce(nullif(v.detected_title,''),'Meisterqualifikation')
    into master_title
  from public.workshop_verification_documents v
  where v.workshop_id = p_workshop_id
    and v.document_type = 'meisterbrief'
    and v.recognition_class = 'direct_match'
    and v.review_status = 'accepted'
  order by coalesce(v.reviewed_at,v.created_at) desc
  limit 1;

  if master_title is null then
    update public.workshops
       set master_workshop_verified_at = null,
           master_workshop_title = null
     where id = p_workshop_id;
  else
    update public.workshops
       set master_workshop_verified_at = coalesce(master_workshop_verified_at,now()),
           master_workshop_title = master_title
     where id = p_workshop_id;
  end if;
end;
$$;

create or replace function public.request_workshop_verification(p_workshop_id uuid)
returns public.workshops
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.workshops;
  selected_services jsonb;
  needs_kfz boolean := false;
  needs_tire boolean := false;
  needs_climate boolean := false;
  mode text := 'standard';
begin
  select services,verification_mode into selected_services,mode
  from public.workshops
  where id = p_workshop_id and owner_user_id = auth.uid();

  if selected_services is null then
    raise exception 'not authorized';
  end if;

  if mode = 'developer_override' then
    update public.workshops
       set verification_status='verified',
           verified_at=coalesce(verified_at,now()),
           verification_review_note=null,
           master_workshop_verified_at=coalesce(master_workshop_verified_at,now()),
           master_workshop_title=coalesce(nullif(master_workshop_title,''),'Meisterwerkstatt'),
           updated_at=now()
     where id=p_workshop_id
     returning * into result;
    return result;
  end if;

  if not exists (
    select 1 from public.workshop_verification_documents
    where workshop_id = p_workshop_id
      and document_type = 'business_registration'
  ) then
    raise exception 'business registration evidence required';
  end if;

  needs_kfz := selected_services ?| array[
    'diagnostics','inspection','brakes','suspension','engine',
    'transmission','electrical','general_repair'
  ];
  needs_tire := selected_services ? 'tire_repair';
  needs_climate := selected_services ? 'climate_service';

  if needs_kfz or needs_tire then
    if not exists (
      select 1 from public.workshop_verification_documents
      where workshop_id = p_workshop_id
        and document_type in ('meisterbrief','industriemeister','techniker','other')
    ) then
      raise exception 'qualification evidence required';
    end if;

    if not exists (
      select 1 from public.workshop_verification_documents
      where workshop_id = p_workshop_id
        and document_type = 'handwerksrolle'
    ) then
      raise exception 'handwerksrolle evidence required';
    end if;
  end if;

  if needs_climate and not exists (
    select 1 from public.workshop_verification_documents
    where workshop_id = p_workshop_id
      and document_type = 'climate_certificate'
  ) then
    raise exception 'climate certificate required';
  end if;

  update public.workshops
  set verification_status = 'pending',
      verification_requested_at = now(),
      verification_review_note = null,
      updated_at = now()
  where id = p_workshop_id
  returning * into result;

  return result;
end;
$$;
