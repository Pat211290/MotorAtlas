drop policy if exists profiles_linked_workshop_select on public.profiles;
drop policy if exists profiles_self_select on public.profiles;

drop policy if exists customer_links_workshop_manage on public.customer_workshop_links;

create policy customer_links_workshop_insert
on public.customer_workshop_links
for insert
to authenticated
with check (has_workshop_permission(workshop_id, 'customers'));

create policy customer_links_workshop_update
on public.customer_workshop_links
for update
to authenticated
using (has_workshop_permission(workshop_id, 'customers'))
with check (has_workshop_permission(workshop_id, 'customers'));

create policy customer_links_workshop_delete
on public.customer_workshop_links
for delete
to authenticated
using (has_workshop_permission(workshop_id, 'customers'));
