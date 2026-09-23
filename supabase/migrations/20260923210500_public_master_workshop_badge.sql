-- Public-safe master-workshop badge derived only from accepted master qualification evidence.
alter table public.workshops
  add column if not exists master_workshop_verified_at timestamptz,
  add column if not exists master_workshop_title text;

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
       or new.verification_review_note is distinct from old.verification_review_note
       or new.master_workshop_verified_at is distinct from old.master_workshop_verified_at
       or new.master_workshop_title is distinct from old.master_workshop_title then
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
begin
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

create or replace function public.sync_workshop_master_badge_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_workshop_master_badge(coalesce(new.workshop_id,old.workshop_id));
  return coalesce(new,old);
end;
$$;

drop trigger if exists sync_workshop_master_badge_on_documents on public.workshop_verification_documents;
create trigger sync_workshop_master_badge_on_documents
after insert or update or delete on public.workshop_verification_documents
for each row
execute function public.sync_workshop_master_badge_trigger();

revoke all on function public.sync_workshop_master_badge(uuid) from public;
revoke all on function public.sync_workshop_master_badge_trigger() from public;
