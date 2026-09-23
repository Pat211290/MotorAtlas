-- Work assignment, staff-visible progress and customer-facing workshop progress.

create or replace function public.assign_work_to_member(
  p_work_order_id uuid,
  p_type text,
  p_member_user_id uuid
)
returns public.work_order_assignments
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  w public.work_orders;
  a public.work_order_assignments;
  caller_role text;
  caller_permissions jsonb;
  member_name text;
  target_ok boolean := false;
begin
  if p_type not in ('diagnosis','repair') then
    raise exception 'invalid_assignment_type';
  end if;

  select * into w from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;

  select role,permissions
    into caller_role,caller_permissions
  from public.workshop_members
  where workshop_id=w.workshop_id and user_id=auth.uid() and active
  limit 1;

  if caller_role is null then raise exception 'not_authorized'; end if;

  if p_member_user_id=auth.uid() then
    if not public.has_workshop_permission(w.workshop_id,p_type) then
      raise exception 'not_authorized';
    end if;
  elsif not (
    caller_role in ('owner','office')
    or (caller_role='custom' and coalesce((caller_permissions->>'assignments')::boolean,false))
  ) then
    raise exception 'assignment_not_authorized';
  end if;

  select motoratlas_private.has_workshop_permission(w.workshop_id,p_type,p_member_user_id)
    into target_ok;
  if not coalesce(target_ok,false) then
    raise exception 'target_member_not_authorized';
  end if;

  if (p_type='diagnosis' and w.stage<>'waiting_diagnosis')
     or (p_type='repair' and w.stage<>'ready_for_repair') then
    raise exception 'invalid_stage:%',w.stage;
  end if;

  if exists(
    select 1 from public.work_order_assignments x
    where x.work_order_id=w.id and x.assignment_type=p_type and x.status='claimed'
  ) then
    raise exception 'work_already_assigned';
  end if;

  select coalesce(nullif(m.display_name,''),nullif(p.full_name,''),'Werkstattteam')
    into member_name
  from public.workshop_members m
  left join public.profiles p on p.id=m.user_id
  where m.workshop_id=w.workshop_id and m.user_id=p_member_user_id and m.active
  limit 1;

  insert into public.work_order_assignments(
    work_order_id,workshop_id,member_user_id,assignment_type,status,claimed_at
  )
  values(w.id,w.workshop_id,p_member_user_id,p_type,'claimed',now())
  returning * into a;

  update public.work_orders
  set stage=case when p_type='diagnosis' then 'diagnosing' else 'repairing' end,
      updated_at=now()
  where id=w.id;

  insert into public.work_order_events(
    work_order_id,workshop_id,event_type,visibility,actor_user_id,payload
  )
  values(
    w.id,w.workshop_id,
    case when p_type='diagnosis' then 'diagnosis_claimed' else 'repair_claimed' end,
    'both',
    auth.uid(),
    jsonb_build_object(
      'assignment_id',a.id,
      'member_user_id',p_member_user_id,
      'member_name',member_name,
      'assignment_type',p_type
    )
  );

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(
    w.customer_user_id,
    w.workshop_id,
    w.id,
    case when p_type='diagnosis' then 'Diagnose gestartet' else 'Reparatur gestartet' end,
    member_name||case when p_type='diagnosis'
      then ' prüft jetzt dein Fahrzeug.'
      else ' arbeitet jetzt an deinem Fahrzeug.'
    end,
    'order'
  );

  return a;
end;
$$;

create or replace function public.claim_work(p_work_order_id uuid,p_type text)
returns public.work_order_assignments
language sql
security definer
set search_path=public
as $$
  select public.assign_work_to_member(p_work_order_id,p_type,auth.uid());
$$;

create or replace function public.complete_diagnosis(
  p_work_order_id uuid,
  p_summary text,
  p_internal_note text default null
)
returns public.diagnoses
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.work_orders;
  d public.diagnoses;
begin
  select * into v from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;
  if not public.has_workshop_permission(v.workshop_id,'diagnosis') then raise exception 'not_authorized'; end if;
  if v.stage<>'diagnosing' then raise exception 'invalid_stage:%',v.stage; end if;

  if not exists(
    select 1 from public.work_order_assignments a
    where a.work_order_id=v.id
      and a.assignment_type='diagnosis'
      and a.status='claimed'
      and a.member_user_id=auth.uid()
  ) then
    raise exception 'assignment_not_owned';
  end if;

  if nullif(trim(p_summary),'') is null then raise exception 'diagnosis_required'; end if;

  insert into public.diagnoses(work_order_id,workshop_id,mechanic_user_id,summary,internal_note)
  values(v.id,v.workshop_id,auth.uid(),trim(p_summary),nullif(trim(p_internal_note),''))
  returning * into d;

  update public.work_order_assignments
  set status='completed',completed_at=now()
  where work_order_id=v.id
    and assignment_type='diagnosis'
    and status='claimed'
    and member_user_id=auth.uid();

  update public.work_orders set stage='awaiting_quote',updated_at=now() where id=v.id;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(v.id,v.workshop_id,'diagnosis_completed','both',auth.uid(),jsonb_build_object('diagnosis_id',d.id,'summary',d.summary));

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(v.customer_user_id,v.workshop_id,v.id,'Diagnose abgeschlossen','Die Diagnose deines Fahrzeugs ist abgeschlossen.','order');

  return d;
end;
$$;

create or replace function public.complete_repair(p_work_order_id uuid,p_note text default null)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.work_orders;
begin
  select * into v from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;
  if not public.has_workshop_permission(v.workshop_id,'repair') then raise exception 'not_authorized'; end if;
  if v.stage<>'repairing' then raise exception 'invalid_stage:%',v.stage; end if;

  if not exists(
    select 1 from public.work_order_assignments a
    where a.work_order_id=v.id
      and a.assignment_type='repair'
      and a.status='claimed'
      and a.member_user_id=auth.uid()
  ) then
    raise exception 'assignment_not_owned';
  end if;

  update public.work_order_assignments
  set status='completed',completed_at=now()
  where work_order_id=v.id
    and assignment_type='repair'
    and status='claimed'
    and member_user_id=auth.uid();

  update public.work_orders set stage='repair_complete',updated_at=now() where id=v.id returning * into v;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(v.id,v.workshop_id,'repair_completed','both',auth.uid(),jsonb_build_object('note',nullif(trim(p_note),'')));

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(v.customer_user_id,v.workshop_id,v.id,'Reparatur abgeschlossen','Die Arbeiten an deinem Fahrzeug sind abgeschlossen.','order');

  return v;
end;
$$;

create or replace function public.mark_ready_for_pickup(p_work_order_id uuid)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
begin
  select * into w from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;
  if not public.has_workshop_permission(w.workshop_id,'pickup') then raise exception 'not_authorized'; end if;
  if w.stage<>'repair_complete' then raise exception 'invalid_stage:%',w.stage; end if;

  if not exists(
    select 1 from public.documents d
    where d.work_order_id=w.id and d.document_type='invoice' and d.status='published'
  ) then
    raise exception 'published_invoice_required';
  end if;

  update public.work_orders
  set stage='ready_for_pickup',ready_for_pickup_at=now(),updated_at=now()
  where id=w.id
  returning * into w;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id)
  values(w.id,w.workshop_id,'ready_for_pickup','both',auth.uid());

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(w.customer_user_id,w.workshop_id,w.id,'Fahrzeug abholbereit','Dein Fahrzeug ist jetzt abholbereit.','order');

  return w;
end;
$$;

create or replace function public.get_customer_order_progress()
returns table(
  work_order_id uuid,
  arrived_at timestamptz,
  diagnosis_started_at timestamptz,
  diagnosis_completed_at timestamptz,
  diagnosis_staff_name text,
  repair_started_at timestamptz,
  repair_completed_at timestamptz,
  repair_staff_name text,
  ready_for_pickup_at timestamptz,
  closed_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select
    w.id,
    w.arrived_at,
    da.claimed_at,
    da.completed_at,
    coalesce(nullif(dm.display_name,''),nullif(dp.full_name,''),'Werkstattteam'),
    ra.claimed_at,
    ra.completed_at,
    coalesce(nullif(rm.display_name,''),nullif(rp.full_name,''),'Werkstattteam'),
    w.ready_for_pickup_at,
    w.closed_at
  from public.work_orders w
  left join lateral(
    select *
    from public.work_order_assignments a
    where a.work_order_id=w.id and a.assignment_type='diagnosis'
    order by a.claimed_at desc
    limit 1
  ) da on true
  left join public.workshop_members dm
    on dm.workshop_id=w.workshop_id and dm.user_id=da.member_user_id
  left join public.profiles dp on dp.id=da.member_user_id
  left join lateral(
    select *
    from public.work_order_assignments a
    where a.work_order_id=w.id and a.assignment_type='repair'
    order by a.claimed_at desc
    limit 1
  ) ra on true
  left join public.workshop_members rm
    on rm.workshop_id=w.workshop_id and rm.user_id=ra.member_user_id
  left join public.profiles rp on rp.id=ra.member_user_id
  where w.customer_user_id=auth.uid()
  order by w.updated_at desc;
$$;

revoke all on function public.assign_work_to_member(uuid,text,uuid) from public;
revoke all on function public.get_customer_order_progress() from public;
grant execute on function public.assign_work_to_member(uuid,text,uuid) to authenticated;
grant execute on function public.get_customer_order_progress() to authenticated;
