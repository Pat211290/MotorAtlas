-- Add Kfz climate certificate to the single workshop verification process.
alter table public.workshop_verification_documents
  drop constraint if exists workshop_verification_documents_document_type_check;

alter table public.workshop_verification_documents
  add constraint workshop_verification_documents_document_type_check
  check (document_type in (
    'business_registration',
    'handwerksrolle',
    'climate_certificate',
    'meisterbrief',
    'industriemeister',
    'techniker',
    'other'
  ));

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

revoke all on function public.request_workshop_verification(uuid) from public;
grant execute on function public.request_workshop_verification(uuid) to authenticated;
