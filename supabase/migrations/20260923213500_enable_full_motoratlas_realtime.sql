
do $$
declare
  t text;
  tables text[] := array[
    'workshops',
    'workshop_members',
    'workshop_customer_requests',
    'customer_workshop_links',
    'service_requests',
    'appointments',
    'vehicles',
    'work_orders',
    'work_order_events',
    'work_order_assignments',
    'diagnoses',
    'approvals',
    'documents',
    'document_versions',
    'notifications',
    'chat_threads',
    'chat_messages',
    'chat_read_state',
    'workshop_verification_documents'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1 from pg_tables
      where schemaname='public' and tablename=t
    ) and not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

alter table public.workshops replica identity full;
alter table public.workshop_members replica identity full;
alter table public.workshop_customer_requests replica identity full;
alter table public.customer_workshop_links replica identity full;
alter table public.service_requests replica identity full;
alter table public.appointments replica identity full;
alter table public.vehicles replica identity full;
alter table public.work_orders replica identity full;
alter table public.work_order_events replica identity full;
alter table public.work_order_assignments replica identity full;
alter table public.diagnoses replica identity full;
alter table public.approvals replica identity full;
alter table public.documents replica identity full;
alter table public.document_versions replica identity full;
alter table public.notifications replica identity full;
alter table public.chat_threads replica identity full;
alter table public.chat_messages replica identity full;
alter table public.chat_read_state replica identity full;
alter table public.workshop_verification_documents replica identity full;
