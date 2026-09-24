-- Notify MotorAtlas support when a purchase-contract evidence file is attached,
-- and avoid pointing the previous owner at a vehicle they no longer control.

create or replace function public.attach_support_vehicle_claim_evidence(
  p_claim_id uuid,
  p_storage_path text
)
returns public.vehicle_claim_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.vehicle_claim_requests;
  first_upload boolean := false;
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

  first_upload:=r.evidence_path is null;

  update public.vehicle_claim_requests
  set evidence_path=p_storage_path,evidence_uploaded_at=now(),updated_at=now()
  where id=r.id
  returning * into r;

  if first_upload then
    insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
    select
      a.user_id,null,null,
      'Besitzerwechsel wartet auf Prüfung',
      'Ein Nutzer hat einen Kaufvertrag für eine manuelle Fahrzeugübernahme eingereicht.',
      'support_claim','vehicle_claim_request',r.id
    from public.support_admins a
    where a.active;
  end if;

  return r;
end;
$$;

revoke all on function public.attach_support_vehicle_claim_evidence(uuid,text) from public;
grant execute on function public.attach_support_vehicle_claim_evidence(uuid,text) to authenticated;

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
      insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
      values(
        previous_owner,null,null,'Fahrzeugzuordnung geändert',
        'Die MotorAtlas-Zuordnung eines Fahrzeugs wurde nach einer Supportprüfung geändert. Bei Rückfragen wende dich bitte an MotorAtlas Support.',
        'vehicle_removed'
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
      'vehicle_claim_rejected'
    );
  end if;

  return r;
end;
$$;

revoke all on function public.review_support_vehicle_claim(uuid,text,text) from public;
grant execute on function public.review_support_vehicle_claim(uuid,text,text) to authenticated;
