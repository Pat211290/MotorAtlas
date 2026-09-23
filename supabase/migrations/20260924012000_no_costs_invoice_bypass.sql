-- Allow the workshop to finish a completed job without an invoice when nothing is charged.

create or replace function public.mark_no_costs_and_ready_for_pickup(p_work_order_id uuid)
returns public.work_orders
language plpgsql
security definer
set search_path=public
as $$
declare
  w public.work_orders;
begin
  select * into w
  from public.work_orders
  where id=p_work_order_id
  for update;

  if not found then
    raise exception 'work_order_not_found';
  end if;

  if not public.has_workshop_permission(w.workshop_id,'pickup') then
    raise exception 'not_authorized';
  end if;

  if w.stage<>'repair_complete' then
    raise exception 'invalid_stage:%',w.stage;
  end if;

  if exists(
    select 1
    from public.documents d
    where d.work_order_id=w.id
      and d.document_type='invoice'
      and d.status='published'
  ) then
    raise exception 'invoice_already_published';
  end if;

  update public.work_orders
  set
    invoice_required=false,
    stage='ready_for_pickup',
    ready_for_pickup_at=now(),
    updated_at=now()
  where id=w.id
  returning * into w;

  insert into public.work_order_events(
    work_order_id,workshop_id,event_type,visibility,actor_user_id,payload
  )
  values(
    w.id,w.workshop_id,'no_costs_incurred','both',auth.uid(),
    jsonb_build_object(
      'invoice_required',false,
      'reason','no_costs_incurred'
    )
  );

  insert into public.work_order_events(
    work_order_id,workshop_id,event_type,visibility,actor_user_id
  )
  values(
    w.id,w.workshop_id,'ready_for_pickup','both',auth.uid()
  );

  insert into public.audit_events(
    workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id
  )
  values(
    w.workshop_id,w.id,auth.uid(),'no_costs_incurred','work_order',w.id::text
  );

  insert into public.notifications(
    user_id,workshop_id,work_order_id,title,body,kind
  )
  values(
    w.customer_user_id,
    w.workshop_id,
    w.id,
    'Fahrzeug abholbereit',
    'Für diesen Auftrag sind keine Kosten entstanden. Dein Fahrzeug ist jetzt abholbereit.',
    'order'
  );

  return w;
end;
$$;

revoke all on function public.mark_no_costs_and_ready_for_pickup(uuid) from public;
grant execute on function public.mark_no_costs_and_ready_for_pickup(uuid) to authenticated;
