-- Let customers explicitly decline or defer repair after quote/diagnosis.

alter table public.approvals
  drop constraint if exists approvals_decision_check;
alter table public.approvals
  add constraint approvals_decision_check
  check (decision in ('approved','declined','question_requested','deferred'));

create or replace function public.record_customer_approval(
  p_work_order_id uuid,
  p_quote_document_id uuid,
  p_decision text,
  p_method text,
  p_note text default null
)
returns public.approvals
language plpgsql
security definer
set search_path=public
as $$
declare
  v public.work_orders;
  a public.approvals;
  is_customer boolean;
  is_office boolean;
begin
  if p_decision not in ('approved','declined','question_requested','deferred') then raise exception 'invalid_decision'; end if;
  if p_method not in ('portal','phone_recorded_by_workshop') then raise exception 'invalid_method'; end if;

  select * into v from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;

  is_customer:=auth.uid()=v.customer_user_id;
  is_office:=public.has_workshop_permission(v.workshop_id,'quotes');

  if (p_method='portal' and not is_customer) or (p_method='phone_recorded_by_workshop' and not is_office) then
    raise exception 'not_authorized';
  end if;
  if v.stage<>'awaiting_customer_approval' then raise exception 'invalid_stage:%',v.stage; end if;

  insert into public.approvals(work_order_id,quote_document_id,customer_user_id,decision,method,note,recorded_by)
  values(
    v.id,p_quote_document_id,v.customer_user_id,p_decision,p_method,p_note,
    case when is_office then auth.uid() else null end
  )
  returning * into a;

  if p_decision='approved' then
    update public.work_orders
       set stage='ready_for_repair',commercial_state='external_approved',updated_at=now()
     where id=v.id;
  elsif p_decision='declined' then
    update public.work_orders
       set stage='repair_complete',commercial_state='no_repair',updated_at=now()
     where id=v.id;
  elsif p_decision='deferred' then
    update public.work_orders
       set stage='repair_complete',commercial_state='deferred',updated_at=now()
     where id=v.id;
  end if;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(
    v.id,v.workshop_id,'customer_decision','both',auth.uid(),
    jsonb_build_object('decision',p_decision,'method',p_method,'approval_id',a.id)
  );

  return a;
end;
$$;

create or replace function public.customer_resolve_after_diagnosis(
  p_work_order_id uuid,
  p_decision text
)
returns public.work_orders
language plpgsql
security definer
set search_path=public,motoratlas_private
as $$
declare
  w public.work_orders;
begin
  if p_decision not in ('quote','no_repair','deferred') then
    raise exception 'invalid_customer_decision';
  end if;

  select * into w from public.work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work_order_not_found'; end if;
  if auth.uid()<>w.customer_user_id then raise exception 'not_authorized'; end if;
  if w.stage<>'awaiting_customer_decision' then raise exception 'invalid_stage:%',w.stage; end if;

  update public.work_orders
  set stage=case p_decision
      when 'quote' then 'awaiting_quote'
      else 'repair_complete'
    end,
    commercial_state=case p_decision
      when 'quote' then 'quote_required'
      when 'no_repair' then 'no_repair'
      else 'deferred'
    end,
    updated_at=now()
  where id=w.id
  returning * into w;

  insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
  values(
    w.id,w.workshop_id,'customer_post_diagnosis_decision','both',auth.uid(),
    jsonb_build_object('decision',p_decision,'next_stage',w.stage)
  );

  perform motoratlas_private.notify_workshop_members(
    w.workshop_id,
    case p_decision
      when 'quote' then 'Kunde möchte einen Kostenvoranschlag'
      when 'no_repair' then 'Kunde möchte keine Reparatur'
      else 'Kunde verschiebt die Reparatur'
    end,
    case p_decision
      when 'quote' then 'Nach der Diagnose soll ein Kostenvoranschlag erstellt werden.'
      when 'no_repair' then 'Der Kunde möchte den Auftrag ohne Reparatur beenden.'
      else 'Der Kunde möchte die Reparatur erst später durchführen lassen.'
    end,
    'order',
    w.id
  );

  return w;
end;
$$;

revoke all on function public.customer_resolve_after_diagnosis(uuid,text) from public;
grant execute on function public.customer_resolve_after_diagnosis(uuid,text) to authenticated;
