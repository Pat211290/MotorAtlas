-- Public workshop contact details for customer quick contact.
alter table public.workshops
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website text;
