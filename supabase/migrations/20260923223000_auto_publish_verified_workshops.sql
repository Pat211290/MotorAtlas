-- Verified workshops are public by default and lose public listing when verification is revoked.
create or replace function public.sync_workshop_public_listing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.verification_status = 'verified' and new.verified_at is not null then
    new.listed_publicly := true;
  elsif old.verification_status = 'verified'
        and (new.verification_status <> 'verified' or new.verified_at is null) then
    new.listed_publicly := false;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_workshop_public_listing on public.workshops;
create trigger sync_workshop_public_listing
before insert or update of verification_status, verified_at on public.workshops
for each row
execute function public.sync_workshop_public_listing();
