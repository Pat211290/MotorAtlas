-- Keep customer contact email available to authorized workshop relationships.
alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email=u.email
from auth.users u
where u.id=p.id
  and (p.email is null or p.email<>u.email);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,full_name,email,phone,street,postal_code,city,country_code)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.email,
    nullif(trim(new.raw_user_meta_data->>'phone'),''),
    nullif(trim(new.raw_user_meta_data->>'street'),''),
    nullif(trim(new.raw_user_meta_data->>'postal_code'),''),
    nullif(trim(new.raw_user_meta_data->>'city'),''),
    coalesce(nullif(trim(new.raw_user_meta_data->>'country_code'),''),'DE')
  )
  on conflict(id) do update set
    full_name=excluded.full_name,
    email=coalesce(excluded.email,public.profiles.email),
    phone=coalesce(public.profiles.phone,excluded.phone),
    street=coalesce(public.profiles.street,excluded.street),
    postal_code=coalesce(public.profiles.postal_code,excluded.postal_code),
    city=coalesce(public.profiles.city,excluded.city),
    updated_at=now();
  return new;
end;
$$;
