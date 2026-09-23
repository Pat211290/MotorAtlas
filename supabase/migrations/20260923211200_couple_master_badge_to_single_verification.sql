-- Couple the public Meisterwerkstatt badge to the single MotorAtlas verification process.
create or replace function public.sync_workshop_master_badge(p_workshop_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  master_title text;
  workshop_verified boolean := false;
begin
  select (verification_status = 'verified' and verified_at is not null)
    into workshop_verified
  from public.workshops
  where id = p_workshop_id;

  if not coalesce(workshop_verified,false) then
    update public.workshops
       set master_workshop_verified_at = null,
           master_workshop_title = null
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

create or replace function public.sync_workshop_master_badge_from_workshop()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_workshop_master_badge(new.id);
  return new;
end;
$$;

drop trigger if exists sync_workshop_master_badge_on_workshop_verification on public.workshops;
create trigger sync_workshop_master_badge_on_workshop_verification
after update of verification_status, verified_at on public.workshops
for each row
when (
  old.verification_status is distinct from new.verification_status
  or old.verified_at is distinct from new.verified_at
)
execute function public.sync_workshop_master_badge_from_workshop();

revoke all on function public.sync_workshop_master_badge_from_workshop() from public;
