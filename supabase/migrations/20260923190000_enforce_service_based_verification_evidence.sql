-- Enforce verification evidence based on workshop services
create or replace function public.protect_workshop_verification_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and coalesce(auth.jwt()->>'role','') <> 'service_role' then
    if new.verified_at is distinct from old.verified_at
       or new.verification_status is distinct from old.verification_status
       or new.verification_requested_at is distinct from old.verification_requested_at
       or new.verification_review_note is distinct from old.verification_review_note then
      raise exception 'workshop verification state is managed by MotorAtlas';
    end if;

    if (
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
    end if;
  end if;
  return new;
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
begin
  select services into selected_services
  from public.workshops
  where id = p_workshop_id and owner_user_id = auth.uid();

  if selected_services is null then
    raise exception 'not authorized';
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

revoke all on function public.request_workshop_verification(uuid) from public;
grant execute on function public.request_workshop_verification(uuid) to authenticated;
