-- Flexible customer intent and post-diagnosis/commercial workflow.

alter table public.service_requests
  add column if not exists request_intent text not null default 'diagnosis_then_quote';

alter table public.service_requests
  drop constraint if exists service_requests_request_intent_check;

alter table public.service_requests
  add constraint service_requests_request_intent_check
  check (request_intent in (
    'direct_work',
    'diagnosis_then_quote',
    'diagnosis_only',
    'diagnosis_then_decide',
    'quote_before_work'
  ));

alter table public.work_orders
  add column if not exists workflow_path text not null default 'diagnosis_then_quote',
  add column if not exists commercial_state text not null default 'not_set',
  add column if not exists agreement_method text,
  add column if not exists agreement_note text,
  add column if not exists agreement_recorded_at timestamptz,
  add column if not exists agreement_recorded_by uuid references auth.users(id),
  add column if not exists invoice_required boolean not null default true;

alter table public.work_orders
  drop constraint if exists work_orders_workflow_path_check;
alter table public.work_orders
  add constraint work_orders_workflow_path_check
  check (workflow_path in (
    'direct_work',
    'diagnosis_then_quote',
    'diagnosis_only',
    'diagnosis_then_decide',
    'quote_before_work'
  ));

alter table public.work_orders
  drop constraint if exists work_orders_commercial_state_check;
alter table public.work_orders
  add constraint work_orders_commercial_state_check
  check (commercial_state in (
    'not_set',
    'direct_order',
    'quote_required',
    'external_approved',
    'external_waiting',
    'diagnosis_only',
    'no_repair',
    'deferred'
  ));

alter table public.work_orders
  drop constraint if exists work_orders_agreement_method_check;
alter table public.work_orders
  add constraint work_orders_agreement_method_check
  check (agreement_method is null or agreement_method in (
    'customer_order',
    'portal',
    'email',
    'phone',
    'in_person',
    'other'
  ));

update public.work_orders w
set workflow_path = coalesce(r.request_intent,'diagnosis_then_quote')
from public.service_requests r
where r.id=w.service_request_id;

alter table public.work_orders
  drop constraint if exists work_orders_stage_check;
alter table public.work_orders
  add constraint work_orders_stage_check
  check (stage in (
    'appointment_confirmed',
    'waiting_diagnosis',
    'diagnosing',
    'awaiting_quote',
    'awaiting_customer_decision',
    'awaiting_customer_approval',
    'ready_for_repair',
    'repairing',
    'repair_complete',
    'ready_for_pickup',
    'closed',
    'cancelled'
  ));

create or replace function public.create_order_from_confirmed_appointment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.service_requests;
  w public.work_orders;
  seq bigint;
begin
  if new.status='confirmed' and old.status is distinct from new.status then
    select * into r from public.service_requests where id=new.service_request_id for update;
    select * into w from public.work_orders where service_request_id=r.id;
    if not found then
      seq:=nextval('public.work_order_number_seq');
      insert into public.work_orders(
        service_request_id,workshop_id,customer_user_id,vehicle_id,appointment_id,order_number,stage,
        workflow_path,commercial_state
      )
      values(
        r.id,r.workshop_id,r.customer_user_id,r.vehicle_id,new.id,
        'MA-'||to_char(now(),'YYYY')||'-'||lpad(seq::text,6,'0'),
        'appointment_confirmed',
        coalesce(r.request_intent,'diagnosis_then_quote'),
        case when r.request_intent='direct_work' then 'direct_order' else 'not_set' end
      )
      returning * into w;

      update public.service_requests set status='converted' where id=r.id;

      insert into public.work_order_events(
        work_order_id,workshop_id,event_type,visibility,actor_user_id,payload
      )
      values(
        w.id,w.workshop_id,'appointment_confirmed','both',auth.uid(),
        jsonb_build_object(
          'appointment_id',new.id,
          'starts_at',new.starts_at,
          'workflow_path',w.workflow_path
        )
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.mark_vehicle_arrived(p_work_order_id uuid)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.work_orders;
  next_stage text;
begin
  select * into v from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;
  if not public.has_workshop_permission(v.workshop_id,'arrival') then raise exception 'not_authorized'; end if;
  if v.stage not in ('appointment_confirmed','waiting_diagnosis','ready_for_repair','awaiting_quote') then
    raise exception 'invalid_stage:%',v.stage;
  end if;

  next_stage:=case v.workflow_path
    when 'direct_work' then 'ready_for_repair'
    when 'quote_before_work' then 'awaiting_quote'
    else 'waiting_diagnosis'
  end;

  update public.work_orders
     set arrived_at=coalesce(arrived_at,now()),
         stage=next_stage,
         commercial_state=case
           when v.workflow_path='direct_work' then 'direct_order'
           when v.workflow_path='quote_before_work' then 'quote_required'
           else commercial_state
         end,
         updated_at=now()
   where id=v.id
   returning * into v;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(
    v.id,v.workshop_id,'vehicle_arrived','both',auth.uid(),
    jsonb_build_object('next_stage',v.stage,'workflow_path',v.workflow_path)
  );

  insert into public.audit_events(workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id)
  values(v.workshop_id,v.id,auth.uid(),'vehicle_arrived','work_order',v.id::text);

  return v;
end;
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
  next_stage text;
  next_state text;
  customer_text text;
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

  next_stage:=case v.workflow_path
    when 'diagnosis_only' then 'repair_complete'
    when 'diagnosis_then_decide' then 'awaiting_customer_decision'
    when 'direct_work' then 'ready_for_repair'
    else 'awaiting_quote'
  end;

  next_state:=case v.workflow_path
    when 'diagnosis_only' then 'diagnosis_only'
    when 'direct_work' then 'direct_order'
    when 'diagnosis_then_quote' then 'quote_required'
    when 'quote_before_work' then 'quote_required'
    else 'not_set'
  end;

  update public.work_orders
     set stage=next_stage,
         commercial_state=next_state,
         updated_at=now()
   where id=v.id;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(
    v.id,v.workshop_id,'diagnosis_completed','both',auth.uid(),
    jsonb_build_object(
      'diagnosis_id',d.id,
      'summary',d.summary,
      'next_stage',next_stage,
      'workflow_path',v.workflow_path
    )
  );

  customer_text:=case next_stage
    when 'repair_complete' then 'Die gewünschte Diagnose/Prüfung ist abgeschlossen. Es wurde keine Reparatur automatisch beauftragt.'
    when 'awaiting_customer_decision' then 'Die Diagnose ist abgeschlossen. Du kannst nun entscheiden, wie es weitergehen soll.'
    when 'ready_for_repair' then 'Die Diagnose ist abgeschlossen. Der bereits beauftragte Arbeitsumfang kann weiterbearbeitet werden.'
    else 'Die Diagnose ist abgeschlossen. Die Werkstatt bereitet den Kostenvoranschlag vor.'
  end;

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(v.customer_user_id,v.workshop_id,v.id,'Diagnose abgeschlossen',customer_text,'order');

  return d;
end;
$$;

create or replace function public.resolve_work_order_next_step(
  p_work_order_id uuid,
  p_decision text,
  p_method text default null,
  p_note text default null,
  p_invoice_required boolean default true
)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
  title_text text;
  body_text text;
begin
  if p_decision not in (
    'motoratlas_quote',
    'external_approved',
    'external_waiting',
    'no_repair',
    'deferred'
  ) then
    raise exception 'invalid_workflow_decision';
  end if;

  if p_method is not null and p_method not in ('customer_order','portal','email','phone','in_person','other') then
    raise exception 'invalid_agreement_method';
  end if;

  select * into w from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;

  if not public.has_workshop_permission(w.workshop_id,'quotes') then
    raise exception 'not_authorized';
  end if;

  if w.stage not in ('waiting_diagnosis','awaiting_quote','awaiting_customer_decision','ready_for_repair') then
    raise exception 'invalid_stage:%',w.stage;
  end if;

  update public.work_orders
  set
    stage=case p_decision
      when 'motoratlas_quote' then 'awaiting_quote'
      when 'external_approved' then 'ready_for_repair'
      when 'external_waiting' then 'awaiting_customer_decision'
      when 'no_repair' then 'repair_complete'
      when 'deferred' then 'repair_complete'
    end,
    commercial_state=case p_decision
      when 'motoratlas_quote' then 'quote_required'
      when 'external_approved' then 'external_approved'
      when 'external_waiting' then 'external_waiting'
      when 'no_repair' then 'no_repair'
      when 'deferred' then 'deferred'
    end,
    agreement_method=case when p_decision='motoratlas_quote' then agreement_method else coalesce(p_method,agreement_method) end,
    agreement_note=case when p_decision='motoratlas_quote' then agreement_note else nullif(trim(p_note),'') end,
    agreement_recorded_at=case when p_decision='motoratlas_quote' then agreement_recorded_at else now() end,
    agreement_recorded_by=case when p_decision='motoratlas_quote' then agreement_recorded_by else auth.uid() end,
    invoice_required=p_invoice_required,
    updated_at=now()
  where id=w.id
  returning * into w;

  insert into public.work_order_events(
    work_order_id,workshop_id,event_type,visibility,actor_user_id,payload
  )
  values(
    w.id,w.workshop_id,'workflow_decision','both',auth.uid(),
    jsonb_build_object(
      'decision',p_decision,
      'method',p_method,
      'note',nullif(trim(p_note),''),
      'invoice_required',p_invoice_required,
      'next_stage',w.stage
    )
  );

  title_text:=case p_decision
    when 'motoratlas_quote' then 'Kostenvoranschlag wird vorbereitet'
    when 'external_approved' then 'Reparaturfreigabe hinterlegt'
    when 'external_waiting' then 'Entscheidung noch offen'
    when 'no_repair' then 'Keine Reparatur gewünscht'
    else 'Reparatur auf später verschoben'
  end;

  body_text:=case p_decision
    when 'motoratlas_quote' then 'Die Werkstatt erstellt den Kostenvoranschlag in MotorAtlas.'
    when 'external_approved' then 'Eine bereits außerhalb von MotorAtlas getroffene Vereinbarung wurde dokumentiert. Die Arbeit kann fortgesetzt werden.'
    when 'external_waiting' then 'Ein Angebot bzw. eine Abstimmung erfolgte außerhalb von MotorAtlas. Deine Entscheidung ist noch offen.'
    when 'no_repair' then 'Für diesen Auftrag ist aktuell keine Reparatur vorgesehen.'
    else 'Für diesen Auftrag ist aktuell keine Reparatur vorgesehen. Eine spätere Reparatur kann als neuer Auftrag geplant werden.'
  end;

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind)
  values(w.customer_user_id,w.workshop_id,w.id,title_text,body_text,'order');

  return w;
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

  if w.invoice_required and not exists(
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

revoke all on function public.resolve_work_order_next_step(uuid,text,text,text,boolean) from public;
grant execute on function public.resolve_work_order_next_step(uuid,text,text,text,boolean) to authenticated;
