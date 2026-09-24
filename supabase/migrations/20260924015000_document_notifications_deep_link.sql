create or replace function public.publish_document(p_document_id uuid)
returns public.documents
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.documents;
  w public.work_orders;
  notification_title text;
  notification_body text;
begin
  select * into d from public.documents where id=p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if not public.has_workshop_permission(d.workshop_id,'documents') then raise exception 'not_authorized'; end if;
  if d.status<>'draft' then raise exception 'document_not_draft'; end if;
  if not exists(select 1 from public.document_versions v where v.document_id=d.id) then raise exception 'document_has_no_file'; end if;

  update public.documents
  set status='published',published_at=now()
  where id=d.id
  returning * into d;

  select * into w from public.work_orders where id=d.work_order_id for update;

  if d.document_type='quote' then
    if w.stage<>'awaiting_quote' then raise exception 'invalid_work_order_stage:%',w.stage; end if;
    update public.work_orders set stage='awaiting_customer_approval',updated_at=now() where id=w.id;
    insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
    values(w.id,w.workshop_id,'quote_published','both',auth.uid(),jsonb_build_object('document_id',d.id,'amount_total',d.amount_total));
    notification_title:='Neuer Kostenvoranschlag';
    notification_body:='Ein Kostenvoranschlag für dein Fahrzeug wurde bereitgestellt.';
  elsif d.document_type='invoice' then
    insert into public.work_order_events(work_order_id,workshop_id,event_type,visibility,actor_user_id,payload)
    values(w.id,w.workshop_id,'invoice_published','both',auth.uid(),jsonb_build_object('document_id',d.id,'amount_total',d.amount_total));
    notification_title:='Neue Rechnung';
    notification_body:='Eine Rechnung für dein Fahrzeug wurde bereitgestellt.';
  else
    notification_title:='Neues Dokument';
    notification_body:='Ein neues Dokument zu deinem Auftrag wurde bereitgestellt.';
  end if;

  insert into public.audit_events(workshop_id,work_order_id,actor_user_id,event_type,entity_type,entity_id,payload)
  values(d.workshop_id,d.work_order_id,auth.uid(),'document_published','document',d.id::text,jsonb_build_object('document_type',d.document_type));

  insert into public.notifications(user_id,workshop_id,work_order_id,title,body,kind,target_type,target_id)
  values(d.customer_user_id,d.workshop_id,d.work_order_id,notification_title,notification_body,'document','document',d.id);

  return d;
end;
$$;

revoke all on function public.publish_document(uuid) from public;
grant execute on function public.publish_document(uuid) to authenticated;
