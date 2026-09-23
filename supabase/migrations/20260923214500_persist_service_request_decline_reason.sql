-- Keep declined service requests visible to customers with the workshop reason.
alter table public.service_requests
  add column if not exists decline_reason text,
  add column if not exists declined_at timestamptz;

create or replace function public.decline_service_request(p_service_request_id uuid, p_reason text default null)
returns public.service_requests
language plpgsql
security definer
set search_path = public, motoratlas_private
as $$
declare
  r public.service_requests;
  uid uuid := (select auth.uid());
  reason_text text := coalesce(nullif(trim(p_reason),''),'Die Werkstatt kann diese Anfrage derzeit nicht annehmen.');
begin
  select * into r from public.service_requests where id=p_service_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if not motoratlas_private.has_workshop_permission(r.workshop_id,'requests',uid) then raise exception 'not_authorized'; end if;
  if r.status not in ('submitted','accepted','appointment_pending') then raise exception 'invalid_request_status:%',r.status; end if;

  update public.service_requests
     set status='declined',
         decline_reason=reason_text,
         declined_at=now(),
         updated_at=now()
   where id=r.id
   returning * into r;

  insert into public.notifications(user_id,workshop_id,title,body,kind)
  values(r.customer_user_id,r.workshop_id,'Anfrage abgelehnt',reason_text,'request');

  return r;
end;
$$;
