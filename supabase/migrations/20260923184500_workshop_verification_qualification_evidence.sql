-- MotorAtlas workshop verification and qualification evidence
alter table public.workshops
  add column if not exists verification_status text not null default 'not_requested',
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workshops_verification_status_check'
      and conrelid = 'public.workshops'::regclass
  ) then
    alter table public.workshops
      add constraint workshops_verification_status_check
      check (verification_status in ('not_requested','pending','needs_info','verified','rejected'));
  end if;
end $$;

create table if not exists public.workshop_verification_documents (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in (
    'business_registration','handwerksrolle','meisterbrief','industriemeister','techniker','other'
  )),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  sha256 text,
  detected_title text,
  detected_field text,
  detected_holder_name text,
  detected_issuer text,
  detected_awarded_at date,
  recognition_class text not null default 'unreviewed' check (recognition_class in (
    'unreviewed','direct_match','conditional_match','qualification_only','not_recognized'
  )),
  recognition_note text,
  ocr_confidence numeric,
  analysis_json jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in (
    'pending','accepted','needs_info','rejected'
  )),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_workshop_verification_documents_workshop
  on public.workshop_verification_documents(workshop_id, created_at desc);

alter table public.workshop_verification_documents enable row level security;

drop policy if exists workshop_verification_documents_member_select on public.workshop_verification_documents;
create policy workshop_verification_documents_member_select
on public.workshop_verification_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.workshops w
    where w.id = workshop_id
      and (w.owner_user_id = (select auth.uid()) or public.is_workshop_member(w.id))
  )
);

drop policy if exists workshop_verification_documents_owner_insert on public.workshop_verification_documents;
create policy workshop_verification_documents_owner_insert
on public.workshop_verification_documents
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.workshops w
    where w.id = workshop_id and w.owner_user_id = (select auth.uid())
  )
);

drop policy if exists workshop_verification_documents_owner_delete on public.workshop_verification_documents;
create policy workshop_verification_documents_owner_delete
on public.workshop_verification_documents
for delete
to authenticated
using (
  review_status = 'pending'
  and exists (
    select 1 from public.workshops w
    where w.id = workshop_id and w.owner_user_id = (select auth.uid())
  )
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'verification-documents',
  'verification-documents',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists verification_documents_storage_select on storage.objects;
create policy verification_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-documents'
  and exists (
    select 1
    from public.workshops w
    where w.id::text = (storage.foldername(name))[1]
      and (w.owner_user_id = (select auth.uid()) or public.is_workshop_member(w.id))
  )
);

drop policy if exists verification_documents_storage_insert on storage.objects;
create policy verification_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-documents'
  and exists (
    select 1
    from public.workshops w
    where w.id::text = (storage.foldername(name))[1]
      and w.owner_user_id = (select auth.uid())
  )
);

drop policy if exists verification_documents_storage_delete on storage.objects;
create policy verification_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'verification-documents'
  and exists (
    select 1
    from public.workshops w
    where w.id::text = (storage.foldername(name))[1]
      and w.owner_user_id = (select auth.uid())
  )
);

create or replace function public.protect_workshop_verification_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null
     and coalesce(auth.jwt()->>'role','') <> 'service_role'
     and (
       new.verified_at is distinct from old.verified_at
       or new.verification_status is distinct from old.verification_status
       or new.verification_requested_at is distinct from old.verification_requested_at
       or new.verification_review_note is distinct from old.verification_review_note
     ) then
    raise exception 'workshop verification state is managed by MotorAtlas';
  end if;
  return new;
end;
$$;

create or replace function public.request_workshop_verification(p_workshop_id uuid)
returns public.workshops
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.workshops;
begin
  if not exists (
    select 1 from public.workshops
    where id = p_workshop_id and owner_user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if not exists (
    select 1 from public.workshop_verification_documents
    where workshop_id = p_workshop_id
      and document_type = 'business_registration'
  ) then
    raise exception 'business registration evidence required';
  end if;

  update public.workshops
  set verification_status = 'pending',
      verification_requested_at = now(),
      verification_review_note = null,
      updated_at = now()
  where id = p_workshop_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.request_workshop_verification(uuid) from public;
grant execute on function public.request_workshop_verification(uuid) to authenticated;
