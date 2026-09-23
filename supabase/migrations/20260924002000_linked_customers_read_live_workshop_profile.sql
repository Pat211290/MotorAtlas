-- Let customers with an active relationship read current workshop contact/settings data.
drop policy if exists workshops_public_select on public.workshops;
create policy workshops_public_select
on public.workshops for select
to authenticated
using(
  (listed_publicly and verified_at is not null)
  or owner_user_id=(select auth.uid())
  or public.is_workshop_member(id)
  or exists(
    select 1
    from public.customer_workshop_links l
    where l.workshop_id=workshops.id
      and l.customer_user_id=(select auth.uid())
      and l.active
  )
);
