-- Allow workshops to run MotorAtlas jobs for customers who do not have a MotorAtlas account.

alter table public.work_orders
  alter column customer_user_id drop not null;

alter table public.work_orders
  add column if not exists local_customer_id uuid references public.workshop_customers(id) on delete set null,
  add column if not exists work_description text;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conname='work_orders_customer_reference_check'
      and conrelid='public.work_orders'::regclass
  ) then
    alter table public.work_orders
      add constraint work_orders_customer_reference_check
      check(customer_user_id is not null or local_customer_id is not null);
  end if;
end $$;

alter table public.documents
  alter column customer_user_id drop not null;

alter table public.documents
  add column if not exists local_customer_id uuid references public.workshop_customers(id) on delete set null;

create or replace function public.skip_null_notification_recipient()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.user_id is null then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists skip_null_notification_recipient on public.notifications;
create trigger skip_null_notification_recipient
before insert on public.notifications
for each row execute function public.skip_null_notification_recipient();

create or replace function public.create_walk_in_work_order(
  p_workshop_id uuid,
  p_vehicle_id uuid,
  p_customer_id uuid default null,
  p_problem text default null,
  p_workflow_path text default 'diagnosis_then_quote',
  p_invoice_required boolean default true
)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.vehicles;
  c public.workshop_customers;
  w public.work_orders;
  customer_uid uuid;
  seq bigint;
  initial_stage text;
  initial_state text;
begin
  if not public.has_workshop_permission(p_workshop_id,'customers')
     or not public.has_workshop_permission(p_workshop_id,'arrival') then
    raise exception 'not_authorized';
  end if;

  if p_workflow_path not in ('diagnosis_only','diagnosis_then_decide','direct_work','quote_before_work','diagnosis_then_quote') then
    raise exception 'invalid_workflow_path';
  end if;

  select * into v from public.vehicles where id=p_vehicle_id for update;
  if not found then raise exception 'vehicle_not_found'; end if;
  if v.archived_at is not null then raise exception 'vehicle_archived'; end if;

  if exists(
    select 1 from public.work_orders existing
    where existing.workshop_id=p_workshop_id
      and existing.vehicle_id=v.id
      and existing.stage not in ('closed','cancelled')
  ) then
    raise exception 'vehicle_has_active_work_order';
  end if;

  if p_customer_id is not null then
    select * into c
    from public.workshop_customers
    where id=p_customer_id and workshop_id=p_workshop_id and active
    for update;

    if not found then raise exception 'customer_not_found'; end if;
    if not exists(
      select 1 from public.workshop_customer_vehicles cv
      where cv.workshop_id=p_workshop_id
        and cv.customer_id=c.id
        and cv.vehicle_id=v.id
        and cv.active
    ) then raise exception 'customer_vehicle_not_linked'; end if;

    customer_uid:=coalesce(v.owner_user_id,c.linked_user_id);
  else
    customer_uid:=v.owner_user_id;
    if customer_uid is null then raise exception 'local_customer_required'; end if;
    if not exists(
      select 1 from public.customer_workshop_links l
      where l.workshop_id=p_workshop_id
        and l.customer_user_id=customer_uid
        and l.active
    ) and not exists(
      select 1 from public.work_orders old
      where old.workshop_id=p_workshop_id and old.vehicle_id=v.id
    ) then raise exception 'vehicle_not_known_to_workshop'; end if;
  end if;

  initial_stage:=case p_workflow_path
    when 'direct_work' then 'ready_for_repair'
    when 'quote_before_work' then 'awaiting_quote'
    else 'waiting_diagnosis'
  end;

  initial_state:=case p_workflow_path
    when 'direct_work' then 'direct_order'
    when 'quote_before_work' then 'quote_required'
    else 'not_set'
  end;

  seq:=nextval('public.work_order_number_seq');

  insert into public.work_orders(
    service_request_id,workshop_id,customer_user_id,local_customer_id,vehicle_id,appointment_id,
    order_number,stage,priority,arrived_at,workflow_path,commercial_state,invoice_required,work_description
  )
  values(
    null,p_workshop_id,customer_uid,p_customer_id,v.id,null,
    'MA-'||to_char(now(),'YYYY')||'-'||lpad(seq::text,6,'0'),
    initial_stage,'normal',now(),p_workflow_path,initial_state,p_invoice_required,
    coalesce(nullif(trim(p_problem),''),'Werkstattauftrag vor Ort')
  )
  returning * into w;

  insert into public.work_order_events(
    work_order_id,workshop_id,event_type,visibility,actor_user_id,payload
  )
  values(
    w.id,w.workshop_id,'vehicle_arrived','both',auth.uid(),
    jsonb_build_object('next_stage',w.stage,'workflow_path',w.workflow_path,'manual_customer',p_customer_id is not null)
  );

  insert into public.audit_events(
    workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id,payload
  )
  values(
    w.workshop_id,w.id,auth.uid(),'walk_in_order_created','work_order',w.id::text,
    jsonb_build_object('vehicle_id',v.id,'local_customer_id',p_customer_id,'workflow_path',w.workflow_path)
  );

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
  values(
    customer_uid,w.workshop_id,w.id,'Fahrzeug eingetroffen',
    'Dein Fahrzeug wurde von der Werkstatt als eingetroffen erfasst.',
    'order','work_order',w.id
  );

  return w;
end;
$$;

revoke all on function public.create_walk_in_work_order(uuid,uuid,uuid,text,text,boolean) from public;
grant execute on function public.create_walk_in_work_order(uuid,uuid,uuid,text,text,boolean) to authenticated;

create or replace function public.create_document_draft(
  p_work_order_id uuid,
  p_document_type text,
  p_document_number text,
  p_title text,
  p_amount_total numeric,
  p_currency text
)
returns public.documents
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
  d public.documents;
begin
  if p_document_type not in ('quote','invoice','credit_note','other') then
    raise exception 'invalid_document_type';
  end if;

  select * into w from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;

  if not public.has_workshop_permission(w.workshop_id,'documents') then
    raise exception 'not_authorized';
  end if;

  if p_document_type='quote' and w.stage<>'awaiting_quote' then
    raise exception 'invalid_work_order_stage:%',w.stage;
  end if;

  if p_document_type='invoice' and w.stage not in ('repair_complete','ready_for_pickup','closed') then
    raise exception 'invalid_work_order_stage:%',w.stage;
  end if;

  insert into public.documents(
    work_order_id,workshop_id,customer_user_id,local_customer_id,document_type,document_number,title,
    currency,amount_total,status,created_by
  )
  values(
    w.id,w.workshop_id,w.customer_user_id,w.local_customer_id,p_document_type,nullif(trim(p_document_number),''),
    nullif(trim(p_title),''),coalesce(nullif(trim(p_currency),''),'EUR'),p_amount_total,'draft',auth.uid()
  )
  returning * into d;

  insert into public.audit_events(workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id,payload)
  values(
    w.workshop_id,w.id,auth.uid(),'document_draft_created','document',d.id::text,
    jsonb_build_object('document_type',d.document_type,'document_number',d.document_number)
  );

  return d;
end;
$$;

revoke all on function public.create_document_draft(uuid,text,text,text,numeric,text) from public;
grant execute on function public.create_document_draft(uuid,text,text,text,numeric,text) to authenticated;
